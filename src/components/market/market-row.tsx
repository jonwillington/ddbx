import type { ComponentType, ReactNode } from "react";
import type { PriceFormat } from "@/components/position-card";
import type { ChartMode, MarketDealing } from "@/lib/markets/types";

import { MarketRowSpark, type SparkBar } from "./market-row-spark";
import { computeRowMetric, deltaStyle, shortDate } from "./market-utils";

import { Skeleton } from "@/components/skeleton";
import { CompanyLogo } from "@/components/company-logo";

/** Column headers above the row list. `hideDate` matches the per-section
 *  Today cluster which gets its own date heading. The Performance column
 *  label flips between "Return" and "vs $benchmarkLabel" depending on the
 *  active chart mode so the column header always names what's shown. */
export function MarketRowHeader({
  hideDate = false,
  benchmarkLabel,
  chartMode,
}: {
  hideDate?: boolean;
  benchmarkLabel: string;
  chartMode: ChartMode;
}) {
  const perfLabel = chartMode.axis === "market" ? `vs ${benchmarkLabel}` : "Return";
  return (
    <div className="hidden md:flex items-center text-[10px] uppercase tracking-wider text-muted/80 font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05] rounded-t-xl">
      {!hideDate && (
        <div className="w-28 shrink-0 px-3 py-1.5 border-r border-black/[0.06] dark:border-white/[0.06]">
          Disclosed
        </div>
      )}
      <div className="w-20 shrink-0 px-2 py-1.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
        Ticker
      </div>
      <div className="flex-1 min-w-0 px-3 py-1.5 border-r border-black/[0.06] dark:border-white/[0.06]">
        Company / Insider
      </div>
      <div className="w-24 shrink-0 px-3 py-1.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]">
        Value
      </div>
      <div className="w-24 shrink-0 px-2 py-1.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
        Trend
      </div>
      <div className="w-24 shrink-0 px-2 py-1.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
        {perfLabel}
      </div>
      <div className="w-40 shrink-0 px-2 py-1.5 text-center">Action</div>
    </div>
  );
}

/** Sticky day separator rendered between each day inside an open month.
 *  Mirrors the month header's overhang treatment — same surface colour,
 *  sticky at the height of the month bar so consecutive day headers
 *  swap places as the user scrolls without ever stacking. Optional
 *  `banner` slot is where the UK daily-summary card slots in. */
export function MarketDayHeader({
  weekday,
  day,
  isoDate,
  suggestedCount,
  skippedCount,
  banner,
}: {
  weekday: string;
  day: string;
  isoDate: string;
  suggestedCount: number;
  skippedCount: number;
  banner?: ReactNode;
}) {
  const dateObj = new Date(isoDate);
  const monthLabel = !Number.isNaN(dateObj.getTime())
    ? dateObj.toLocaleString("en-US", { month: "short" })
    : "";

  return (
    <div className="sticky top-[170px] z-[5] bg-[#faf7f2] dark:bg-surface border-y border-black/[0.06] dark:border-white/[0.06]">
      <div className="flex items-center gap-3 px-4 md:px-5 py-1.5 bg-black/[0.025] dark:bg-white/[0.03]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
          {weekday}
        </span>
        <span className="text-xs font-semibold text-foreground/80 tabular-nums">
          {day} {monthLabel}
        </span>
        <span className="ml-auto text-[10px] text-muted/80 tabular-nums">
          {suggestedCount}
          {skippedCount > 0 && (
            <span className="text-muted/50">
              {" · "}
              {skippedCount} skipped
            </span>
          )}
        </span>
      </div>
      {banner}
    </div>
  );
}

/** Skeleton placeholder that matches MarketRow's column geometry on both
 *  mobile and desktop. Used while the dealings fetch is in flight so the
 *  layout doesn't jump when data arrives. */
