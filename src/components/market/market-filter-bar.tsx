import type { ReactNode } from "react";

export type MarketViewMode = "chronological" | "by-gain";

/** Filter strip rendered above the month list (and inside the by-gain view).
 *  Same in every market today; if a market ever needs different controls
 *  here, replace this with a per-market slot in MarketConfig. */
export function MarketFilterBar({
  viewMode,
  onViewMode,
  search,
  onSearch,
  searchPlaceholder = "Search ticker, company, insider…",
  trailing,
}: {
  viewMode: MarketViewMode;
  onViewMode: (v: MarketViewMode) => void;
  search: string;
  onSearch: (s: string) => void;
  searchPlaceholder?: string;
  /** Optional element rendered ml-auto on the right — currently used for the
   *  metric-mode chip on markets that opt into useMetricMode. */
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 bg-[#faf7f2] dark:bg-surface px-5 py-3.5">
      <div className="flex gap-2">
        {(["chronological", "by-gain"] as const).map((mode) => (
          <button
            key={mode}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              viewMode === mode
                ? "border-[#6b5038] bg-[#6b5038]/10 text-[#6b5038]"
                : "border-separator text-muted hover:border-[#6b5038]/50"
            }`}
            onClick={() => onViewMode(mode)}
          >
            {mode === "chronological" ? "Chronological" : "By gain"}
          </button>
        ))}
      </div>
      <input
        className="w-72 rounded-full border border-separator bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:border-[#6b5038]/50 transition-colors"
        placeholder={searchPlaceholder}
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
