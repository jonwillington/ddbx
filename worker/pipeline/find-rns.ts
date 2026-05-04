import type { Env } from "../index";
import { directorIdFromName } from "../db/writes";

export interface FindRnsResult {
  matches: Record<string, string[]>;
  unmatched: string[];
}

/**
 * Joins dealings to the extractions cache by (director_id, trade_date) and
 * returns the announcement URL(s) per dealing id. Multiple URLs per dealing
 * are possible (same director, multiple trades on the same day) — caller
 * disambiguates by fetching each.
 *
 * The extractions table doesn't carry ticker or dealing_id, so we recompute
 * the director_id slug from the LLM-extracted director_name in each cached
 * row and match. Slow on a full scan but fine for handfuls of ids.
 */
export async function findRnsUrls(
  env: Env,
  ids: string[],
): Promise<FindRnsResult> {
  if (ids.length === 0) return { matches: {}, unmatched: [] };

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const dealings = await env.DB.prepare(
    `SELECT id, director_id, trade_date, ticker
       FROM dealings WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<{
      id: string;
      director_id: string;
      trade_date: string;
      ticker: string;
    }>();

  const wantedKeys = new Map<string, string[]>(); // "director_id|trade_date" -> [dealing_id]
  for (const d of dealings.results) {
    const k = `${d.director_id}|${d.trade_date}`;
    const list = wantedKeys.get(k) ?? [];
    list.push(d.id);
    wantedKeys.set(k, list);
  }

  const matches: Record<string, string[]> = {};
  for (const id of ids) matches[id] = [];

  // Walk extractions; recompute director_id from the LLM-extracted name.
  // For ~1k extractions this is fine; if the table grows huge we'd want a
  // proper join column.
  const extractions = await env.DB.prepare(
    `SELECT url, extracted_json FROM extractions WHERE extracted_json IS NOT NULL`,
  ).all<{ url: string; extracted_json: string }>();

  for (const row of extractions.results) {
    let parsed: { director_name?: string; trade_date?: string };
    try {
      parsed = JSON.parse(row.extracted_json);
    } catch {
      continue;
    }
    if (!parsed?.director_name || !parsed?.trade_date) continue;
    const key = `${directorIdFromName(parsed.director_name)}|${parsed.trade_date}`;
    const dealingIds = wantedKeys.get(key);
    if (!dealingIds) continue;
    for (const id of dealingIds) {
      if (!matches[id].includes(row.url)) matches[id].push(row.url);
    }
  }

  const unmatched = ids.filter((id) => matches[id].length === 0);
  return { matches, unmatched };
}
