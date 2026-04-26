// Performance backtest types — TypeScript port of ddbx-app/PerformanceModels.swift.
// Kept dependency-free so the pure compute function can import without React.

export type PerformanceUniverse =
  | "every_buy"
  | "suggested"
  | "significant"
  | "noteworthy";

export type PerformanceTimeWindow = "30d" | "90d" | "1y" | "all";

export type PerformanceExitRule =
  | "horizon_30"
  | "horizon_90"
  | "horizon_180"
  | "horizon_365"
  | "hold_forever";

export type PerformanceAmount = "gbp_100" | "gbp_500" | "gbp_1000";

export type PerformanceViewMode = "real_terms" | "vs_market";

export type MarketBenchmark =
  | "ftse_all_share"
  | "ftse_100"
  | "sp_500"
  | "msci_world";

export interface UniverseInfo {
  displayName: string;
  description: string;
}

export const UNIVERSES: Record<PerformanceUniverse, UniverseInfo> = {
  every_buy: {
    displayName: "Every buy",
    description: "Every disclosed director buy.",
  },
  suggested: {
    displayName: "Suggested",
    description: "Significant + noteworthy ratings.",
  },
  significant: {
    displayName: "Significant",
    description: "Highest-conviction subset only.",
  },
  noteworthy: {
    displayName: "Noteworthy",
    description: "Mid-tier ratings only.",
  },
};

export interface TimeWindowInfo {
  displayName: string;
  longName: string;
  description: string;
  /** null = unbounded (capped by the price-history fetch limit at compute time) */
  days: number | null;
}

export const TIME_WINDOWS: Record<PerformanceTimeWindow, TimeWindowInfo> = {
  "30d": {
    displayName: "30d",
    longName: "Last 30 days",
    description: "Recent only.",
    days: 30,
  },
  "90d": {
    displayName: "90d",
    longName: "Last 90 days",
    description: "Quarter-length view.",
    days: 90,
  },
  "1y": {
    displayName: "1y",
    longName: "Last year",
    description: "Full annual cycle.",
    days: 365,
  },
  all: {
    displayName: "All",
    longName: "All",
    description: "Everything available (up to 2 years).",
    days: null,
  },
};

export interface ExitRuleInfo {
  displayName: string;
  longName: string;
  description: string;
  /** null = hold forever, mark-to-market today */
  horizonDays: number | null;
}

export const EXIT_RULES: Record<PerformanceExitRule, ExitRuleInfo> = {
  horizon_30: {
    displayName: "30d hold",
    longName: "30 days",
    description: "Close each position 30 days after entry.",
    horizonDays: 30,
  },
  horizon_90: {
    displayName: "90d hold",
    longName: "90 days",
    description: "Close each position 90 days after entry.",
    horizonDays: 90,
  },
  horizon_180: {
    displayName: "180d hold",
    longName: "180 days",
    description: "Close each position 180 days after entry.",
    horizonDays: 180,
  },
  horizon_365: {
    displayName: "1y hold",
    longName: "1 year",
    description: "Close each position 1 year after entry.",
    horizonDays: 365,
  },
  hold_forever: {
    displayName: "Hold forever",
    longName: "Hold forever",
    description: "Never exit — mark-to-market today.",
    horizonDays: null,
  },
};

export interface AmountInfo {
  displayName: string;
  longName: string;
  description: string | null;
  pounds: number;
}

export const AMOUNTS: Record<PerformanceAmount, AmountInfo> = {
  gbp_100: {
    displayName: "£100",
    longName: "£100 per deal",
    description: "Smallest realistic starting pot.",
    pounds: 100,
  },
  gbp_500: {
    displayName: "£500",
    longName: "£500 per deal",
    description: null,
    pounds: 500,
  },
  gbp_1000: {
    displayName: "£1,000",
    longName: "£1,000 per deal",
    description: null,
    pounds: 1_000,
  },
};

export interface BenchmarkInfo {
  displayName: string;
  description: string;
  ticker: string;
  /** GBP-denominated benchmarks need no FX conversion. */
  isGbp: boolean;
}

