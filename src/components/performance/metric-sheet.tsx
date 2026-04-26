// Info bottom sheet for the Picks % / Benchmark % numbers. Port of
// PerformanceMetricSheet.swift — minimal: title, formula, contextual notes.

import { useEffect } from "react";

import {
  AMOUNTS,
  BENCHMARKS,
  EXIT_RULES,
  type StrategyConfig,
} from "@/lib/performance/types";

export type MetricKind = "picks" | "benchmark";

interface Props {
  open: boolean;
  kind: MetricKind | null;
  config: StrategyConfig;
  onClose: () => void;
}

export function MetricSheet({ open, kind, config, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const benchmarkName = BENCHMARKS[config.benchmark].displayName;
  const amount = AMOUNTS[config.amount].displayName;
  const horizon = EXIT_RULES[config.exitRule].horizonDays;
  const heldClause =
    horizon == null
      ? "still held today (mark-to-market)"
      : `held for ${horizon} days`;

  const title = kind === "picks" ? "Picks %" : `${benchmarkName} %`;
  const body =
    kind === "picks"
      ? `Total return on a backtest where ${amount} is deployed into every qualifying director buy on the day it's disclosed and ${heldClause}. Excluded deals are removed from both legs so the comparison stays honest.`
      : `What you'd have made putting the same ${amount} per deal into the ${benchmarkName} on each disclosure date — same capital, same timing, same hold rule. The only thing varying is the asset.`;

  return (
    <>
      <div
        aria-hidden
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        aria-modal
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-background border-l border-black/10 dark:border-white/10 z-50 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-separator px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface/60"
            type="button"
            onClick={onClose}
          >
            <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
              <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
        <div className="p-4 text-sm leading-relaxed text-muted">{body}</div>
      </div>
    </>
  );
}
