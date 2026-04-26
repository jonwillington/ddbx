// Two-mode SVG chart — port of ddbx-app/PerformanceChart.swift.
//
//   * Real terms: strategy solid line vs benchmark dashed line. Both values
//     are normalised against cumulative-deployed at each timeline index, so
//     early-stage points (where only a few deals have entered) read the same
//     way as later points.
//   * vs Market: single alpha line (strategyPct - benchmarkPct) with a signed
//     fill against the zero baseline. Green when the line ends positive, red
//     when it ends negative.
//
// Pointer/touch scrub maps an x-position to the nearest data index and emits
// it via `onScrub(idx | null)`. Hosts can use that to render a dynamic header.

import type {
  PerformanceResult,
  PerformanceViewMode,
} from "@/lib/performance/types";

import { useEffect, useMemo, useRef, useState } from "react";

const STRAT_COLOR = "#6b5038"; // brand brown, matches the active-link tint
const BENCH_COLOR = "#a1a1aa"; // muted grey
const POS_COLOR = "#4ade80"; // green-400
const NEG_COLOR = "#ef4444"; // red-500
const ZERO_COLOR = "#a1a1aa";

const HEIGHT = 220;
const Y_AXIS_INSET = 40; // leaves room for left-edge tick labels
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

interface Props {
  result: PerformanceResult;
  viewMode: PerformanceViewMode;
  onScrub?: (idx: number | null) => void;
}

interface Series {
  values: number[]; // one per timeline index, in pct (0.05 = +5%)
}

function pctSeries(numerator: number[], denom: number[]): number[] {
  return numerator.map((v, i) => {
    const d = denom[i];

    return d > 0 ? (v - d) / d : 0;
  });
}

// Y-axis "nice tick" ladder — port of niceTicks(min:max:target:) from
// PerformanceChart.swift. Returns ~`target` evenly spaced values whose
// step is a 1/2/5 multiple of a power of 10.
function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min, max];
  }
  const range = max - min;
  const rough = range / Math.max(target - 1, 1);
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const candidates = [1, 2, 5, 10].map((m) => m * base);
  let step = candidates[candidates.length - 1];

  for (const c of candidates) {
    if (range / c <= target * 1.4) {
      step = c;
      break;
    }
  }
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];

  for (let v = start; v <= max + step * 0.5; v += step) {
    ticks.push(v);
  }

  return ticks;
}

function bounds(
  values: number[],
  includeZero = true,
): { yMin: number; yMax: number; ticks: number[] } {
  if (values.length === 0) return { yMin: 0, yMax: 1, ticks: [0, 1] };
  let lo = Math.min(...values);
  let hi = Math.max(...values);

  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.12 || 0.01;

  lo -= pad;
  hi += pad;
  const ticks = niceTicks(lo, hi, 5);

  return {
    yMin: ticks[0] ?? lo,
    yMax: ticks[ticks.length - 1] ?? hi,
    ticks,
  };
}

function formatPctTick(v: number): string {
  const x = v * 100;
  const abs = Math.abs(x);
  const decimals = abs < 10 ? 1 : 0;
  const sign = x >= 0 ? "" : "−";

  return `${sign}${abs.toFixed(decimals)}%`;
}

