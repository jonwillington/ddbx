// Pure backtest compute — TS port of ddbx-app/PerformanceViewModel.swift `computeResult(...)`.
// No React, no fetch — inputs in, PerformanceResult out.

import type { Dealing } from "@/lib/api";

import {
  EMPTY_RESULT,
  type ContributorRow,
  type FxRate,
  type PerformanceResult,
  type PerformanceUniverse,
  type PortfolioPoint,
  type PriceBar,
  type StrategyConfig,
} from "./types";

import { isSuggestedDealing } from "@/lib/dealing-classify";

// MARK: - Universe matcher

export function matchesUniverse(
  deal: Dealing,
  universe: PerformanceUniverse,
): boolean {
  if (deal.tx_type !== "buy") return false;
  switch (universe) {
    case "every_buy":
      return true;
    case "suggested":
      return isSuggestedDealing(deal);
    case "significant":
      return deal.analysis?.rating === "significant";
    case "noteworthy":
      return deal.analysis?.rating === "noteworthy";
  }
}

// MARK: - Bar / FX search helpers (binary search over date-sorted arrays)

export function firstBarOnOrAfter(
  bars: PriceBar[],
  date: string,
): PriceBar | null {
  let lo = 0;
  let hi = bars.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (bars[mid].date < date) lo = mid + 1;
    else hi = mid;
  }

  return lo < bars.length ? bars[lo] : null;
}

export function lastBarOnOrBefore(
  bars: PriceBar[],
  date: string,
): PriceBar | null {
  let lo = 0;
  let hi = bars.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (bars[mid].date <= date) lo = mid + 1;
    else hi = mid;
  }

  return lo > 0 ? bars[lo - 1] : null;
}

export function lastFxRateOnOrBefore(
  rates: FxRate[],
  date: string,
): number | null {
  let lo = 0;
  let hi = rates.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (rates[mid].date <= date) lo = mid + 1;
    else hi = mid;
  }

  return lo > 0 ? rates[lo - 1].gbpPerUsd : null;
}

// Add `days` to an ISO date and return ISO. UTC arithmetic — sufficient for
// daily-bar matching; we don't care about wall-clock time here.
export function addDays(isoDate: string, days: number): string | null {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);

  return d.toISOString().slice(0, 10);
}

// USD bars → GBP-equivalent bars. FX is sparse (business days only); for each
// bar we use the last FX rate on or before its date. Drop bars with no prior
// rate — carrying forward forever would yield spurious GBP values for early
// dates outside the FX history.
export function convertBarsToGbp(bars: PriceBar[], fx: FxRate[]): PriceBar[] {
  const out: PriceBar[] = [];

  for (const bar of bars) {
    const rate = lastFxRateOnOrBefore(fx, bar.date);

    if (rate == null) continue;
    out.push({ date: bar.date, closePence: bar.closePence * rate });
  }

  return out;
}

// MARK: - Window cutoff

export function windowCutoff(days: number | null): string | null {
  if (days == null) return null;
  const d = new Date();

  d.setUTCDate(d.getUTCDate() - days);

  return d.toISOString().slice(0, 10);
}

// MARK: - Per-deal compute event

interface ComputeEvent {
  dealId: string;
  ticker: string;
  company: string;
  entryBarDate: string;
  entryPricePence: number;
  strategyShares: number;
  benchmarkShares: number;
  deployed: number;
  exitBarDate: string | null;
  exitPricePence: number | null;
  benchmarkExitPricePence: number | null;
}

// MARK: - Core compute

