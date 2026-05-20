import type { ComponentType } from "react";
import type { PriceFormat } from "@/components/position-card";
import type { MarketDealing } from "@/lib/markets/types";

import { ChevronDownIcon, TrashIcon } from "@heroicons/react/24/outline";

import { MarketRow } from "./market-row";
import { shortDate } from "./market-utils";

/** Collapsible cluster used by the chronological view to group the day's
 *  unanalysed rows. Header summarises the count + visible tickers; body
 *  reveals real rows on click, paginated 5-at-a-time to keep the DOM
 *  light on days that catch a ton of routine filings. */
export function MarketSkippedCluster<W>({
  dealings,
  open,
  onToggle,
  visibleCount,
  onShowMore,
  selectedKey,
  onSelect,
  stockCurrent,
  benchmarkEntry,
  benchmarkCurrent,
  fmt,
  benchmarkLabel,
  RowActionCell,
  metricMode,
  showLogo,
}: {
  dealings: MarketDealing<W>[];
  open: boolean;
  onToggle: () => void;
  /** How many rows to show inside the expanded cluster (5, 10, 15…). */
  visibleCount: number;
  onShowMore: () => void;
  selectedKey: string | null;
  onSelect: (d: MarketDealing<W>) => void;
  stockCurrent: (ticker: string) => number | undefined;
  benchmarkEntry: (d: MarketDealing<W>) => number | undefined;
  benchmarkCurrent: number | undefined;
  fmt: PriceFormat;
  benchmarkLabel: string;
  RowActionCell: ComponentType<{ dealing: MarketDealing<W> }>;
  metricMode?: { isVsMarket: boolean };
  showLogo?: boolean;
}) {
  if (dealings.length === 0) return null;
  const newest = dealings[0];
  const dateLabel = shortDate(newest.disclosedDate);
  const visible = dealings.slice(0, visibleCount);
  const remaining = dealings.length - visibleCount;
  const tickers = dealings.map((d) => (d.ticker || "—").replace(/\.L$/, ""));

  return (
    <div className="bg-black/[0.04] dark:bg-white/[0.03]">
      <button
        className={`w-full text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors ${
          open ? "bg-black/[0.04] dark:bg-white/[0.05]" : ""
        }`}
        onClick={onToggle}
      >
        {/* Mobile */}
        <div className="md:hidden px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <TrashIcon className="w-3.5 h-3.5 text-muted/50 shrink-0" />
            <span className="text-xs text-foreground/50 font-medium">
              {dateLabel}
            </span>
            <ChevronDownIcon
              className={`w-4 h-4 text-muted shrink-0 ml-auto transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {tickers.slice(0, 4).map((t, i) => (
              <span
                key={i}
                className="font-mono text-xs px-1.5 py-0.5 rounded border bg-[#e8e0d5]/60 dark:bg-surface-secondary/60 border-[#d0c8be]/50 dark:border-border/50 text-muted"
              >
                {t}
              </span>
            ))}
            {tickers.length > 4 && (
              <span className="text-xs text-muted/70">
                +{tickers.length - 4} more
              </span>
            )}
          </div>
          <div className="text-xs text-muted/70 mt-1.5">
            None met our criteria to analyse further
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden md:flex items-stretch">
          <div className="w-32 shrink-0 px-4 py-4 flex items-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <div className="text-sm text-foreground/90 font-medium leading-tight">
              {dateLabel}
            </div>
          </div>
          <div className="w-24 shrink-0 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <TrashIcon className="w-4 h-4 text-muted/50" />
          </div>
          <div className="flex-1 min-w-0 px-4 py-4 flex items-center">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {tickers.slice(0, 5).map((t, i) => (
                  <span
                    key={i}
                    className="font-mono text-xs px-1.5 py-0.5 rounded border bg-[#e8e0d5]/60 dark:bg-surface-secondary/60 border-[#d0c8be]/50 dark:border-border/50 text-muted"
                  >
                    {t}
                  </span>
                ))}
                {tickers.length > 5 && (
                  <span className="text-xs text-muted/70">
                    +{tickers.length - 5} more
                  </span>
                )}
              </div>
              <div className="text-xs text-muted/70 mt-1.5">
                {dealings.length} other disclosure
                {dealings.length === 1 ? "" : "s"} from this day — none met our
                criteria to analyse further
              </div>
            </div>
            <ChevronDownIcon
              className={`w-5 h-5 text-muted shrink-0 ml-4 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-black/[0.06] dark:divide-separator">
          {visible.map((d) => (
            <MarketRow
              key={d.key}
              RowActionCell={RowActionCell}
              benchmarkCurrent={benchmarkCurrent}
              benchmarkEntry={benchmarkEntry(d)}
              benchmarkLabel={benchmarkLabel}
              dealing={d}
              fmt={fmt}
              metricMode={metricMode}
              selected={selectedKey === d.key}
              showLogo={showLogo}
              stockCurrentMajor={stockCurrent(d.ticker)}
              onSelect={() => onSelect(d)}
            />
          ))}
          {remaining > 0 && (
            <div className="px-6 py-4">
              <button
                className="text-sm text-[#7a6a58] hover:text-[#6b5038] transition-colors"
                onClick={onShowMore}
              >
                View {Math.min(remaining, 5)} more skipped
                {remaining > 5 ? ` · ${remaining} remaining` : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
