import { Hono } from "hono";
import { cors } from "hono/cors";

import { runPipeline } from "./pipeline/run";
import { backfillDays } from "./pipeline/backfill";
import { analyzeDealing } from "./pipeline/analyze";
import { insertAnalysis } from "./db/writes";
import { getDealings, getDealingById } from "./db/queries";
import { getPortfolio } from "./db/portfolio";
import { getDirector } from "./db/directors";
import { fetchDailyBars, cacheBars } from "./pipeline/prices";
import { postDailySummary, type DailySummaryDealing, type Session } from "./pipeline/twitter";
import { FIXTURES } from "./fixtures";

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  APP_ENV: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.get("/api/dealings", async (c) => {
  const rating = c.req.query("rating");
  // Until D1 is wired up, fall back to fixtures so the frontend renders.
  try {
    const rows = await getDealings(c.env.DB, { rating });
    return c.json({ dealings: rows });
  } catch {
    /* fall through to fixtures if DB unavailable */
  }
  const filtered = rating
    ? FIXTURES.dealings.filter((d) => d.analysis?.rating === rating)
    : FIXTURES.dealings;
  return c.json({ dealings: filtered });
});

app.get("/api/dealings/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const row = await getDealingById(c.env.DB, id);
    if (row) return c.json(row);
  } catch {
    /* fall through to fixture */
  }
  const row = FIXTURES.dealings.find((d) => d.id === id);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

app.get("/api/portfolio", async (c) => {
  const fyParam = c.req.query("fy");
  const fy = fyParam ? Number(fyParam) : undefined;
  try {
    const p = await getPortfolio(c.env.DB, {
      fy: Number.isFinite(fy) ? fy : undefined,
    });
    if (p) return c.json(p);
  } catch {
    /* fall through */
  }
  return c.json(FIXTURES.portfolio);
});

app.get("/api/directors/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const d = await getDirector(c.env.DB, id);
    if (d) return c.json(d);
  } catch {
    /* fall through */
  }
  const d = FIXTURES.directors.find((x) => x.id === id);
  if (!d) return c.json({ error: "not found" }, 404);
  return c.json(d);
});

// Returns the most recent cached price for each requested ticker, fetching
// from Yahoo Finance (7-day window) for any with no cached price in the last 7 days.
app.get("/api/prices/latest", async (c) => {
  const raw = c.req.query("tickers") ?? "";
  const tickers = raw.split(",").map((t) => t.trim()).filter(Boolean);
  if (tickers.length === 0) return c.json({ prices: [] });

  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // SQLite limits numbered placeholders to 100, so chunk lookups.
  const CHUNK = 90;
  const cachedRows: { ticker: string; close_pence: number; date: string }[] = [];
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const chunk = tickers.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => `?${j + 1}`).join(",");
    const res = await c.env.DB.prepare(
      `SELECT ticker, close_pence, date
         FROM prices
        WHERE ticker IN (${placeholders})
          AND date >= ?${chunk.length + 1}
        ORDER BY ticker, date DESC`,
    )
      .bind(...chunk, cutoff)
      .all<{ ticker: string; close_pence: number; date: string }>();
    cachedRows.push(...res.results);
  }

  // Keep only the most recent row per ticker from the cache.
  const seen = new Set<string>();
  const results: { ticker: string; price_pence: number; date: string }[] = [];
  for (const r of cachedRows) {
    if (!seen.has(r.ticker)) {
      seen.add(r.ticker);
      results.push({ ticker: r.ticker, price_pence: r.close_pence, date: r.date });
    }
  }

  // Fetch from Yahoo Finance for any ticker not already covered.
  const missing = tickers.filter((t) => !seen.has(t));
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 24 * 3600;
  await Promise.allSettled(
    missing.map(async (ticker) => {
      try {
        const bars = await fetchDailyBars(ticker, weekAgo, now);
        if (bars.length === 0) return;
        await cacheBars(c.env, ticker, bars);
        const latest = bars[bars.length - 1];
        results.push({ ticker, price_pence: latest.close_pence, date: latest.date });
      } catch {
        // Skip tickers Yahoo Finance can't resolve — non-fatal.
      }
    }),
  );

  return c.json({ prices: results });
});