function formatShortDate(iso: string): string {
  // "2026-04-26" → "26 Apr"
  const d = new Date(`${iso}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });

  return `${day} ${month}`;
}

export function PerformanceChart({ result, viewMode, onScrub }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(720);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  // ResizeObserver wires the SVG width to the container so the chart fills
  // the available column. We sample once on mount and then on every resize.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = containerRef.current;

    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;

      if (w && w > 0) setWidth(w);
    });

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  const series = useMemo<{
    strategy: Series;
    benchmark: Series;
    alpha: Series;
  } | null>(() => {
    const n = result.strategy.length;

    if (n < 2 || result.benchmark.length !== n || result.deployed.length !== n)
      return null;
    const stratV = result.strategy.map((p) => p.value);
    const benchV = result.benchmark.map((p) => p.value);
    const depV = result.deployed.map((p) => p.value);
    const stratPct = pctSeries(stratV, depV);
    const benchPct = pctSeries(benchV, depV);
    const alphaPct = stratPct.map((v, i) => v - benchPct[i]);

    return {
      strategy: { values: stratPct },
      benchmark: { values: benchPct },
      alpha: { values: alphaPct },
    };
  }, [result]);

  if (!series) {
    return (
      <div
        ref={containerRef}
        className="flex h-[220px] items-center justify-center rounded-lg border border-separator bg-surface/40 text-sm text-muted"
      >
        Not enough data yet.
      </div>
    );
  }

  const dates = result.strategy.map((p) => p.date);
  const n = dates.length;

  const valuesForBounds =
    viewMode === "vs_market"
      ? series.alpha.values
      : [...series.strategy.values, ...series.benchmark.values];
  const { yMin, yMax, ticks } = bounds(valuesForBounds, true);
  const yRange = Math.max(yMax - yMin, 1e-6);

  const chartW = Math.max(width - Y_AXIS_INSET, 1);
  const chartH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) => Y_AXIS_INSET + (i / Math.max(n - 1, 1)) * chartW;
  const yFor = (v: number) => PAD_TOP + (1 - (v - yMin) / yRange) * chartH;

  const handlePointer = (clientX: number) => {
    const el = containerRef.current;

    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left - Y_AXIS_INSET;

    if (x < 0 || x > chartW) {
      setScrubIdx(null);
      onScrub?.(null);

      return;
    }
    const idx = Math.round((x / chartW) * (n - 1));
    const clamped = Math.max(0, Math.min(n - 1, idx));

    setScrubIdx(clamped);
    onScrub?.(clamped);
  };

  const releaseScrub = () => {
    setScrubIdx(null);
    onScrub?.(null);
  };

  // Build line paths
  const linePath = (values: number[]): string =>
    values
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`,
      )
      .join(" ");

  const stratPath = linePath(series.strategy.values);
  const benchPath = linePath(series.benchmark.values);
  const alphaPath = linePath(series.alpha.values);

  // vs Market signed area fill
  const alphaEnd = series.alpha.values[n - 1] ?? 0;
  const alphaColor = alphaEnd >= 0 ? POS_COLOR : NEG_COLOR;
  const zeroY = yFor(0);
  const fillPath =
    `M ${xFor(0).toFixed(2)} ${zeroY.toFixed(2)} ` +
    series.alpha.values
      .map((v, i) => `L ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
      .join(" ") +
    ` L ${xFor(n - 1).toFixed(2)} ${zeroY.toFixed(2)} Z`;

  const stratEnd = series.strategy.values[n - 1];
  const benchEnd = series.benchmark.values[n - 1];

  return (
    <div ref={containerRef} className="w-full select-none">
      <svg
        height={HEIGHT}
        style={{ touchAction: "pan-y", display: "block", width: "100%" }}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        onMouseLeave={releaseScrub}
        onMouseMove={(e) => handlePointer(e.clientX)}
        onTouchEnd={releaseScrub}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX);
        }}
        onTouchStart={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX);
        }}
      >
        {/* Y-axis tick labels + gridlines */}
        {ticks.map((t) => {
          const y = yFor(t);

          return (
            <g key={t}>
              <line
                stroke="currentColor"
                strokeOpacity={t === 0 ? 0.25 : 0.08}
                strokeWidth={t === 0 ? 1 : 0.5}
                x1={Y_AXIS_INSET}
                x2={width}
                y1={y}
                y2={y}
              />
              <text
                className="fill-muted"
                fontSize="10"
                textAnchor="end"
                x={Y_AXIS_INSET - 6}
                y={y + 3}
              >
                {formatPctTick(t)}
              </text>
            </g>
          );
        })}

        {viewMode === "vs_market" ? (
          <>
            <path d={fillPath} fill={alphaColor} fillOpacity={0.18} />
            <path
              d={alphaPath}
              fill="none"
              stroke={alphaColor}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
            <circle
              cx={xFor(n - 1)}
              cy={yFor(alphaEnd)}
              fill={alphaColor}
              r={3}
            />
          </>
        ) : (
          <>
            <path
              d={benchPath}
              fill="none"
              stroke={BENCH_COLOR}
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
            <path
              d={stratPath}
              fill="none"
              stroke={STRAT_COLOR}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
            <circle
              cx={xFor(n - 1)}
              cy={yFor(stratEnd)}
              fill={STRAT_COLOR}
              r={3}
            />
            <circle
              cx={xFor(n - 1)}
              cy={yFor(benchEnd)}
              fill={BENCH_COLOR}
              r={3}
            />
          </>
        )}

        {/* Scrub indicator */}
        {scrubIdx != null &&
          (() => {
            const sx = xFor(scrubIdx);

            return (
              <g>
                <line
                  stroke={ZERO_COLOR}
                  strokeDasharray="3 3"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                  x1={sx}
                  x2={sx}
                  y1={PAD_TOP}
                  y2={PAD_TOP + chartH}
                />
                {viewMode === "vs_market" ? (
                  <circle
                    cx={sx}
                    cy={yFor(series.alpha.values[scrubIdx])}
                    fill={alphaColor}
                    r={4}
                  />
                ) : (
                  <>
                    <circle
                      cx={sx}
                      cy={yFor(series.strategy.values[scrubIdx])}
                      fill={STRAT_COLOR}
                      r={4}
                    />
                    <circle
                      cx={sx}
                      cy={yFor(series.benchmark.values[scrubIdx])}
                      fill={BENCH_COLOR}
                      r={4}
                    />
                  </>
                )}
              </g>
            );
          })()}

        {/* X-axis start/end labels */}
        <text
          className="fill-muted"
          fontSize="10"
          x={Y_AXIS_INSET}
          y={HEIGHT - 6}
        >
          {formatShortDate(dates[0])}
        </text>
        <text
          className="fill-muted"
          fontSize="10"
          textAnchor="end"
          x={width - 4}
          y={HEIGHT - 6}
        >
          {formatShortDate(dates[n - 1])}
        </text>
      </svg>
    </div>
  );
}

// Helper exposed so the hero can render scrubbed values consistently with
// the chart's own normalisation.
export function pctAtIndex(
  result: PerformanceResult,
  idx: number,
  kind: "strategy" | "benchmark" | "alpha",
): number {
  const d = result.deployed[idx]?.value;

  if (!d || d <= 0) return 0;
  const s = result.strategy[idx]?.value ?? 0;
  const b = result.benchmark[idx]?.value ?? 0;
  const sp = (s - d) / d;
  const bp = (b - d) / d;

  if (kind === "strategy") return sp;
  if (kind === "benchmark") return bp;

  return sp - bp;
}
