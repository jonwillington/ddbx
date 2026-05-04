import type { Env } from "../index";

// Frankfurter — free, ECB-sourced FX rates, no auth required.
// Range endpoint: GET /<from>..<to>?from=USD&to=GBP
// Response shape: { amount, base, start_date, end_date, rates: { "YYYY-MM-DD": { GBP: 0.78 } } }
const FRANKFURTER_BASE = "https://api.frankfurter.app";

export interface FxRow {
  date: string; // YYYY-MM-DD
  gbp_per_usd: number;
}

// Fetch GBP-per-USD rates between two ISO dates (inclusive).
export async function fetchFrankfurterRates(
  fromIso: string,
  toIso: string,
): Promise<FxRow[]> {
  const url = `${FRANKFURTER_BASE}/${fromIso}..${toIso}?from=USD&to=GBP`;
  const res = await fetch(url, {
    headers: { "User-Agent": "director-dealings/1.0" },
  });

  if (!res.ok) throw new Error(`frankfurter ${res.status}`);
  const json = (await res.json()) as {
    rates?: Record<string, { GBP?: number }>;
  };
  const rates = json.rates ?? {};
  const out: FxRow[] = [];

  for (const [date, obj] of Object.entries(rates)) {
    const v = obj?.GBP;

    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out.push({ date, gbp_per_usd: v });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return out;
}

export async function cacheFxRates(env: Env, rows: FxRow[]): Promise<void> {
  if (rows.length === 0) return;
  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO fx_rates (date, gbp_per_usd) VALUES (?1, ?2)`,
  );

  await env.DB.batch(rows.map((r) => stmt.bind(r.date, r.gbp_per_usd)));
}

/**
 * GBP-per-USD lookup mirroring {@link getEurGbpRates}, used by EUR/USD-aware
 * price ingest. Reads the existing fx_rates table, backfills from Frankfurter
 * on thin coverage.
 */
export async function getUsdGbpRates(
  env: Env,
  dates: string[],
): Promise<Map<string, number>> {
  if (dates.length === 0) return new Map();
  const sorted = [...dates].sort();
  const fromIso = sorted[0];
  const toIso = sorted[sorted.length - 1];

  const cached = await env.DB.prepare(
    `SELECT date, gbp_per_usd FROM fx_rates
       WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC`,
  )
    .bind(fromIso, toIso)
    .all<{ date: string; gbp_per_usd: number }>();

  const map = new Map<string, number>();
  for (const r of cached.results) map.set(r.date, r.gbp_per_usd);

  const expected = Math.floor(dates.length * 0.5);
  if (map.size < expected) {
    try {
      const fresh = await fetchFrankfurterRates(fromIso, toIso);
      await cacheFxRates(env, fresh);
      for (const r of fresh) map.set(r.date, r.gbp_per_usd);
    } catch (err) {
      console.log(`fx usd refresh failed: ${(err as Error).message}`);
    }
  }

  return map;
}

// ---- EUR -----------------------------------------------------------------
//
// Stored in a separate table from fx_rates so the existing NOT NULL
// gbp_per_usd contract on that table doesn't need to be relaxed for an
// EUR-only date.

export interface FxEurRow {
  date: string; // YYYY-MM-DD
  gbp_per_eur: number;
}

export async function fetchFrankfurterEurRates(
  fromIso: string,
  toIso: string,
): Promise<FxEurRow[]> {
  const url = `${FRANKFURTER_BASE}/${fromIso}..${toIso}?from=EUR&to=GBP`;
  const res = await fetch(url, {
    headers: { "User-Agent": "director-dealings/1.0" },
  });
  if (!res.ok) throw new Error(`frankfurter eur ${res.status}`);
  const json = (await res.json()) as {
    rates?: Record<string, { GBP?: number }>;
  };
  const rates = json.rates ?? {};
  const out: FxEurRow[] = [];
  for (const [date, obj] of Object.entries(rates)) {
    const v = obj?.GBP;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out.push({ date, gbp_per_eur: v });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export async function cacheFxEurRates(
  env: Env,
  rows: FxEurRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO fx_rates_eur (date, gbp_per_eur) VALUES (?1, ?2)`,
  );
  await env.DB.batch(rows.map((r) => stmt.bind(r.date, r.gbp_per_eur)));
}

/**
 * Resolve GBP-per-EUR for each requested date. Backfills cache on misses
 * from Frankfurter. Frankfurter publishes weekday-only ECB rates, so the
 * map can have gaps — callers should fall back to the most recent prior
 * rate via {@link nearestPriorRate}.
 */
export async function getEurGbpRates(
  env: Env,
  dates: string[],
): Promise<Map<string, number>> {
  if (dates.length === 0) return new Map();
  const sorted = [...dates].sort();
  const fromIso = sorted[0];
  const toIso = sorted[sorted.length - 1];

  const cached = await env.DB.prepare(
    `SELECT date, gbp_per_eur FROM fx_rates_eur
       WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC`,
  )
    .bind(fromIso, toIso)
    .all<{ date: string; gbp_per_eur: number }>();

  const map = new Map<string, number>();
  for (const r of cached.results) map.set(r.date, r.gbp_per_eur);

  // ~70% calendar coverage is what a full Frankfurter range looks like
  // (weekdays only). Refresh when below half.
  const expected = Math.floor(dates.length * 0.5);
  if (map.size < expected) {
    try {
      const fresh = await fetchFrankfurterEurRates(fromIso, toIso);
      await cacheFxEurRates(env, fresh);
      for (const r of fresh) map.set(r.date, r.gbp_per_eur);
    } catch (err) {
      console.log(`fx eur refresh failed: ${(err as Error).message}`);
    }
  }

  return map;
}

export function nearestPriorRate(
  map: Map<string, number>,
  date: string,
): number | null {
  if (map.has(date)) return map.get(date) ?? null;
  let prior: string | null = null;
  for (const d of map.keys()) {
    if (d <= date && (prior == null || d > prior)) prior = d;
  }
  return prior ? (map.get(prior) ?? null) : null;
}
