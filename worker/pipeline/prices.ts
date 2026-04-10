import type { Env } from "../index";

// Yahoo Finance chart API — free, supports LSE tickers as e.g. TSCO.L.
// We call it directly with fetch() instead of the yahoo-finance2 npm package
// because that package pulls in Node-only deps that don't run cleanly on
// Workers.
const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export interface DailyBar {
  date: string;      // YYYY-MM-DD
  close_pence: number;
}

export async function fetchDailyBars(
  ticker: string,
  fromUnix: number,
  toUnix: number,
): Promise<DailyBar[]> {
  const url = `${YF_BASE}/${encodeURIComponent(ticker)}?period1=${fromUnix}&period2=${toUnix}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 director-dealings/1.0" },
  });
  if (!res.ok) throw new Error(`yahoo ${res.status} for ${ticker}`);
  const json = (await res.json()) as YahooChartResponse;
  const result = json.chart?.result?.[0];
  if (!result) return [];
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  // Yahoo Finance returns LSE prices in GBp (pence) for most tickers but
  // GBP (pounds) for some. When currency is GBP we multiply by 100.
  // Index tickers (e.g. ^FTAS) are quoted in raw points — store the level
  // as-is and ignore the currency field, which Yahoo reports as "GBP".
  const isIndex = ticker.startsWith("^");
  const currency = result.meta?.currency ?? "GBp";
  const multiplier = isIndex ? 1 : currency === "GBP" ? 100 : 1;
  const bars: DailyBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    bars.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      close_pence: c * multiplier,
    });
  }
  return bars;
}

// Cache prices in D1 so performance recalculations are cheap.
export async function cacheBars(
  env: Env,
  ticker: string,
  bars: DailyBar[],
): Promise<void> {
  if (bars.length === 0) return;
  const stmt = env.DB.prepare(
    `INSERT OR REPLACE INTO prices (ticker, date, close_pence) VALUES (?1, ?2, ?3)`,
  );
  const batch = bars.map((b) => stmt.bind(ticker, b.date, b.close_pence));
  await env.DB.batch(batch);
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { currency?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
}
