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