export const BENCHMARKS: Record<MarketBenchmark, BenchmarkInfo> = {
  ftse_all_share: {
    displayName: "FTSE All-Share",
    description: "Broad UK equity market",
    ticker: "^FTAS",
    isGbp: true,
  },
  ftse_100: {
    displayName: "FTSE 100",
    description: "Top 100 UK companies",
    ticker: "^FTSE",
    isGbp: true,
  },
  sp_500: {
    displayName: "S&P 500",
    description: "500 largest US companies",
    ticker: "^GSPC",
    isGbp: false,
  },
  msci_world: {
    displayName: "MSCI World",
    description: "Global developed markets",
    ticker: "URTH",
    isGbp: false,
  },
};

export interface ViewModeInfo {
  displayName: string;
}

export const VIEW_MODES: Record<PerformanceViewMode, ViewModeInfo> = {
  real_terms: { displayName: "Real terms" },
  vs_market: { displayName: "vs Market" },
};

// MARK: - Config

export interface StrategyConfig {
  universe: PerformanceUniverse;
  timeWindow: PerformanceTimeWindow;
  exitRule: PerformanceExitRule;
  amount: PerformanceAmount;
  benchmark: MarketBenchmark;
  viewMode: PerformanceViewMode;
  /** Session-only — deals the user has removed from the backtest. Symmetric across both legs. */
  excludedDealIds: Set<string>;
}

export const DEFAULT_CONFIG: StrategyConfig = {
  universe: "suggested",
  timeWindow: "90d",
  exitRule: "horizon_90",
  amount: "gbp_100",
  benchmark: "ftse_all_share",
  viewMode: "real_terms",
  excludedDealIds: new Set<string>(),
};

// MARK: - Result

export interface PortfolioPoint {
  date: string; // YYYY-MM-DD
  value: number; // £
}

export type ContributorState = "open" | "closed";

export interface ContributorRow {
  dealId: string;
  ticker: string;
  company: string;
  entryDate: string;
  entryPricePence: number;
  exitDate: string | null;
  exitPricePence: number | null;
  deployed: number;
  currentValue: number;
  returnPct: number;
  state: ContributorState;
}

export interface PerformanceResult {
  strategy: PortfolioPoint[];
  benchmark: PortfolioPoint[];
  /** Cumulative £ deployed over time — used by the chart to render meaningful % at each index. */
  deployed: PortfolioPoint[];
  contributors: ContributorRow[];
  totalDeployed: number;
  excludedForDataCount: number;
  dealCount: number;
}

export const EMPTY_RESULT: PerformanceResult = {
  strategy: [],
  benchmark: [],
  deployed: [],
  contributors: [],
  totalDeployed: 0,
  excludedForDataCount: 0,
  dealCount: 0,
};

export function strategyFinalValue(r: PerformanceResult): number {
  return r.strategy[r.strategy.length - 1]?.value ?? 0;
}

export function benchmarkFinalValue(r: PerformanceResult): number {
  return r.benchmark[r.benchmark.length - 1]?.value ?? 0;
}

export function strategyReturnPct(r: PerformanceResult): number {
  if (r.totalDeployed <= 0) return 0;

  return (strategyFinalValue(r) - r.totalDeployed) / r.totalDeployed;
}

export function benchmarkReturnPct(r: PerformanceResult): number {
  if (r.totalDeployed <= 0) return 0;

  return (benchmarkFinalValue(r) - r.totalDeployed) / r.totalDeployed;
}

export function alphaReturnPct(r: PerformanceResult): number {
  return strategyReturnPct(r) - benchmarkReturnPct(r);
}

export function pnlForRow(r: ContributorRow): number {
  return r.currentValue - r.deployed;
}

// MARK: - Price/FX bars

export interface PriceBar {
  date: string; // YYYY-MM-DD
  closePence: number;
}

export interface FxRate {
  date: string; // YYYY-MM-DD
  gbpPerUsd: number;
}
