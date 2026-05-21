import type { ChartMode } from "@/lib/markets/types";

import { deltaStyle } from "./market-utils";

export interface SparkBar {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Close in whatever raw unit the API returns (`close_pence`). Units only
   *  need to be consistent within a single bars array — the sparkline
   *  rebases at the anchor so absolute scale never matters. */
  close: number;
}

interface MarketRowSparkProps {
  bars?: SparkBar[];
  benchmarkBars?: SparkBar[];
  /** Trade date on the wire row. Sparkline anchors here when
   *  `chartMode.anchor === "trade"`. */
  tradeDate: string;
  disclosedDate: string;
  chartMode: ChartMode;
  width?: number;
  height?: number;
}

/** Inline post-trade trend line. Tiny by design — colour communicates the
 *  current bias (green up / red down), shape gives a hint of the path.
 *  No tooltip, no axis labels — the full chart already lives in the
 *  detail drawer. */
export function MarketRowSpark({
  bars,
  benchmarkBars,
  tradeDate,
  disclosedDate,
  chartMode,
  width = 80,
  height = 22,
}: MarketRowSparkProps) {
  const empty = (
    <span className="text-[10px] text-muted/40 tabular-nums">—</span>
  );

  if (!bars || bars.length === 0) return empty;

  const anchor =
    chartMode.anchor === "disclosure"
      ? disclosedDate.slice(0, 10)
      : tradeDate.slice(0, 10);

  // Prefer the post-anchor line. For same-day buys we often only have one
  // close after the trade/disclosure, so include a short pre-anchor lookback
  // and mark the cutoff instead of showing an empty trend cell.
  const postCount = bars.filter((b) => b.date >= anchor).length;
  const stockPost =
    postCount >= 2 ? bars.filter((b) => b.date >= anchor) : bars.slice(-28);

  if (stockPost.length < 2) return empty;
  const anchorIdx = (() => {
    const idx = stockPost.findIndex((b) => b.date >= anchor);

    if (idx >= 0) return idx;

    return stockPost.length - 1;
  })();
  const stockBase = stockPost[anchorIdx]?.close ?? stockPost[0].close;

  if (stockBase <= 0) return empty;

  // Compute the per-bar % series the line will visualise. Market axis
  // subtracts the benchmark's return over the same window so the line
  // tracks alpha rather than the raw stock.
  let series: number[];

  if (
    chartMode.axis === "market" &&
    benchmarkBars &&
    benchmarkBars.length >= 2
  ) {
    const benchBase = (() => {
      for (const b of benchmarkBars) if (b.date >= anchor) return b.close;

      return null;
    })();

    if (!benchBase || benchBase <= 0) {
      series = stockPost.map((b) => (b.close / stockBase - 1) * 100);
    } else {
      // Walk benchmark bars with a pointer so the lookup stays O(N+M)
      // rather than O(N·M).
      let bi = 0;
      let lastBenchClose = benchBase;

      series = stockPost.map((b) => {
        while (
          bi < benchmarkBars.length &&
          benchmarkBars[bi].date <= b.date
        ) {
          lastBenchClose = benchmarkBars[bi].close;
          bi++;
        }
        const stockPct = (b.close / stockBase - 1) * 100;
        const benchPct = (lastBenchClose / benchBase - 1) * 100;

        return stockPct - benchPct;
      });
    }
  } else {
    series = stockPost.map((b) => (b.close / stockBase - 1) * 100);
  }

  const n = series.length;
  const min = Math.min(0, ...series);
  const max = Math.max(0, ...series);
  const range = max - min || 1;

  const points = series
    .map((v, i) => {
      const x = (i / (n - 1)) * width;
      const y = height - ((v - min) / range) * height;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = series[n - 1];
  const { text } = deltaStyle(last);
  const baselineY = height - ((0 - min) / range) * height;
  const cutoffX = (anchorIdx / (n - 1)) * width;

  return (
    <svg
      aria-hidden="true"
      className="overflow-visible block"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <line
        stroke="currentColor"
        strokeDasharray="2 2"
        strokeOpacity={0.15}
        strokeWidth={0.5}
        x1={0}
        x2={width}
        y1={baselineY}
        y2={baselineY}
      />
      {postCount < 2 && (
        <line
          stroke="currentColor"
          strokeDasharray="2 2"
          strokeOpacity={0.35}
          strokeWidth={0.75}
          x1={cutoffX}
          x2={cutoffX}
          y1={0}
          y2={height}
        />
      )}
      <polyline
        fill="none"
        points={points}
        stroke={text}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.25}
      />
    </svg>
  );
}