export function computeResult(args: {
  deals: Dealing[];
  config: StrategyConfig;
  priceCache: Map<string, PriceBar[]>;
  benchmarkBars: PriceBar[];
  amountPounds: number;
  horizonDays: number | null;
}): PerformanceResult {
  const { deals, priceCache, benchmarkBars, amountPounds, horizonDays } = args;

  if (deals.length === 0) return EMPTY_RESULT;

  const events: ComputeEvent[] = [];
  let droppedForData = 0;

  for (const deal of deals) {
    const disclosed = (deal.disclosed_date || deal.trade_date).slice(0, 10);

    const tickerBars = priceCache.get(deal.ticker);

    if (!tickerBars || tickerBars.length === 0) {
      droppedForData++;
      continue;
    }
    const entryBar = firstBarOnOrAfter(tickerBars, disclosed);

    if (!entryBar || entryBar.closePence <= 0) {
      droppedForData++;
      continue;
    }
    const benchEntryBar = firstBarOnOrAfter(benchmarkBars, disclosed);

    if (!benchEntryBar || benchEntryBar.closePence <= 0) {
      droppedForData++;
      continue;
    }

    const strategyShares = (amountPounds * 100) / entryBar.closePence;
    const benchmarkShares = (amountPounds * 100) / benchEntryBar.closePence;

    let exitBarDate: string | null = null;
    let exitPricePence: number | null = null;
    let benchmarkExitPricePence: number | null = null;

    if (horizonDays != null) {
      const targetDate = addDays(entryBar.date, horizonDays);

      if (targetDate) {
        const exitTickerBar = firstBarOnOrAfter(tickerBars, targetDate);
        const exitBenchBar = firstBarOnOrAfter(benchmarkBars, targetDate);

        if (exitTickerBar && exitBenchBar) {
          exitBarDate = exitTickerBar.date;
          exitPricePence = exitTickerBar.closePence;
          benchmarkExitPricePence = exitBenchBar.closePence;
        }
      }
    }

    events.push({
      dealId: deal.id,
      ticker: deal.ticker,
      company: deal.company,
      entryBarDate: entryBar.date,
      entryPricePence: entryBar.closePence,
      strategyShares,
      benchmarkShares,
      deployed: amountPounds,
      exitBarDate,
      exitPricePence,
      benchmarkExitPricePence,
    });
  }

  if (events.length === 0) {
    return {
      ...EMPTY_RESULT,
      excludedForDataCount: droppedForData,
    };
  }

  // Earliest entry → start of timeline. Use the benchmark bars (already
  // filtered for the relevant currency) as the canonical date axis.
  const earliest = events.reduce(
    (acc, e) => (e.entryBarDate < acc ? e.entryBarDate : acc),
    events[0].entryBarDate,
  );
  const timeline = benchmarkBars.filter((b) => b.date >= earliest);

  const stratPoints: PortfolioPoint[] = [];
  const benchPoints: PortfolioPoint[] = [];
  const deployedPoints: PortfolioPoint[] = [];

  for (const bar of timeline) {
    const d = bar.date;
    let stratValue = 0;
    let benchValue = 0;
    let deployedSoFar = 0;

    for (const event of events) {
      if (d < event.entryBarDate) continue;
      deployedSoFar += event.deployed;

      // Strategy leg
      if (
        event.exitBarDate != null &&
        d >= event.exitBarDate &&
        event.exitPricePence != null
      ) {
        stratValue += (event.strategyShares * event.exitPricePence) / 100;
      } else {
        const bars = priceCache.get(event.ticker);
        const px = bars ? lastBarOnOrBefore(bars, d) : null;

        if (px && px.closePence > 0) {
          stratValue += (event.strategyShares * px.closePence) / 100;
        } else {
          stratValue += event.deployed;
        }
      }

      // Benchmark leg (symmetric)
      if (
        event.exitBarDate != null &&
        d >= event.exitBarDate &&
        event.benchmarkExitPricePence != null
      ) {
        benchValue +=
          (event.benchmarkShares * event.benchmarkExitPricePence) / 100;
      } else {
        const px = lastBarOnOrBefore(benchmarkBars, d);

        if (px && px.closePence > 0) {
          benchValue += (event.benchmarkShares * px.closePence) / 100;
        } else {
          benchValue += event.deployed;
        }
      }
    }

    stratPoints.push({ date: d, value: stratValue });
    benchPoints.push({ date: d, value: benchValue });
    deployedPoints.push({ date: d, value: deployedSoFar });
  }

  const totalDeployed = events.reduce((acc, e) => acc + e.deployed, 0);

  const contributors: ContributorRow[] = events.map((event) => {
    const bars = priceCache.get(event.ticker);
    const latestTickerPrice =
      bars && bars.length > 0
        ? bars[bars.length - 1].closePence
        : event.entryPricePence;
    const closed = event.exitPricePence != null;
    const valuePx = event.exitPricePence ?? latestTickerPrice;
    const currentValue = (event.strategyShares * valuePx) / 100;
    const returnPct = (currentValue - event.deployed) / event.deployed;

    return {
      dealId: event.dealId,
      ticker: event.ticker,
      company: event.company,
      entryDate: event.entryBarDate,
      entryPricePence: event.entryPricePence,
      exitDate: event.exitBarDate,
      exitPricePence: event.exitPricePence,
      deployed: event.deployed,
      currentValue,
      returnPct,
      state: closed ? "closed" : "open",
    };
  });

  contributors.sort(
    (a, b) =>
      Math.abs(b.currentValue - b.deployed) -
      Math.abs(a.currentValue - a.deployed),
  );

  return {
    strategy: stratPoints,
    benchmark: benchPoints,
    deployed: deployedPoints,
    contributors,
    totalDeployed,
    excludedForDataCount: droppedForData,
    dealCount: events.length,
  };
}
