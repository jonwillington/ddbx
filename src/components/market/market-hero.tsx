import { ArrowTrendingUpIcon } from "@heroicons/react/24/outline";

import { Skeleton } from "@/components/skeleton";

/** Aggregated benchmark-alpha stats. The shell computes these from the
 *  current price + benchmark history; markets don't need to do anything. */
export interface MarketHeroStats {
  count: number;
  avgStock: number;    // fractional, e.g. 0.07 for 7%
  avgBench: number;
  alphaPp: number;     // already in percentage points
  beatCount: number;
}

/** Hero card showing "Performance vs <benchmark>" for the current view.
 *  Stats null → skeleton state. Shared across markets — only the labels
 *  change per market via props. */
export function MarketHeroCard({
  stats,
  benchmarkLabel,
  viewLabel,
}: {
  stats: MarketHeroStats | null;
  benchmarkLabel: string;
  /** Short label for the current view — e.g. "Signal-grade buys", which
   *  renders as the left side of the first stat row. */
  viewLabel: string;
}) {
  if (!stats) {
    return (
      <div className="bg-[#faf7f2] dark:bg-surface rounded-xl border border-[#e8e0d5]/60 dark:border-separator/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e8e0d5] dark:border-separator space-y-2.5">
          <Skeleton className="h-3.5 w-44" />
        </div>
        <div className="px-5 py-5">
          <Skeleton className="h-3 w-24 mb-2" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-2.5 w-20 mt-2" />
        </div>
        <div className="px-4 pb-3 space-y-2">
          <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-16" /></div>
          <div className="flex justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-16" /></div>
          <div className="border-t border-[#e8e0d5] dark:border-separator pt-2">
            <div className="flex justify-between"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-24" /></div>
          </div>
        </div>
      </div>
    );
  }

  const { count, avgStock, avgBench, alphaPp, beatCount } = stats;
  const beat = alphaPp >= 0;

  return (
    <div className="bg-[#faf7f2] dark:bg-surface rounded-xl border border-[#e8e0d5]/60 dark:border-separator/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8e0d5] dark:border-separator">
        <div className="flex items-center gap-2 text-xs font-medium text-muted uppercase tracking-wider">
          <ArrowTrendingUpIcon className="w-4 h-4" />
          Performance vs {benchmarkLabel}
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="text-xs text-muted mb-1">Outperformance</div>
        <div
          className="text-2xl font-semibold tracking-tight"
          style={{ color: beat ? "oklch(36% 0.16 155)" : "oklch(38% 0.16 18)" }}
        >
          {beat ? "+" : ""}{alphaPp.toFixed(1)}<span className="text-base ml-0.5">pp</span>
        </div>
        <div className="text-[10px] text-muted/60 mt-0.5">{count} {count === 1 ? "filing" : "filings"}</div>
      </div>
      <div className="px-4 pb-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{viewLabel}</span>
          <span
            className="font-medium font-mono"
            style={{ color: avgStock >= 0 ? "oklch(36% 0.16 155)" : "oklch(38% 0.16 18)" }}
          >
            {avgStock >= 0 ? "+" : ""}{(avgStock * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{benchmarkLabel}</span>
          <span className="font-medium font-mono text-foreground/70">
            {avgBench >= 0 ? "+" : ""}{(avgBench * 100).toFixed(1)}%
          </span>
        </div>
        <div className="border-t border-[#e8e0d5] dark:border-separator pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Beat {benchmarkLabel}</span>
            <span className="font-medium font-mono">
              {beatCount}/{count}
              <span className="text-muted ml-1.5">
                ({count > 0 ? Math.round((beatCount / count) * 100) : 0}%)
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
