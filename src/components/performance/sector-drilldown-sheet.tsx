// Modal that drills into one sector's backtest. Renders the existing
// PerformanceChart fed by `SectorResult.result` (already computed by the
// view-model for the chosen sector). Mirrors iOS SectorDrilldownSheet.

import type {
  PerformanceViewMode,
  SectorResult,
} from "@/lib/performance/types";

import { useEffect, useState } from "react";

import {
  PerformanceChart,
  pctAtIndex,
} from "@/components/performance/performance-chart";
import {
  alphaReturnPct,
  benchmarkReturnPct,
  strategyReturnPct,
} from "@/lib/performance/types";

interface Props {
  sector: SectorResult | null;
  viewMode: PerformanceViewMode;
  onClose: () => void;
}

export function SectorDrilldownSheet({ sector, viewMode, onClose }: Props) {
  const open = sector !== null;
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    setScrubIdx(null);
  }, [sector]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        aria-label={sector ? `${sector.sector} — backtest` : "Sector backtest"}
        aria-modal="true"
        className={`fixed z-50 left-1/2 -translate-x-1/2 bg-background border border-black/10 dark:border-white/10
          shadow-2xl rounded-xl flex flex-col overflow-hidden
          w-[calc(100%-2rem)] max-w-2xl
          top-1/2 -translate-y-1/2
          max-h-[85vh]
          transition-opacity duration-150
          ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        role="dialog"
      >
        {sector && (
          <Body
            scrubIdx={scrubIdx}
            sector={sector}
            setScrubIdx={setScrubIdx}
            viewMode={viewMode}
            onClose={onClose}
          />
        )}
      </div>
    </>
  );
}

function Body({
  sector,
  viewMode,
  scrubIdx,
  setScrubIdx,
  onClose,
}: {
  sector: SectorResult;
  viewMode: PerformanceViewMode;
  scrubIdx: number | null;
  setScrubIdx: (i: number | null) => void;
  onClose: () => void;
}) {
  const alpha = alphaReturnPct(sector.result) * 100;
  const stratPct = strategyReturnPct(sector.result);
  const benchPct = benchmarkReturnPct(sector.result);
  const positive = alpha >= 0;

  const scrubPicks =
    scrubIdx != null ? pctAtIndex(sector.result, scrubIdx, "strategy") : null;
  const scrubBench =
    scrubIdx != null ? pctAtIndex(sector.result, scrubIdx, "benchmark") : null;
  const scrubDate =
    scrubIdx != null ? (sector.result.strategy[scrubIdx]?.date ?? null) : null;

  return (
    <>
      <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">{sector.sector}</h2>
          <p className="text-xs text-muted mt-0.5">
            {sector.result.dealCount} deal
            {sector.result.dealCount === 1 ? "" : "s"} backtested
          </p>
        </div>
        <button
          aria-label="Close"
          className="shrink-0 text-muted hover:text-foreground text-2xl leading-none px-1"
          type="button"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="overflow-y-auto px-5 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Picks" muted={false} value={formatPct(stratPct)} />
          <Stat muted label="Benchmark" value={formatPct(benchPct)} />
          <Stat
            color={positive ? "oklch(36% 0.16 155)" : "oklch(38% 0.16 18)"}
            label="Alpha"
            muted={false}
            value={`${positive ? "+" : "−"}${Math.abs(alpha).toFixed(1)}pp`}
          />
        </div>

        {scrubIdx != null && scrubDate && (
          <div className="text-[11px] text-muted flex items-center gap-3 justify-between border-t border-separator/60 pt-2">
            <span className="font-mono tabular-nums">{scrubDate}</span>
            <span className="flex items-center gap-3">
              {scrubPicks != null && (
                <span className="font-mono tabular-nums">
                  {formatPct(scrubPicks / 100)}
                </span>
              )}
              {scrubBench != null && (
                <span className="font-mono tabular-nums text-muted/70">
                  {formatPct(scrubBench / 100)}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="rounded-xl border border-separator bg-surface/40 p-3">
          <PerformanceChart
            result={sector.result}
            viewMode={viewMode}
            onScrub={setScrubIdx}
          />
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  muted,
  color,
}: {
  label: string;
  value: string;
  muted: boolean;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-black/[0.04] dark:bg-white/[0.05] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      <div
        className={`text-base font-semibold tabular-nums ${muted ? "text-muted" : ""}`}
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function formatPct(p: number): string {
  const sign = p >= 0 ? "+" : "−";

  return `${sign}${Math.abs(p * 100).toFixed(1)}%`;
}
