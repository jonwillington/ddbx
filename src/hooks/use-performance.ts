// React port of ddbx-app's PerformanceViewModel. Owns the strategy config,
// price/benchmark/FX caches, and the recompute scheduling. Components consume
// `result`, `isComputing`, and the setters.

import type { Dealing } from "@/lib/api";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import {
  AMOUNTS,
  BENCHMARKS,
  EMPTY_RESULT,
  EXIT_RULES,
  TIME_WINDOWS,
  type FxRate,
  type MarketBenchmark,
  type PerformanceResult,
  type PriceBar,
  type StrategyConfig,
} from "@/lib/performance/types";
import {
  computeResult,
  convertBarsToGbp,
  matchesUniverse,
  windowCutoff,
} from "@/lib/performance/compute";
import { loadConfig, saveConfig } from "@/lib/performance/persistence";

const DEBOUNCE_MS = 250;
/** Minimum wall-clock time isComputing stays true so knob tweaks read as a
 * clear transition rather than an instant swap — even when caches are warm. */
const MIN_VISIBLE_COMPUTE_MS = 500;

const PRICE_HISTORY_DAYS = 730;

export interface UsePerformance {
  config: StrategyConfig;
  result: PerformanceResult;
  isComputing: boolean;
  error: string | null;
  setConfig: (
    next: StrategyConfig | ((prev: StrategyConfig) => StrategyConfig),
  ) => void;
  excludeDeal: (dealId: string) => void;
  resetExclusions: () => void;
}

interface MutRef<T> {
  current: T;
}

export function usePerformance(deals: Dealing[] | null): UsePerformance {
  const [config, setConfigState] = useState<StrategyConfig>(loadConfig);
  const [result, setResult] = useState<PerformanceResult>(EMPTY_RESULT);
  const [isComputing, setIsComputing] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Mutable caches — survive re-renders, never trigger one.
  const priceCacheRef = useRef<Map<string, PriceBar[]>>(new Map());
  // Cached per benchmark ticker. For USD benchmarks the stored bars are
  // already converted to GBP, so downstream compute is unit-agnostic.
  const benchmarkCacheRef = useRef<Map<string, PriceBar[]>>(new Map());
  const fxRatesRef = useRef<FxRate[]>([]);

  // Monotonic run ID — captured at the start of each scheduleRecompute task;
  // any later check `runIdRef.current !== captured` means a newer run started
  // and the current one should bail.
  const runIdRef = useRef<number>(0);

  const setConfig = useCallback<UsePerformance["setConfig"]>((next) => {
    setConfigState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;

      saveConfig(resolved);

      return resolved;
    });
  }, []);

  const excludeDeal = useCallback((dealId: string) => {
    setConfigState((prev) => {
      if (prev.excludedDealIds.has(dealId)) return prev;
      const nextSet = new Set(prev.excludedDealIds);

      nextSet.add(dealId);

      return { ...prev, excludedDealIds: nextSet };
    });
  }, []);

  const resetExclusions = useCallback(() => {
    setConfigState((prev) => {
      if (prev.excludedDealIds.size === 0) return prev;

      return { ...prev, excludedDealIds: new Set<string>() };
    });
  }, []);

  // Schedule a recompute whenever the input set changes. Debouncing is built
  // into the run loop below so multiple fast knob tweaks coalesce.
  useEffect(() => {
    if (deals == null) return; // dealings still loading

    const runId = ++runIdRef.current;
    const start = Date.now();

    setIsComputing(true);

    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    const isStale = () => cancelled || runIdRef.current !== runId;

    (async () => {
      // Debounce — if a newer run starts during this sleep we bail.
      await sleep(DEBOUNCE_MS);
      if (isStale()) return;

      const next = await performCompute({
        deals,
        config,
        priceCache: priceCacheRef.current,
        benchmarkCache: benchmarkCacheRef.current,
        fxRatesRef,
        isStale,
      });

      if (isStale()) return;

      if ("error" in next) {
        setError(next.error);
        setResult(EMPTY_RESULT);
      } else {
        setError(null);
        setResult(next.result);
      }

      // Hold the shimmer for at least MIN_VISIBLE_COMPUTE_MS so the
      // transition is perceivable on cache-warm recomputes.
      const elapsed = Date.now() - start;
      const remaining = MIN_VISIBLE_COMPUTE_MS - elapsed;

      if (remaining > 0) await sleep(remaining);
      if (isStale()) return;
      setIsComputing(false);
    })();

    return cancel;
  }, [deals, config]);

  return {
    config,
    result,
    isComputing,
    error,
    setConfig,
    excludeDeal,
    resetExclusions,
  };
}

