// One-shot backfill for sic_codes + sector_normalized on the tickers table.
//
// Two-stage pipeline:
//   1. For every ticker missing sector_normalized, look up SIC codes via
//      Companies House (when COMPANIES_HOUSE_API_KEY is set) and apply the
//      deterministic SIC → ICB map.
//   2. For tickers with no Companies House match, batch the leftover
//      {ticker, sector} pairs into a single Opus call that emits
//      {ticker, sector_normalized} from the 11-value enum.
//
// Idempotent: filters on `sector_normalized IS NULL` each run, so safe to
// re-execute after fixing data.

import type { Env } from "../index";
import { callAnthropic } from "../llm/anthropic";
import {
  isSectorNormalized,
  SECTOR_NORMALIZED_VALUES,
  type SectorNormalized,
} from "../db/types";
import { fetchSicCodes } from "./companies-house";
import { pickIcbFromCodes } from "./sic-to-icb";

interface TickerRow {
  ticker: string;
  company_name: string | null;
  sector: string | null;
}

export interface BackfillResult {
  scanned: number;
  filled_from_sic: number;
  filled_from_llm: number;
  unresolved: string[];
  errors: string[];
}

export async function backfillSectorNormalized(
  env: Env,
  opts: { limit?: number } = {},
): Promise<BackfillResult> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200));
  const result: BackfillResult = {
    scanned: 0,
    filled_from_sic: 0,
    filled_from_llm: 0,
    unresolved: [],
    errors: [],
  };

  const rows = await env.DB.prepare(
    `SELECT ticker, company_name, sector
       FROM tickers
      WHERE sector_normalized IS NULL
      LIMIT ?1`,
  )
    .bind(limit)
    .all<TickerRow>();

  result.scanned = rows.results.length;
  if (rows.results.length === 0) return result;

  const remaining: TickerRow[] = [];

  // Stage 1 — Companies House lookup.
  for (const row of rows.results) {
    if (!row.company_name) {
      remaining.push(row);
      continue;
    }
    try {
      const codes = await fetchSicCodes(env, row.company_name, row.ticker);
      if (codes && codes.length > 0) {
        const icb = pickIcbFromCodes(codes);
        await env.DB.prepare(
          `UPDATE tickers
              SET sic_codes = ?2,
                  sector_normalized = ?3
            WHERE ticker = ?1`,
        )
          .bind(row.ticker, JSON.stringify(codes), icb ?? null)
          .run();
        if (icb) {
          result.filled_from_sic++;
          continue;
        }
      }
      remaining.push(row);
    } catch (err) {
      result.errors.push(`${row.ticker} (CH): ${(err as Error).message}`);
      remaining.push(row);
    }
  }

  // Stage 2 — single batched Opus call for the rest.
  if (remaining.length > 0) {
    try {
      const filled = await llmBatchAssign(env, remaining);
      for (const [ticker, value] of filled) {
        await env.DB.prepare(
          `UPDATE tickers SET sector_normalized = ?2 WHERE ticker = ?1`,
        )
          .bind(ticker, value)
          .run();
        result.filled_from_llm++;
      }
      for (const row of remaining) {
        if (!filled.has(row.ticker)) result.unresolved.push(row.ticker);
      }
    } catch (err) {
      result.errors.push(`LLM batch: ${(err as Error).message}`);
      for (const row of remaining) result.unresolved.push(row.ticker);
    }
  }

  return result;
}

async function llmBatchAssign(
  env: Env,
  rows: TickerRow[],
): Promise<Map<string, SectorNormalized>> {
  const out = new Map<string, SectorNormalized>();
  if (rows.length === 0) return out;

  const list = rows.map((r) => ({
    ticker: r.ticker,
    company: r.company_name ?? "",
    free_form_sector: r.sector ?? "",
  }));

  const system = `You assign UK-listed companies to ICB top-level industries.

For each input row, pick exactly one value from this enum:
${SECTOR_NORMALIZED_VALUES.join(" | ")}

Rules:
- Use the company name and the free-form sector hint to decide.
- Do NOT invent values. If you cannot decide, omit the row.
- Return STRICT JSON only, no prose, shape: { "assignments": [ { "ticker": "...", "sector_normalized": "..." } ] }`;

  const resp = await callAnthropic(env, {
    model: "claude-opus-4-6",
    system,
    messages: [{ role: "user", content: JSON.stringify({ rows: list }) }],
    max_tokens: 4000,
  });

  const parsed = extractJson(resp.text);
  if (!parsed || !Array.isArray(parsed.assignments)) return out;

  for (const a of parsed.assignments) {
    if (typeof a?.ticker !== "string") continue;
    if (!isSectorNormalized(a.sector_normalized)) continue;
    out.set(a.ticker, a.sector_normalized);
  }
  return out;
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
