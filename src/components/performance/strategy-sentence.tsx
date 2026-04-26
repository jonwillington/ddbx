// Plain-English narration of the current filter selections — port of
// PerformanceView.swift `strategySentence`. Reads as a single sentence so
// users grasp the backtest's semantics without reading docs.

import {
  AMOUNTS,
  BENCHMARKS,
  type StrategyConfig,
  type PerformanceExitRule,
  type PerformanceTimeWindow,
  type PerformanceUniverse,
} from "@/lib/performance/types";

interface Props {
  config: StrategyConfig;
  dealCount: number;
  totalDeployed: number;
  excludedForData: number;
}

function universePhrase(u: PerformanceUniverse): string {
  switch (u) {
    case "every_buy":
      return "disclosed buy";
    case "suggested":
      return "suggested buy";
    case "significant":
      return "significant buy";
    case "noteworthy":
      return "noteworthy buy";
  }
}

function windowPhrase(w: PerformanceTimeWindow): string {
  switch (w) {
    case "30d":
      return "from the last 30 days";
    case "90d":
      return "from the last 90 days";
    case "1y":
      return "from the last year";
    case "all":
      return "across the full history";
  }
}

function exitPhrase(e: PerformanceExitRule): string {
  switch (e) {
    case "horizon_30":
      return "each held for 30 days";
    case "horizon_90":
      return "each held for 90 days";
    case "horizon_180":
      return "each held for 180 days";
    case "horizon_365":
      return "each held for a year";
    case "hold_forever":
      return "all still held today";
  }
}

function gbpCompact(value: number): string {
  if (value >= 10_000) return `£${(value / 1_000).toFixed(1)}k`;

  return `£${Math.round(value)}`;
}

export function StrategySentence({
  config,
  dealCount,
  totalDeployed,
  excludedForData,
}: Props) {
  const universe = universePhrase(config.universe);
  const windowText = windowPhrase(config.timeWindow);
  const exit = exitPhrase(config.exitRule);
  const bench = BENCHMARKS[config.benchmark].displayName;
  const amount = AMOUNTS[config.amount].displayName;

  const sentence =
    dealCount === 0
      ? `No ${universe} matches ${windowText}. Try widening the window or universe.`
      : `${amount} into every ${universe} ${windowText}, ${exit} — tracked against ${bench}. ${dealCount} ${dealCount === 1 ? "deal" : "deals"}, ${gbpCompact(totalDeployed)} deployed.`;

  return (
    <div className="space-y-1">
      <p className="text-[13px] text-muted leading-snug">{sentence}</p>
      {excludedForData > 0 && (
        <p className="text-[11px] text-muted">
          {excludedForData} excluded — no price data
        </p>
      )}
    </div>
  );
}