// ----------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ComputeArgs {
  deals: Dealing[];
  config: StrategyConfig;
  priceCache: Map<string, PriceBar[]>;
  benchmarkCache: Map<string, PriceBar[]>;
  fxRatesRef: MutRef<FxRate[]>;
  isStale: () => boolean;
}

type ComputeOutcome = { result: PerformanceResult } | { error: string };

async function performCompute(args: ComputeArgs): Promise<ComputeOutcome> {
  const { deals, config, priceCache, benchmarkCache, fxRatesRef, isStale } =
    args;
  const benchmark: MarketBenchmark = config.benchmark;
  const benchmarkInfo = BENCHMARKS[benchmark];

  const cutoff = windowCutoff(TIME_WINDOWS[config.timeWindow].days);
  const filtered = deals.filter((d) => {
    if (!matchesUniverse(d, config.universe)) return false;
    if (config.excludedDealIds.has(d.id)) return false;
    const date = (d.disclosed_date || d.trade_date).slice(0, 10);

    if (cutoff != null && date < cutoff) return false;

    return true;
  });

  if (filtered.length === 0) {
    // Stable empty state — fewer surprises than EMPTY_RESULT-with-error.
    return { result: { ...EMPTY_RESULT, dealCount: 0 } };
  }

  const tickers = Array.from(new Set(filtered.map((d) => d.ticker)));

  await fetchMissing({
    tickers,
    benchmark,
    priceCache,
    benchmarkCache,
    fxRatesRef,
  });

  if (isStale()) return { result: EMPTY_RESULT };

  const benchBars = benchmarkCache.get(benchmarkInfo.ticker) ?? [];

  if (benchBars.length === 0) {
    return {
      error: benchmarkInfo.isGbp
        ? "Benchmark price data unavailable."
        : "Benchmark or FX data unavailable — try again in a moment.",
    };
  }

  const result = computeResult({
    deals: filtered,
    config,
    priceCache,
    benchmarkBars: benchBars,
    amountPounds: AMOUNTS[config.amount].pounds,
    horizonDays: EXIT_RULES[config.exitRule].horizonDays,
  });

  return { result };
}

interface FetchArgs {
  tickers: string[];
  benchmark: MarketBenchmark;
  priceCache: Map<string, PriceBar[]>;
  benchmarkCache: Map<string, PriceBar[]>;
  fxRatesRef: MutRef<FxRate[]>;
}

async function fetchMissing(args: FetchArgs): Promise<void> {
  const { tickers, benchmark, priceCache, benchmarkCache, fxRatesRef } = args;
  const info = BENCHMARKS[benchmark];

  const missingTickers = tickers.filter((t) => !priceCache.has(t));
  const needsBench = !benchmarkCache.has(info.ticker);
  const needsFx = !info.isGbp && fxRatesRef.current.length === 0;

  if (missingTickers.length === 0 && !needsBench && !needsFx) return;

  const tickerFetches = missingTickers.map(async (ticker) => {
    try {
      const bars = await api.priceHistory(ticker, PRICE_HISTORY_DAYS);

      priceCache.set(ticker, toPriceBars(bars));
    } catch {
      priceCache.set(ticker, []);
    }
  });

  const benchFetch: Promise<void> = needsBench
    ? api
        .priceHistory(info.ticker, PRICE_HISTORY_DAYS)
        .then((bars) => {
          benchmarkCache.set(info.ticker, toPriceBars(bars));
        })
        .catch(() => {
          benchmarkCache.set(info.ticker, []);
        })
    : Promise.resolve();

  const fxFetch: Promise<void> = needsFx
    ? api
        .gbpPerUsdHistory(PRICE_HISTORY_DAYS)
        .then((rates) => {
          fxRatesRef.current = rates.map((r) => ({
            date: r.date,
            gbpPerUsd: r.gbp_per_usd,
          }));
        })
        .catch(() => {
          fxRatesRef.current = [];
        })
    : Promise.resolve();

  await Promise.all([...tickerFetches, benchFetch, fxFetch]);

  // For USD benchmarks, replace cached bars with GBP-equivalents. We do this
  // after both have landed so we always pick up the latest FX rates.
  if (!info.isGbp) {
    const raw = benchmarkCache.get(info.ticker);
    const fx = fxRatesRef.current;

    if (raw && raw.length > 0 && fx.length > 0) {
      // Detect if these bars are still raw USD (first conversion) vs already
      // converted GBP (re-fetch path). The benchmark cache only ever holds
      // either raw or converted; if needsBench was true, raw was just fetched
      // and needs converting. Otherwise the cache is already GBP and we skip.
      if (needsBench) {
        benchmarkCache.set(info.ticker, convertBarsToGbp(raw, fx));
      }
    }
  }
}

function toPriceBars(
  rows: { date: string; close_pence: number }[],
): PriceBar[] {
  return rows.map((r) => ({ date: r.date, closePence: r.close_pence }));
}
