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
import {
  getUkNews,
  refreshUkNews,
  ukNewsIsStale,
} from "./pipeline/uk-news";
import { postDailySummary, sendTweet, type DailySummaryDealing, type Session } from "./pipeline/twitter";
import { sendDigestPush } from "./pipeline/apns";
import { FIXTURES } from "./fixtures";

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  APP_ENV: string;
  // APNs push notification secrets (set via `wrangler secret put`)
  APNS_KEY_ID: string;
  APNS_TEAM_ID: string;
  APNS_PRIVATE_KEY: string;
  APNS_BUNDLE_ID?: string; // defaults to "uk.ddbx.app"
  // X OAuth 2.0 User Context Bearer token (set via `wrangler secret put`)
  TWITTER_OAUTH2_ACCESS_TOKEN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.get("/api/version", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT MAX(created_at) AS latest, COUNT(*) AS total FROM dealings`,
  ).first<{ latest: string | null; total: number }>();
  c.header("Cache-Control", "public, max-age=15");
  return c.json({ latest: row?.latest ?? null, total: row?.total ?? 0 });
});

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

// Returns daily close prices for a ticker over the last N days (default 90).
// Checks D1 cache first; falls back to Yahoo Finance and caches the result.
app.get("/api/prices/history", async (c) => {
  const ticker = c.req.query("ticker");
  const days = Math.max(14, Math.min(365, Number(c.req.query("days") ?? 90)));
  if (!ticker) return c.json({ bars: [] });

  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const cached = await c.env.DB.prepare(
      `SELECT date, close_pence FROM prices WHERE ticker = ?1 AND date >= ?2 ORDER BY date ASC`,
    )
      .bind(ticker, cutoff)
      .all<{ date: string; close_pence: number }>();

    // Use cache if we have at least half the expected trading days
    if (cached.results.length >= Math.floor(days * 0.35)) {
      return c.json({ bars: cached.results });
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - days * 24 * 3600;
    const bars = await fetchDailyBars(ticker, from, now);
    await cacheBars(c.env, ticker, bars);
    return c.json({ bars });
  } catch {
    return c.json({ bars: [] });
  }
});

// Returns the most recent price for a ticker at or before a given date.
// Used by the frontend to look up benchmark entry prices for a dealing.
app.get("/api/prices/on", async (c) => {
  const ticker = c.req.query("ticker");
  const date = c.req.query("date");
  if (!ticker || !date) return c.json({ price: null });
  try {
    const row = await c.env.DB.prepare(
      `SELECT close_pence FROM prices WHERE ticker = ?1 AND date <= ?2 ORDER BY date DESC LIMIT 1`,
    )
      .bind(ticker, date)
      .first<{ close_pence: number }>();
    return c.json({ price: row?.close_pence ?? null });
  } catch {
    return c.json({ price: null });
  }
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

// UK-focused business headlines (BBC, Guardian, City AM, This is Money RSS).
// Cached in D1; refreshed on the 15-minute cron and when stale on read.
app.get("/api/news/uk", async (c) => {
  try {
    if (await ukNewsIsStale(c.env)) {
      try {
        await refreshUkNews(c.env);
      } catch (err) {
        console.error(`news/uk refresh: ${(err as Error).message}`);
      }
    }
    const data = await getUkNews(c.env);
    return c.json(data);
  } catch {
    return c.json({ items: [], fetched_at: null });
  }
});

// ---- Device token registration for APNs push notifications -----------------

app.post("/api/devices", async (c) => {
  const body = await c.req.json<{
    token: string;
    environment?: string;
    timezone?: string;
    notify_level?: string;
    digest_enabled?: boolean;
  }>();

  if (!body.token || typeof body.token !== "string") {
    return c.json({ error: "token is required" }, 400);
  }

  const env = body.environment === "production" ? "production" : "sandbox";
  const tz = body.timezone ?? "Europe/London";
  const notifyLevel = body.notify_level === "none" || body.notify_level === "all"
    ? body.notify_level
    : "noteworthy";
  const digestEnabled = body.digest_enabled === false ? 0 : 1;

  await c.env.DB.prepare(
    `INSERT INTO device_tokens (token, environment, timezone, notify_level, digest_enabled, active, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 1, datetime('now'))
     ON CONFLICT(token) DO UPDATE SET
       environment = excluded.environment,
       timezone = excluded.timezone,
       notify_level = excluded.notify_level,
       digest_enabled = excluded.digest_enabled,
       active = 1,
       updated_at = datetime('now')`,
  )
    .bind(body.token, env, tz, notifyLevel, digestEnabled)
    .run();

  return c.json({ ok: true });
});

app.delete("/api/devices", async (c) => {
  const body = await c.req.json<{ token: string }>();
  if (!body.token) return c.json({ error: "token is required" }, 400);

  await c.env.DB.prepare(
    `UPDATE device_tokens SET active = 0 WHERE token = ?1`,
  )
    .bind(body.token)
    .run();

  return c.json({ ok: true });
});

// Manual refresh (e.g. after deploying the news table).
app.post("/__cron/refresh-news", async (c) => {
  try {
    const r = await refreshUkNews(c.env);
    return c.json(r);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
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
  const skipPush = c.req.query("skip_push") === "1";
  const result = await runDailySummary(c.env, date, session, { skipPush });
  return c.json(result);
});

// Tweet-only smoke test — verifies OAuth credentials without sending pushes.
// POST /__test-tweet?text=Hello+world  (text is optional; defaults to timestamp)
app.post("/__test-tweet", async (c) => {
  const text =
    c.req.query("text") ??
    `DDBX pipeline check · ${new Date().toISOString()}`;
  try {
    await sendTweet(c.env, text);
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 500);
  }
  return c.json({ ok: true, text });
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


app.post("/__fix-price", async (c) => {
  const id = c.req.query("id");
  const pence = Number(c.req.query("price_pence"));
  if (!id || !pence || isNaN(pence)) return c.json({ error: "id and price_pence required" }, 400);
  await c.env.DB.prepare("UPDATE dealings SET price_pence = ?1 WHERE id = ?2").bind(pence, id).run();
  return c.json({ ok: true, id, price_pence: pence });
});

app.get("/", (c) =>
  c.text("director-dealings worker. See /api/dealings.")
);

async function runDailySummary(
  env: Env,
  date: string,
  session: Session,
  opts: { skipPush?: boolean } = {},
) {
  // Round-up uses disclosure date, not trade date: directors have up to
  // 4 business days to disclose, so `trade_date = today` is empty most days.
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

  // Tweet and push are independent — a failure in one must not kill the other.
  const [tweetSettled, pushSettled] = await Promise.allSettled([
    postDailySummary(env, { date, session, dealings }),
    opts.skipPush
      ? Promise.resolve({ sent: 0, failed: 0, skipped: true as const })
      : sendDigestPush(env, { date, session, dealings }),
  ]);

  const tweetResult = tweetSettled.status === "fulfilled"
    ? tweetSettled.value
    : (console.error(`[cron] tweet error: ${tweetSettled.reason?.message ?? tweetSettled.reason}`),
       { posted: false, text: null });

  const pushResult = pushSettled.status === "fulfilled"
    ? pushSettled.value
    : (console.error(`[cron] digest push error: ${pushSettled.reason?.message ?? pushSettled.reason}`),
       { sent: 0, failed: 0 });

  return { date, session, total: dealings.length, ...tweetResult, push: pushResult };
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
      console.log(`[cron] tweet cron fired: ${event.cron} → ${session} ${date}`);
      ctx.waitUntil(
        runDailySummary(env, date, session)
          .then((r) => console.log(`[cron] tweet done:`, JSON.stringify(r)))
          .catch((err) => console.error(`[cron] tweet error:`, (err as Error).message)),
      );
      return;
    }
    console.log(`[cron] pipeline cron fired: ${event.cron}`);
    ctx.waitUntil(
      Promise.all([
        runPipeline(env)
          .then((r) => console.log(`[cron] pipeline done:`, JSON.stringify(r)))
          .catch((err) => console.error(`[cron] pipeline error:`, (err as Error).message)),
        refreshUkNews(env)
          .then((r) => console.log(`[cron] uk news done:`, JSON.stringify(r)))
          .catch((err) => console.error(`[cron] uk news error:`, (err as Error).message)),
      ]),
    );
  },
};
