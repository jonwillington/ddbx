import type { Env } from "../index";
import type { Analysis, Dealing, TriageVerdict } from "./types";

// ---- ID + hash helpers ----------------------------------------------------

export function directorIdFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `dir-${slug}`;
}

export async function hashDealing(parts: {
  trade_date: string;
  director_id: string;
  ticker: string;
  shares: number;
  price_pence: number;
}): Promise<string> {
  const str = `${parts.trade_date}|${parts.director_id}|${parts.ticker}|${parts.shares}|${parts.price_pence}`;
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- Upserts --------------------------------------------------------------

export async function upsertDirector(
  env: Env,
  d: Dealing["director"],
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO directors (id, name, normalized_name, role, company_primary)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET
       role = COALESCE(excluded.role, directors.role),
       company_primary = COALESCE(excluded.company_primary, directors.company_primary)`,
  )
    .bind(d.id, d.name, d.name.toLowerCase(), d.role, d.company)
    .run();
}

// Returns true if the dealing was freshly inserted (i.e. not a dupe).
export async function insertDealing(env: Env, d: Dealing): Promise<boolean> {
  const hash = d.id.replace(/^d-/, "");
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO dealings
       (id, hash, trade_date, disclosed_date, director_id, ticker, company,
        tx_type, shares, price_pence, value_gbp, raw_json)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
  )
    .bind(
      d.id,
      hash,
      d.trade_date,
      d.disclosed_date,
      d.director.id,
      d.ticker,
      d.company,
      d.tx_type,
      d.shares,
      d.price_pence,
      d.value_gbp,
      JSON.stringify(d),
    )
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function upsertTicker(
  env: Env,
  opts: { ticker: string; company: string; disclosed_date: string },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO tickers (ticker, company_name, exchange, first_seen_at, last_seen_at)
     VALUES (?1, ?2, 'LSE', ?3, ?3)
     ON CONFLICT(ticker) DO UPDATE SET
       company_name  = excluded.company_name,
       first_seen_at = min(tickers.first_seen_at, excluded.first_seen_at),
       last_seen_at  = max(tickers.last_seen_at,  excluded.last_seen_at)`,
  )
    .bind(opts.ticker, opts.company, opts.disclosed_date)
    .run();
}

export async function insertTriage(
  env: Env,
  dealingId: string,
  result: { verdict: TriageVerdict; reason: string },
  usage: { model: string; tokens_in: number; tokens_out: number },
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO triage
       (dealing_id, verdict, reason, model, tokens_in, tokens_out)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      dealingId,
      result.verdict,
      result.reason,
      usage.model,
      usage.tokens_in,
      usage.tokens_out,
    )
    .run();
}

export async function insertAnalysis(
  env: Env,
  dealingId: string,
  a: Analysis,
  usage: { model: string; tokens_in: number; tokens_out: number },
): Promise<void> {
  // We also write the joined thesis_points to the legacy `thesis` column so
  // any older code reading that field still gets something readable. The
  // canonical source going forward is `thesis_points_json`.
  const thesisLegacy = a.thesis_points.join("\n\n");
  await env.DB.prepare(
    `INSERT OR REPLACE INTO analyses
       (dealing_id, rating, confidence, summary, thesis, thesis_points_json,
        evidence_for_json, evidence_against_json, risks_json, catalyst_window,
        checklist_json, rating_rationale,
        model, tokens_in, tokens_out)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
  )
    .bind(
      dealingId,
      a.rating,
      a.confidence,
      a.summary,
      thesisLegacy,
      JSON.stringify(a.thesis_points),
      JSON.stringify(a.evidence_for),
      JSON.stringify(a.evidence_against),
      JSON.stringify(a.key_risks),
      a.catalyst_window,
      a.checklist ? JSON.stringify(a.checklist) : null,
      a.rating_rationale ?? null,
      usage.model,
      usage.tokens_in,
      usage.tokens_out,
    )
    .run();
}

export async function updateCompanyProfile(
  env: Env,
  ticker: string,
  profile: {
    description: string;
    sector: string;
    website?: string;
    key_facts: string[];
  },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE tickers
        SET description = ?2,
            sector = ?3,
            website = ?4,
            profile_json = ?5,
            profile_updated_at = datetime('now')
      WHERE ticker = ?1`,
  )
    .bind(
      ticker,
      profile.description,
      profile.sector,
      profile.website ?? null,
      JSON.stringify(profile),
    )
    .run();
}

export async function getTickerProfileAge(
  env: Env,
  ticker: string,
): Promise<{ exists: boolean; updated_at: string | null }> {
  const row = await env.DB.prepare(
    `SELECT profile_updated_at FROM tickers WHERE ticker = ?1`,
  )
    .bind(ticker)
    .first<{ profile_updated_at: string | null }>();
  if (!row) return { exists: false, updated_at: null };
  return { exists: true, updated_at: row.profile_updated_at };
}

// ---- Extraction cache -----------------------------------------------------

export async function getCachedExtraction(
  env: Env,
  url: string,
): Promise<{ is_open_market_buy: boolean; extracted: any } | null> {
  const row = await env.DB.prepare(
    `SELECT is_open_market_buy, extracted_json FROM extractions WHERE url = ?1`,
  )
    .bind(url)
    .first<{ is_open_market_buy: number; extracted_json: string | null }>();
  if (!row) return null;
  return {
    is_open_market_buy: row.is_open_market_buy === 1,
    extracted: row.extracted_json ? JSON.parse(row.extracted_json) : null,
  };
}

export async function putCachedExtraction(
  env: Env,
  url: string,
  isOpenMarketBuy: boolean,
  extracted: unknown,
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO extractions (url, is_open_market_buy, extracted_json)
     VALUES (?1, ?2, ?3)`,
  )
    .bind(url, isOpenMarketBuy ? 1 : 0, JSON.stringify(extracted))
    .run();
}

// ---- Pipeline run observability -------------------------------------------

export async function startPipelineRun(
  env: Env,
  stage: string,
): Promise<string> {
  const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    `INSERT INTO pipeline_runs (id, stage, started_at, status)
     VALUES (?1, ?2, datetime('now'), 'running')`,
  )
    .bind(id, stage)
    .run();
  return id;
}

export async function finishPipelineRun(
  env: Env,
  id: string,
  status: "ok" | "error",
  metrics: Record<string, unknown>,
  error?: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE pipeline_runs
       SET finished_at = datetime('now'),
           status = ?2,
           error = ?3,
           metrics_json = ?4
     WHERE id = ?1`,
  )
    .bind(id, status, error ?? null, JSON.stringify(metrics))
    .run();
}
