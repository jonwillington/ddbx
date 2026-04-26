// Sticky knobs persisted to localStorage. excludedDealIds is intentionally
// session-only — users tweak it to see what-if and shouldn't have surprise
// exclusions carry over to the next session.

import {
  AMOUNTS,
  BENCHMARKS,
  DEFAULT_CONFIG,
  EXIT_RULES,
  TIME_WINDOWS,
  UNIVERSES,
  VIEW_MODES,
  type MarketBenchmark,
  type PerformanceAmount,
  type PerformanceExitRule,
  type PerformanceTimeWindow,
  type PerformanceUniverse,
  type PerformanceViewMode,
  type StrategyConfig,
} from "./types";

const PREFIX = "ddbx.perf.";

function read<T extends string>(
  key: string,
  isValid: (s: string) => s is T,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(PREFIX + key);

  return raw != null && isValid(raw) ? raw : fallback;
}

const isUniverse = (s: string): s is PerformanceUniverse =>
  Object.prototype.hasOwnProperty.call(UNIVERSES, s);
const isWindow = (s: string): s is PerformanceTimeWindow =>
  Object.prototype.hasOwnProperty.call(TIME_WINDOWS, s);
const isExitRule = (s: string): s is PerformanceExitRule =>
  Object.prototype.hasOwnProperty.call(EXIT_RULES, s);
const isAmount = (s: string): s is PerformanceAmount =>
  Object.prototype.hasOwnProperty.call(AMOUNTS, s);
const isBenchmark = (s: string): s is MarketBenchmark =>
  Object.prototype.hasOwnProperty.call(BENCHMARKS, s);
const isViewMode = (s: string): s is PerformanceViewMode =>
  Object.prototype.hasOwnProperty.call(VIEW_MODES, s);

export function loadConfig(): StrategyConfig {
  return {
    universe: read("universe", isUniverse, DEFAULT_CONFIG.universe),
    timeWindow: read("timeWindow", isWindow, DEFAULT_CONFIG.timeWindow),
    exitRule: read("exitRule", isExitRule, DEFAULT_CONFIG.exitRule),
    amount: read("amount", isAmount, DEFAULT_CONFIG.amount),
    benchmark: read("benchmark", isBenchmark, DEFAULT_CONFIG.benchmark),
    viewMode: read("viewMode", isViewMode, DEFAULT_CONFIG.viewMode),
    excludedDealIds: new Set<string>(),
  };
}

export function saveConfig(cfg: StrategyConfig): void {
  if (typeof window === "undefined") return;
  const ls = window.localStorage;

  ls.setItem(PREFIX + "universe", cfg.universe);
  ls.setItem(PREFIX + "timeWindow", cfg.timeWindow);
  ls.setItem(PREFIX + "exitRule", cfg.exitRule);
  ls.setItem(PREFIX + "amount", cfg.amount);
  ls.setItem(PREFIX + "benchmark", cfg.benchmark);
  ls.setItem(PREFIX + "viewMode", cfg.viewMode);
}
