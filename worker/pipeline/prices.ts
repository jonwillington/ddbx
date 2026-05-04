import type { Env } from "../index";
import {
  getEurGbpRates,
  getUsdGbpRates,
  nearestPriorRate,
} from "./fx";

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
  env: Env,
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
  // Yahoo Finance returns LSE prices in GBp (pence) for most tickers, GBP
  // (pounds) for some, and EUR for dual-listed Irish/Greek issues (KYGA,
  // MTLN). Index tickers (e.g. ^FTAS) are quoted in raw points — store the
  // level as-is and ignore the currency field, which Yahoo reports as "GBP".
  // Anything else (USD, etc.) gets skipped rather than silently mis-stored.
  const isIndex = ticker.startsWith("^");
  const currency = result.meta?.currency ?? "GBp";
  const dates = ts.map((t) => new Date(t * 1000).toISOString().slice(0, 10));

  // Yahoo's close[] array is occasionally off by 100× from regularMarketPrice
  // for individual tickers (observed on BPCP.L: regularMarketPrice=69.5 but
  // close[]=0.695, even though currency reports GBp). Normalise close[] to the
  // same scale as regularMarketPrice when there's a clear ratio mismatch.
  const rmp = result.meta?.regularMarketPrice;
  if (
    !isIndex &&
    typeof rmp === "number" &&
    rmp > 0 &&
    closes.length > 0
  ) {
    const lastClose = closes[closes.length - 1];
    if (typeof lastClose === "number" && lastClose > 0) {
      const ratio = rmp / lastClose;
      if (ratio > 50 && ratio < 200) {
        for (let i = 0; i < closes.length; i++) {
          if (closes[i] != null) closes[i] = (closes[i] as number) * 100;
        }
        console.log(
          `prices: ${ticker} close[] ×100 (last ${lastClose} -> ${lastClose * 100}, market ${rmp})`,
        );
      } else if (ratio > 0.005 && ratio < 0.02) {
        for (let i = 0; i < closes.length; i++) {
          if (closes[i] != null) closes[i] = (closes[i] as number) / 100;
        }
        console.log(
          `prices: ${ticker} close[] ÷100 (last ${lastClose} -> ${lastClose / 100}, market ${rmp})`,
        );
      }
    }
  }

  if (isIndex || currency === "GBp" || currency === "GBP") {
    const multiplier = isIndex ? 1 : currency === "GBP" ? 100 : 1;
    const bars: DailyBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      bars.push({ date: dates[i], close_pence: c * multiplier });
    }
    return bars;
  }

  if (currency === "USD") {
    const fxMap = await getUsdGbpRates(env, dates);
    const bars: DailyBar[] = [];
    let skippedNoFx = 0;
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      const fx = fxMap.get(dates[i]) ?? nearestPriorRate(fxMap, dates[i]);
      if (fx == null) {
        skippedNoFx++;
        continue;
      }
      bars.push({ date: dates[i], close_pence: c * fx * 100 });
    }
    if (skippedNoFx > 0) {
      console.log(
        `prices: ${ticker} dropped ${skippedNoFx}/${ts.length} bars (no USD/GBP rate)`,
      );
    }
    return bars;
  }

  if (currency === "EUR") {
    const fxMap = await getEurGbpRates(env, dates);
    const bars: DailyBar[] = [];
    let skippedNoFx = 0;
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      // Frankfurter publishes weekday-only ECB rates, so weekend bars need
      // to fall back to the most recent prior rate.
      const fx = fxMap.get(dates[i]) ?? nearestPriorRate(fxMap, dates[i]);
      if (fx == null) {
        skippedNoFx++;
        continue;
      }
      bars.push({ date: dates[i], close_pence: c * fx * 100 });
    }
    if (skippedNoFx > 0) {
      console.log(
        `prices: ${ticker} dropped ${skippedNoFx}/${ts.length} bars (no EUR/GBP rate)`,
      );
    }
    return bars;
  }

  console.log(`prices: skipping ${ticker} — unsupported currency ${currency}`);
  return [];
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