// Manual pipeline trigger (useful for local dev + ad-hoc re-runs).
app.post("/__cron/run", async (c) => {
  const result = await runPipeline(c.env);
  return c.json(result);
});

// Daily heartbeat tweet — posts a summary of the day's dealings so the
// account stays active even when nothing rated significant/noteworthy.
// Optional ?date=YYYY-MM-DD and ?session=morning|afternoon.
app.post("/__cron/daily", async (c) => {
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const session = (c.req.query("session") ?? "afternoon") as Session;
  const result = await runDailySummary(c.env, date, session);
  return c.json(result);
});

// Re-run Opus analysis on all dealings that already have an analysis row,
// using the current prompt. Safe to re-run — insertAnalysis does INSERT OR REPLACE.
// Optional ?limit=N caps how many are processed in one call (default 50).
app.post("/__reanalyze", async (c) => {
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") ?? 50)));
  const month = c.req.query("month"); // e.g. "2026-04"
  const dealings = await getDealings(c.env.DB);
  const toReanalyze = dealings
    .filter((d) => d.analysis !== undefined)
    .filter((d) => (month ? d.trade_date.startsWith(month) : true))
    .slice(0, limit);

  const errors: string[] = [];
  let updated = 0;

  for (const d of toReanalyze) {
    try {
      const result = await analyzeDealing(c.env, d);
      await insertAnalysis(c.env, d.id, result.analysis, result.usage);
      updated++;
    } catch (err) {
      errors.push(`${d.id}: ${(err as Error).message}`);
    }
  }

  return c.json({ total: toReanalyze.length, updated, errors });
});

// One-shot historical backfill. POST /__backfill?days=30&start=0
// `start` skips the most-recent N days so you can chunk: start=0,5,10…
// Safe to re-run — the extraction and dealings caches make it idempotent.
app.post("/__backfill", async (c) => {
  const days = Math.max(1, Math.min(365, Number(c.req.query("days") ?? 30)));
  const start = Math.max(0, Number(c.req.query("start") ?? 0));
  const result = await backfillDays(c.env, days, start);
  return c.json(result);
});


app.get("/", (c) =>
  c.text("director-dealings worker. See /api/dealings.")
);

async function runDailySummary(env: Env, date: string, session: Session) {
  const rows = await env.DB.prepare(
    `SELECT d.ticker, d.value_gbp, a.rating
       FROM dealings d
       LEFT JOIN analyses a ON a.dealing_id = d.id
      WHERE d.disclosed_date = ?1`,
  )
    .bind(date)
    .all<{ ticker: string; value_gbp: number; rating: string | null }>();

  const dealings: DailySummaryDealing[] = rows.results.map((r) => ({
    ticker: r.ticker,
    value_gbp: r.value_gbp,
    rating: r.rating,
  }));

  const result = await postDailySummary({ date, session, dealings });
  return { date, session, total: dealings.length, ...result };
}

const DAILY_CRONS: Record<string, Session> = {
  "30 12 * * 1-5": "morning",
  "30 17 * * 1-5": "afternoon",
};

export default {
  fetch: app.fetch,
  // Cloudflare Cron Trigger entrypoint. Routes on the cron expression so a
  // single worker can serve both the hourly pipeline and the daily tweets.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const session = DAILY_CRONS[event.cron];
    if (session) {
      const date = new Date().toISOString().slice(0, 10);
      ctx.waitUntil(runDailySummary(env, date, session).then(() => undefined));
      return;
    }
    ctx.waitUntil(runPipeline(env).then(() => undefined));
  },
};
