// Per-sector leaderboard for the Performance tab's "By Industry" mode.
// Mirrors iOS PerformanceView+Sector — sector name, deal count, alpha bar
// (centered, red/green), and a strategy-vs-benchmark return line on the right.

import type { SectorResult } from "@/lib/performance/types";
import {
  alphaReturnPct,
  benchmarkReturnPct,
  sectorAlphaPp,
  strategyReturnPct,
} from "@/lib/performance/types";

interface Props {
  rows: SectorResult[];
  isComputing: boolean;
  onSelect: (sector: SectorResult) => void;
}

export function SectorLeaderboard({ rows, isComputing, onSelect }: Props) {
  const isFirstLoad = rows.length === 0 && isComputing;
  if (isFirstLoad) {
    return (
      <section>
        <Header />
        <SkeletonList />
      </section>
    );
  }
  if (rows.length === 0) {
    return (
      <section>
        <Header />
        <EmptyState />
      </section>
    );
  }
  const maxAbsAlpha = rows.reduce((m, r) => Math.max(m, Math.abs(sectorAlphaPp(r))), 0);

  return (
    <section className={isComputing ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <Header />
      <div className="rounded-xl border border-separator bg-surface/40 divide-y divide-separator/60">
        {rows.map((row) => (
          <SectorRow
            key={row.sector}
            row={row}
            maxAbsAlpha={maxAbsAlpha}
            onClick={() => onSelect(row)}
          />
        ))}
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between px-1 mb-2">
      <h2 className="text-base font-semibold">By Industry</h2>
      <span className="text-xs text-muted">sorted by alpha</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-separator bg-surface/40 px-4 py-10 text-center">
      <p className="text-sm text-muted">No sector-classified deals in this window.</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="rounded-xl border border-separator bg-surface/40 divide-y divide-separator/60">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 bg-foreground/10 rounded" />
            <div className="h-2.5 w-16 bg-foreground/10 rounded" />
            <div className="h-1 w-full bg-foreground/10 rounded" />
          </div>
          <div className="space-y-2 text-right">
            <div className="h-3.5 w-14 bg-foreground/10 rounded ml-auto" />
            <div className="h-2.5 w-20 bg-foreground/10 rounded ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectorRow({
  row,
  maxAbsAlpha,
  onClick,
}: {
  row: SectorResult;
  maxAbsAlpha: number;
  onClick: () => void;
}) {
  const alphaPp = sectorAlphaPp(row);
  const positive = alphaPp >= 0;
  const stratPct = strategyReturnPct(row.result);
  const benchPct = benchmarkReturnPct(row.result);
  const alphaSign = positive ? "+" : "−";
  const dealsLabel = `${row.result.dealCount} deal${row.result.dealCount === 1 ? "" : "s"}`;

  return (
    <button
      type="button"
      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-sm font-semibold truncate">{row.sector}</div>
        <div className="text-[11px] text-muted">{dealsLabel}</div>
        <AlphaBar value={alphaPp} maxAbs={maxAbsAlpha} positive={positive} />
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        <div
          className="text-sm font-semibold tabular-nums"
          style={{ color: positive ? "oklch(36% 0.16 155)" : "oklch(38% 0.16 18)" }}
        >
          {alphaSign}{Math.abs(alphaPp).toFixed(1)}pp
        </div>
        <div className="text-[11px] text-muted flex items-baseline gap-1 justify-end">
          <span className="font-mono tabular-nums">{formatPct(stratPct)}</span>
          <span className="opacity-60">vs</span>
          <span className="font-mono tabular-nums">{formatPct(benchPct)}</span>
        </div>
      </div>
      <svg viewBox="0 0 8 12" className="w-2 h-3 shrink-0 text-muted/50" fill="currentColor" aria-hidden>
        <path d="M2 1l4 5-4 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function AlphaBar({ value, maxAbs, positive }: { value: number; maxAbs: number; positive: boolean }) {
  const normalised = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const halfPercent = normalised * 50;
  const color = positive ? "oklch(45% 0.14 155)" : "oklch(45% 0.14 18)";

  return (
    <div className="relative h-1 rounded-full bg-foreground/10">
      <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-foreground/30" />
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          backgroundColor: color,
          width: `${halfPercent}%`,
          left: positive ? "50%" : `${50 - halfPercent}%`,
        }}
      />
    </div>
  );
}

function formatPct(p: number): string {
  const sign = p >= 0 ? "+" : "−";
  return `${sign}${Math.abs(p * 100).toFixed(1)}%`;
}

// Re-export for callers that want the raw alpha without importing types directly.
export { alphaReturnPct };
