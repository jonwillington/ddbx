import { useEffect } from "react";

import type {
  DashboardAnchor,
  DashboardComparison,
} from "@/lib/dashboard-metric-mode";
import { useDashboardMetricMode } from "@/lib/dashboard-metric-mode";

const COMPARISON_EXPLANATION: Record<DashboardComparison, string> = {
  raw: "Shows the stock's own return since entry. The headline number on each row is just the stock, ignoring how the wider market did.",
  market:
    "Subtracts the FTSE All-Share's return over the same window, so the number is alpha. Positive means the stock beat the market, negative means it lagged.",
};

const ANCHOR_COPY: Record<DashboardAnchor, { title: string; description: string }> = {
  disclosure: {
    title: "Disclosure date",
    description:
      "When the trade was published on RNS and became visible to everyone. This is the window a copycat investor could actually have acted in, so it's the more honest measure of the signal's value.",
  },
  trade: {
    title: "Trade date",
    description:
      "When the director executed the trade. Includes the one-to-three-day window before disclosure where only the director knew. Useful for studying the information edge, less useful for performance you could replicate.",
  },
};

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
    <path
      fillRule="evenodd"
      d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

export function MetricModeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { comparison, anchor, setComparison, setAnchor } = useDashboardMetricMode();

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
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Metric"
        className={`fixed z-50 left-1/2 -translate-x-1/2 bg-background border border-black/10 dark:border-white/10
          shadow-2xl rounded-xl flex flex-col overflow-hidden
          w-[calc(100%-2rem)] max-w-md
          top-1/2 -translate-y-1/2
          transition-opacity duration-150
          ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06]">
          <h2 className="text-base font-semibold">Metric</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-[#6b5038] hover:text-[#553f2d] transition-colors"
          >
            Done
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-4 py-5 space-y-6">
          {/* Comparison */}
          <section className="space-y-3">
            <h3 className="text-[15px] font-semibold px-1">What do you want to track against?</h3>
            <div
              role="tablist"
              aria-label="Comparison"
              className="grid grid-cols-2 p-1 rounded-lg bg-black/[0.05] dark:bg-white/[0.06]"
            >
              {(["raw", "market"] as const).map((c) => {
                const selected = comparison === c;
                return (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setComparison(c)}
                    className={`text-sm font-semibold py-1.5 rounded-md transition-all
                      ${selected
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted hover:text-foreground/80"}`}
                  >
                    {c === "raw" ? "Raw" : "Market"}
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-muted px-1 leading-relaxed">
              {COMPARISON_EXPLANATION[comparison]}
            </p>
          </section>

          {/* Anchor */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted px-1">
              Track since
            </h3>
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-surface/60 divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              {(["disclosure", "trade"] as const).map((a) => {
                const { title, description } = ANCHOR_COPY[a];
                const selected = anchor === a;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAnchor(a)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold leading-snug">{title}</div>
                      <p className="text-[13px] text-muted leading-relaxed mt-1">
                        {description}
                      </p>
                    </div>
                    <span
                      className={`mt-1 text-[#6b5038] transition-opacity ${selected ? "opacity-100" : "opacity-0"}`}
                      aria-hidden={!selected}
                    >
                      <CheckIcon />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
