// Hero card — port of PerformanceView.swift `heroCard`. The Picks % and
// Benchmark % numbers, comparison-tinted side-by-side, the criteria grid,
// and the natural-language strategy sentence underneath.

import type { MetricKind } from "./metric-sheet";

import { CriteriaCard } from "./criteria-card";
import { StrategySentence } from "./strategy-sentence";

import {
  AMOUNTS,
  BENCHMARKS,
  EXIT_RULES,
  TIME_WINDOWS,
  UNIVERSES,
  benchmarkReturnPct,
  strategyReturnPct,
  type PerformanceResult,
  type StrategyConfig,
} from "@/lib/performance/types";
import { Skeleton } from "@/components/skeleton";

const MUTED_OPACITY = 0.45;

export type CriterionKind =
  | "universe"
  | "window"
  | "exit"
  | "amount"
  | "benchmark";

interface Props {
  config: StrategyConfig;
  result: PerformanceResult;
  isComputing: boolean;
  /** Optional scrub-time pct override for picks/benchmark (set by chart hover). */
  scrubPicksPct?: number | null;
  scrubBenchPct?: number | null;
  scrubDate?: string | null;
  error: string | null;
  onOpenCriterion: (kind: CriterionKind) => void;
  onOpenMetric: (kind: MetricKind) => void;
}

function formatPct(value: number): string {
  const x = value * 100;
  const sign = x >= 0 ? "+" : "−";

  return `${sign}${Math.abs(x).toFixed(1)}%`;
}

// Comparison-aware tint — saturated when this side is the more "extreme in
// its direction"; muted when the other side is more extreme. Mixed signs
// always stay saturated since colour alone separates them. Direct port of
// PerformanceView.swift `heroTint`.
type Tint = "pos" | "neg" | "pos-muted" | "neg-muted" | "default";

function tint(value: number, vs: number, hasData: boolean): Tint {
  if (!hasData) return "default";
  const valuePos = value >= 0;
  const otherPos = vs >= 0;

  if (valuePos !== otherPos) return valuePos ? "pos" : "neg";
  if (valuePos) return value >= vs ? "pos" : "pos-muted";

  return value <= vs ? "neg" : "neg-muted";
}

function tintClass(t: Tint): string {
  switch (t) {
    case "pos":
    case "pos-muted":
      return "text-[#1e6b18] dark:text-[#5cd84a]";
    case "neg":
    case "neg-muted":
      return "text-[#8b2020] dark:text-[#e84d4d]";
    default:
      return "";
  }
}

function tintStyle(t: Tint): React.CSSProperties {
  if (t === "pos-muted" || t === "neg-muted") return { opacity: MUTED_OPACITY };

  return {};
}

export function HeroCard(props: Props) {
  const { config, result, isComputing, error, onOpenCriterion, onOpenMetric } =
    props;

  const hasData = result.totalDeployed > 0;
  const picksPct = props.scrubPicksPct ?? strategyReturnPct(result);
  const benchPct = props.scrubBenchPct ?? benchmarkReturnPct(result);
  const isFirstLoad = isComputing && !hasData;

  const benchmarkName = BENCHMARKS[config.benchmark].displayName;
  const picksTint = tint(picksPct, benchPct, hasData);
  const benchTint = tint(benchPct, picksPct, hasData);

  const showSkeleton = isFirstLoad || (isComputing && !props.scrubDate);

  return (
    <div className="rounded-xl border border-separator bg-surface/40 p-4 md:p-5 space-y-4">
      <div className="flex items-start gap-4">
        <HeroStat
          info
          align="left"
          label="Picks"
          showSkeleton={showSkeleton}
          tintClass={tintClass(picksTint)}
          tintStyle={tintStyle(picksTint)}
          value={hasData ? formatPct(picksPct) : "—"}
          onClickInfo={() => onOpenMetric("picks")}
        />
        <HeroStat
          info
          align="right"
          label={benchmarkName}
          showSkeleton={showSkeleton}
          tintClass={tintClass(benchTint)}
          tintStyle={tintStyle(benchTint)}
          value={hasData ? formatPct(benchPct) : "—"}
          onClickInfo={() => onOpenMetric("benchmark")}
        />
      </div>

      {props.scrubDate != null && (
        <div className="text-xs text-muted">As of {props.scrubDate}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        <CriteriaCard
          hint={
            hasData
              ? `${result.dealCount} deal${result.dealCount === 1 ? "" : "s"}`
              : "—"
          }
          label="Universe"
          value={UNIVERSES[config.universe].displayName}
          onClick={() => onOpenCriterion("universe")}
        />
        <CriteriaCard
          label="Window"
          value={TIME_WINDOWS[config.timeWindow].displayName}
          onClick={() => onOpenCriterion("window")}
        />
        <CriteriaCard
          label="Hold"
          value={EXIT_RULES[config.exitRule].displayName}
          onClick={() => onOpenCriterion("exit")}
        />
        <CriteriaCard
          label="Benchmark"
          value={benchmarkName}
          onClick={() => onOpenCriterion("benchmark")}
        />
        <CriteriaCard
          label="Per deal"
          value={AMOUNTS[config.amount].displayName}
          onClick={() => onOpenCriterion("amount")}
        />
      </div>

      <StrategySentence
        config={config}
        dealCount={result.dealCount}
        excludedForData={result.excludedForDataCount}
        totalDeployed={result.totalDeployed}
      />
      {error != null && <div className="text-[11px] text-red-500">{error}</div>}
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  align: "left" | "right";
  tintClass: string;
  tintStyle: React.CSSProperties;
  info: boolean;
  showSkeleton: boolean;
  onClickInfo: () => void;
}

function HeroStat(props: StatProps) {
  const labelEl = (
    <button
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-foreground"
      type="button"
      onClick={props.onClickInfo}
    >
      <span>{props.label}</span>
      {props.info && (
        <svg
          aria-hidden
          className="opacity-60"
          fill="none"
          height="11"
          viewBox="0 0 24 24"
          width="11"
        >
          <circle
            cx="12"
            cy="12"
            fill="currentColor"
            fillOpacity="0.18"
            r="9"
          />
          <path
            d="M12 8v.01M12 11v5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      )}
    </button>
  );

  const valueEl = props.showSkeleton ? (
    <Skeleton className="mt-0.5 h-8 w-24" />
  ) : (
    <div
      className={`text-3xl md:text-4xl font-semibold tabular-nums ${props.tintClass}`}
      style={props.tintStyle}
    >
      {props.value}
    </div>
  );

  return (
    <div
      className={`flex-1 ${props.align === "right" ? "text-right" : "text-left"}`}
    >
      <div
        className={
          props.align === "right" ? "ml-auto inline-flex" : "inline-flex"
        }
      >
        {labelEl}
      </div>
      <div className={props.align === "right" ? "flex justify-end" : ""}>
        {valueEl}
      </div>
    </div>
  );
}
