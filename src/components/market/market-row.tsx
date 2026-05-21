import type { ComponentType } from "react";
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
  inset = false,
  valueColumnClass = "w-24",
}: {
  hideDate?: boolean;
  benchmarkLabel: string;
  chartMode: ChartMode;
  /** When true, the header columns are nudged inward by px-3 to align with
   *  the rounded day cards in the chronological view. */
  inset?: boolean;
  /** Tailwind width class for the Value column — wider for SEK. */
  valueColumnClass?: string;
}) {
  const perfLabel = chartMode.axis === "market" ? `vs ${benchmarkLabel}` : "Return";
  return (
    <div
      className={`hidden md:flex items-center text-[10px] uppercase tracking-wider text-muted/80 font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05] rounded-t-xl ${inset ? "px-3" : ""}`}
    >
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
      <div className={`${valueColumnClass} shrink-0 px-3 py-1.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]`}>
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
 *  swap places as the user scrolls without ever stacking. */
export function MarketDayHeader({
  weekday,
  day,
  isoDate,
  locale = "en-US",
  suggestedCount,
  skippedCount,
}: {
  weekday: string;
  day: string;
  isoDate: string;
  locale?: string;
  suggestedCount: number;
  skippedCount: number;
}) {
  const dateObj = new Date(isoDate);
  const monthLabel = !Number.isNaN(dateObj.getTime())
    ? dateObj.toLocaleString(locale, { month: "short" })
    : "";

  const dateLine = (
    <span className="flex items-center gap-3 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55 shrink-0">
        {weekday}
      </span>
      <span className="text-xs font-semibold text-foreground/80 tabular-nums shrink-0">
        {day} {monthLabel}
      </span>
    </span>
  );
  const counts = (
    <span className="text-[10px] text-muted/80 tabular-nums shrink-0">
      {suggestedCount}
      {skippedCount > 0 && (
        <span className="text-muted/50">
          {" · "}
          {skippedCount} skipped
        </span>
      )}
    </span>
  );

  return (
    <div className="bg-black/[0.04] dark:bg-white/[0.05]">
      {/* Mobile — flush left */}
      <div className="md:hidden flex items-center gap-3 px-4 py-1.5">
        {dateLine}
        <span className="ml-auto">{counts}</span>
      </div>
      {/* Desktop — date aligns with the avatar column in the row below */}
      <div className="hidden md:flex items-stretch">
        <div className="w-20 shrink-0" />
        <div className="flex-1 min-w-0 px-3 py-1.5 flex items-center">
          {dateLine}
        </div>
        <div className="shrink-0 px-3 py-1.5 flex items-center">{counts}</div>
      </div>
    </div>
  );
}

/** Iridescent gradient bubble used in place of a company logo on the
 *  day-summary row — signals "this is AI-generated context, not a deal". */
function AiAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 shadow-sm bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        className="text-white"
        fill="none"
        height={size * 0.5}
        viewBox="0 0 16 16"
        width={size * 0.5}
      >
        <path
          d="M8 1.5l1.2 3.3L12.5 6l-3.3 1.2L8 10.5 6.8 7.2 3.5 6l3.3-1.2L8 1.5zM13 10l.6 1.7 1.7.6-1.7.6L13 14.6l-.6-1.7L10.7 12.3l1.7-.6L13 10z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

/** Standalone "Day in review" row, rendered at the top of each day inside
 *  an open month. Mirrors MarketRow's column geometry so it slots into the
 *  same table — no ticker, AI-style avatar in place of the company logo,
 *  headline in the company/insider slot. The whole row is the click target
 *  for opening the daily summary sheet. */
export function MarketDaySummaryRow({
  isToday,
  headline,
  onOpen,
  valueColumnClass = "w-24",
}: {
  isToday?: boolean;
  headline: string;
  onOpen: () => void;
  valueColumnClass?: string;
}) {
  const label = isToday ? "Today's summary" : "Day in review";

  return (
    <button
      className="w-full text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5"
      type="button"
      onClick={onOpen}
    >
      {/* ── Mobile (<md) ── */}
      <div className="md:hidden px-3 py-2.5 flex items-center gap-2.5">
        <AiAvatar />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6b5038] dark:text-[#c4a882] leading-tight">
            {label}
          </div>
          <div className="text-[13px] font-medium text-foreground/90 mt-0.5 truncate">
            {headline}
          </div>
        </div>
      </div>

      {/* ── Desktop (md+) ── */}
      <div className="hidden md:flex items-stretch">
        <div className="w-20 shrink-0 px-2 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]" />
        <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
          <AiAvatar />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6b5038] dark:text-[#c4a882] leading-tight">
              {label}
            </div>
            <div className="text-[13px] font-medium text-foreground/90 mt-0.5 truncate">
              {headline}
            </div>
          </div>
        </div>
        <div className={`${valueColumnClass} shrink-0 px-3 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]`} />
        <div className="w-24 shrink-0 px-2 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]" />
        <div className="w-24 shrink-0 px-2 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]" />
        <div className="w-40 shrink-0 px-2 py-2.5" />
      </div>
    </button>
  );
}

/** Skeleton placeholder that matches MarketRow's column geometry on both
 *  mobile and desktop. Used while the dealings fetch is in flight so the
 *  layout doesn't jump when data arrives. */
export function MarketRowSkeleton({
  hideDate = false,
  valueColumnClass = "w-24",
}: {
  hideDate?: boolean;
  valueColumnClass?: string;
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
        <div className={`${valueColumnClass} shrink-0 px-3 py-2.5 flex flex-col items-end justify-center gap-1 border-r border-black/[0.06] dark:border-white/[0.06]`}>
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
  isMuted?: (dealing: MarketDealing<W>) => boolean;
  formatTickerDisplay?: (ticker: string) => string;
  locale?: string;
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
  isMuted,
  formatTickerDisplay,
  locale,
  showLogo = true,
  chartMode,
}: MarketRowProps<W>) {
  const showAlpha = chartMode.axis === "market";
  const muted = isMuted
    ? isMuted(dealing)
    : !dealing.rating || !dealing.isPurchase;
  const tradeDay = dealing.tradeDate.slice(0, 10);
  const disclosedDay = dealing.disclosedDate.slice(0, 10);
  const tradeDiffers = tradeDay !== disclosedDay;

  const { stockPct, alpha } = computeRowMetric({
    dealing,
    stockCurrentMajor,
    benchmarkEntry,
    benchmarkCurrent,
  });

  const rawTicker = dealing.ticker || "—";
  const ticker = formatTickerDisplay ? formatTickerDisplay(rawTicker) : rawTicker;
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
        ${muted && !selected ? "bg-black/[0.025] dark:bg-white/[0.025]" : ""}
        ${selected ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}
      onClick={onSelect}
    >
      {/* ── Mobile (<md) ── */}
      <div className="md:hidden px-3 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-foreground/50 font-medium">
            {shortDate(dealing.disclosedDate, locale)}
            {tradeDiffers && (
              <span className="text-[10px] text-muted/70 ml-1.5">
                · trade {shortDate(dealing.tradeDate, locale)}
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
              {shortDate(dealing.disclosedDate, locale)}
            </div>
            {tradeDiffers && (
              <div className="text-[10px] text-muted/75 mt-0.5">
                trade {shortDate(dealing.tradeDate, locale)}
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
        <div className={`${fmt.valueColumnClass ?? "w-24"} shrink-0 px-3 py-2.5 flex flex-col items-end justify-center border-r border-black/[0.06] dark:border-white/[0.06]`}>
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