export function MarketRowSkeleton({
  hideDate = false,
}: {
  hideDate?: boolean;
}) {
  return (
    <div className="w-full">
      {/* Mobile */}
      <div className="md:hidden px-3 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <div className="flex items-start gap-2.5">
          <Skeleton circle className="shrink-0 mt-0.5" h={28} w={28} />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-10 rounded" />
              <Skeleton className="h-3.5 flex-1 rounded" />
            </div>
            <Skeleton className="h-3 w-2/3 rounded" />
          </div>
          <Skeleton className="h-4 w-14 rounded shrink-0" />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:flex items-stretch">
        {!hideDate && (
          <div className="w-28 shrink-0 px-3 py-2.5 flex items-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <Skeleton className="h-3.5 w-16 rounded" />
          </div>
        )}
        <div className="w-20 shrink-0 px-2 py-2.5 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton className="h-4 w-10 rounded" />
        </div>
        <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton circle className="shrink-0" h={28} w={28} />
          <div className="flex-1 min-w-0 space-y-1">
            <Skeleton className="h-3.5 w-1/2 rounded" />
            <Skeleton className="h-3 w-2/5 rounded" />
          </div>
        </div>
        <div className="w-24 shrink-0 px-3 py-2.5 flex flex-col items-end justify-center gap-1 border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="w-24 shrink-0 px-2 py-2.5 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton className="h-3 w-16 rounded" />
        </div>
        <div className="w-24 shrink-0 px-2 py-2.5 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="w-40 shrink-0 px-2 py-2.5 flex items-center justify-center">
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function DeltaBadge({
  value,
  suffix = "%",
}: {
  value: number;
  suffix?: string;
}) {
  const sign = value >= 0 ? "+" : "";
  const { bg, text } = deltaStyle(value);

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
      style={{ backgroundColor: bg, color: text }}
    >
      {value >= 0 ? "▲" : "▼"} {sign}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

interface MarketRowProps<W> {
  dealing: MarketDealing<W>;
  selected: boolean;
  onSelect: () => void;
  /** Live stock price already converted to the major unit used by
   *  `dealing.entryPrice`. Undefined while the latest-prices fetch is in
   *  flight. */
  stockCurrentMajor?: number;
  /** Benchmark close at the chart-mode anchor (trade or disclosure) —
   *  resolved by the shell so the row stays presentational. */
  benchmarkEntry?: number;
  /** Benchmark close right now — same units as benchmarkEntry. */
  benchmarkCurrent?: number;
  /** Per-ticker daily close history for the inline sparkline. Undefined
   *  while the per-ticker fetch is in flight, or when live prices are
   *  disabled for the market. */
  stockBars?: SparkBar[];
  /** Benchmark daily close history (raw bars, sorted by date) used by the
   *  sparkline in `vs Market` axis mode. */
  benchmarkBars?: SparkBar[];
  fmt: PriceFormat;
  benchmarkLabel: string;
  RowActionCell: ComponentType<{ dealing: MarketDealing<W> }>;
  hideDate?: boolean;
  /** When false, the CompanyLogo bubble is suppressed entirely. Default true.
   *  Set from MarketConfig.enableLogos by the shell — used by Sweden where
   *  logo.dev coverage is too thin to bother. */
  showLogo?: boolean;
  /** Drives the right-most Performance cell — raw stock return when
   *  `axis === "raw"`, alpha vs benchmark when `axis === "market"`. */
  chartMode: ChartMode;
}

/** A single dealing row, shared across all markets. The shell hands in the
 *  computed prices + benchmark closes; this component only does the math
 *  for the return + alpha badges and renders the chrome. Market-specific
 *  chips are slotted via RowActionCell. */
export function MarketRow<W>({
  dealing,
  selected,
  onSelect,
  stockCurrentMajor,
  benchmarkEntry,
  benchmarkCurrent,
  stockBars,
  benchmarkBars,
  fmt,
  benchmarkLabel,
  RowActionCell,
  hideDate,
  showLogo = true,
  chartMode,
}: MarketRowProps<W>) {
  const showAlpha = chartMode.axis === "market";
  // Loud when the row has earned an analysis rating, quiet otherwise. Mirrors
  // the UK row's `muted = !analysis` convention so the unread pool fades and
  // the analysed rows stand out at a glance.
  const muted = !dealing.rating || !dealing.isPurchase;
  const tradeDay = dealing.tradeDate.slice(0, 10);
  const disclosedDay = dealing.disclosedDate.slice(0, 10);
  const tradeDiffers = tradeDay !== disclosedDay;

  const { stockPct, alpha } = computeRowMetric({
    dealing,
    stockCurrentMajor,
    benchmarkEntry,
    benchmarkCurrent,
  });

  // UK LSE tickers carry a ".L" suffix on the wire (used by /api/prices
  // AND by Logo.dev to disambiguate from same-letter US listings). It's
  // noise in the UI text, but the raw form has to reach CompanyLogo —
  // hence the two variables.
  const rawTicker = dealing.ticker || "—";
  const ticker = rawTicker.replace(/\.L$/, "");
  const company = dealing.company || "—";
  const insiderLine = dealing.insiderRole
    ? `${dealing.insiderName} (${dealing.insiderRole})`
    : dealing.insiderName;
  const valueLabel =
    dealing.value != null ? fmt.formatValue(dealing.value) : "—";

  return (
    <button
      className={`w-full text-left transition-colors
        ${muted ? "opacity-65" : ""}
        ${selected ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}
      onClick={onSelect}
    >
      {/* ── Mobile (<md) ── */}
      <div className="md:hidden px-3 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-foreground/50 font-medium">
            {shortDate(dealing.disclosedDate)}
            {tradeDiffers && (
              <span className="text-[10px] text-muted/70 ml-1.5">
                · trade {shortDate(dealing.tradeDate)}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <RowActionCell dealing={dealing} />
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          {showLogo && (
            <CompanyLogo className="mt-0.5" size={28} ticker={rawTicker} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] font-semibold px-1.5 py-0 rounded bg-[#e8e0d5] dark:bg-surface-secondary shrink-0">
                {ticker}
              </span>
              <span className="text-[13px] font-medium truncate">{company}</span>
            </div>
            <div className="text-[11px] text-muted truncate mt-0.5">
              {insiderLine}
            </div>
          </div>
          <div className="shrink-0 text-sm font-semibold tabular-nums leading-tight text-right">
            {valueLabel}
            {dealing.legCount > 1 && (
              <div className="text-[10px] text-muted/80 mt-0.5 font-normal">
                {dealing.legCount} fills
              </div>
            )}
          </div>
        </div>
        {(showAlpha ? alpha != null : stockPct != null) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {showAlpha ? (
              <>
                <DeltaBadge suffix="pp" value={alpha!} />
                <span className="text-[10px] text-muted/70">
                  vs {benchmarkLabel}
                </span>
              </>
            ) : (
              <DeltaBadge value={stockPct!} />
            )}
            <MarketRowSpark
              bars={stockBars}
              benchmarkBars={benchmarkBars}
              chartMode={chartMode}
              disclosedDate={dealing.disclosedDate}
              height={18}
              tradeDate={dealing.tradeDate}
              width={64}
            />
          </div>
        )}
      </div>

      {/* ── Desktop (md+) ── */}
      <div className="hidden md:flex items-stretch">
        {!hideDate && (
          <div className="w-28 shrink-0 px-3 py-2.5 flex flex-col justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <div className="text-xs text-foreground/90 font-medium leading-tight">
              {shortDate(dealing.disclosedDate)}
            </div>
            {tradeDiffers && (
              <div className="text-[10px] text-muted/75 mt-0.5">
                trade {shortDate(dealing.tradeDate)}
              </div>
            )}
          </div>
        )}
        <div className="w-20 shrink-0 px-2 py-2.5 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <span className="font-mono text-[11px] font-semibold px-1.5 py-0 rounded bg-[#e8e0d5] dark:bg-surface-secondary">
            {ticker}
          </span>
        </div>
        <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
          {showLogo && <CompanyLogo size={28} ticker={rawTicker} />}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate leading-tight">
              {company}
            </div>
            <div className="text-[11px] text-muted truncate mt-0.5">
              {insiderLine}
            </div>
          </div>
        </div>
        <div className="w-24 shrink-0 px-3 py-2.5 flex flex-col items-end justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <div className="text-sm font-semibold tabular-nums">{valueLabel}</div>
          {dealing.legCount > 1 && (
            <div className="text-[10px] text-muted tabular-nums mt-0.5">
              {dealing.legCount} fills
            </div>
          )}
        </div>
        <div className="w-24 shrink-0 px-2 py-2.5 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <MarketRowSpark
            bars={stockBars}
            benchmarkBars={benchmarkBars}
            chartMode={chartMode}
            disclosedDate={dealing.disclosedDate}
            tradeDate={dealing.tradeDate}
          />
        </div>
        <div className="w-24 shrink-0 px-2 py-2.5 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          {showAlpha ? (
            alpha != null ? (
              <DeltaBadge suffix="pp" value={alpha} />
            ) : (
              <span className="text-[11px] text-muted/50">—</span>
            )
          ) : stockPct != null ? (
            <DeltaBadge value={stockPct} />
          ) : (
            <span className="text-[11px] text-muted/50">—</span>
          )}
        </div>
        <div className="w-40 shrink-0 px-2 py-2.5 flex flex-col items-center justify-center gap-1">
          <RowActionCell dealing={dealing} />
        </div>
      </div>
    </button>
  );
}
