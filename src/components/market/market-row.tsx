import type { ComponentType } from "react";
import type { PriceFormat } from "@/components/position-card";
import type { MarketDealing } from "@/lib/markets/types";

import {
  benchmarkReturnPct,
  deltaStyle,
  shortDate,
  stockReturnPct,
} from "./market-utils";

import { Skeleton } from "@/components/skeleton";
import { CompanyLogo } from "@/components/company-logo";

/** Column headers above the row list. `hideDate` matches the per-section
 *  Today cluster which gets its own date heading. When `singlePerf` is true
 *  the two separate Return/vs-benchmark cells collapse into one Performance
 *  cell — used by markets that opt into useMetricMode. */
export function MarketRowHeader({
  hideDate = false,
  benchmarkLabel,
  singlePerf = false,
}: {
  hideDate?: boolean;
  benchmarkLabel: string;
  singlePerf?: boolean;
}) {
  return (
    <div className="hidden md:flex items-center text-xs text-muted font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05] rounded-t-xl">
      {!hideDate && (
        <div className="w-32 shrink-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
          Disclosed
        </div>
      )}
      <div className="w-24 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
        Ticker
      </div>
      <div className="flex-1 min-w-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
        Company / Insider
      </div>
      <div className="w-32 shrink-0 px-4 py-2.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]">
        Value
      </div>
      {singlePerf ? (
        <div className="w-32 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
          Performance
        </div>
      ) : (
        <>
          <div className="w-24 shrink-0 px-2 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
            Return
          </div>
          <div className="w-24 shrink-0 px-2 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
            vs {benchmarkLabel}
          </div>
        </>
      )}
      <div className="w-44 shrink-0 px-3 py-2.5 text-center">Action</div>
    </div>
  );
}

/** Skeleton placeholder that matches MarketRow's column geometry on both
 *  mobile and desktop. Used while the dealings fetch is in flight so the
 *  layout doesn't jump when data arrives. */
export function MarketRowSkeleton({
  hideDate = false,
  singlePerf = false,
}: {
  hideDate?: boolean;
  singlePerf?: boolean;
}) {
  return (
    <div className="w-full">
      {/* Mobile */}
      <div className="md:hidden px-4 py-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex items-start gap-3">
          <Skeleton circle className="shrink-0 mt-0.5" h={36} w={36} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-4 flex-1 rounded" />
            </div>
            <Skeleton className="h-3 w-2/3 rounded" />
          </div>
          <Skeleton className="h-5 w-16 rounded shrink-0" />
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:flex items-stretch">
        {!hideDate && (
          <div className="w-32 shrink-0 px-4 py-4 flex items-center border-r border-black/[0.06] dark:border-white/[0.06] min-h-[4rem]">
            <Skeleton className="h-4 w-20 rounded" />
          </div>
        )}
        <div className="w-24 shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton className="h-5 w-10 rounded" />
        </div>
        <div className="flex-1 min-w-0 px-4 py-4 flex items-center gap-3 border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton circle className="shrink-0" h={36} w={36} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-1/2 rounded" />
            <Skeleton className="h-3 w-2/5 rounded" />
          </div>
        </div>
        <div className="w-32 shrink-0 px-4 py-4 flex flex-col items-end justify-center gap-1.5 border-r border-black/[0.06] dark:border-white/[0.06]">
          <Skeleton className="h-5 w-20 rounded" />
          <Skeleton className="h-3 w-14 rounded" />
        </div>
        {singlePerf ? (
          <div className="w-32 shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ) : (
          <>
            <div className="w-24 shrink-0 px-2 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="w-24 shrink-0 px-2 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </>
        )}
        <div className="w-44 shrink-0 px-3 py-4 flex items-center justify-center">
          <Skeleton className="h-6 w-24 rounded-full" />
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
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-sm font-semibold whitespace-nowrap"
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
  /** Benchmark close on the dealing's trade_date — raw value from the
   *  prices table (index points). */
  benchmarkEntry?: number;
  /** Benchmark close right now — same units as benchmarkEntry. */
  benchmarkCurrent?: number;
  fmt: PriceFormat;
  benchmarkLabel: string;
  RowActionCell: ComponentType<{ dealing: MarketDealing<W> }>;
  hideDate?: boolean;
  /** When false, the CompanyLogo bubble is suppressed entirely. Default true.
   *  Set from MarketConfig.enableLogos by the shell — used by Sweden where
   *  logo.dev coverage is too thin to bother. */
  showLogo?: boolean;
  /** When set, the row renders a single Performance cell that flips between
   *  raw return and alpha based on `isVsMarket`. When omitted the row keeps
   *  the older two-cell (Return + vs Benchmark) layout. */
  metricMode?: { isVsMarket: boolean };
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
  fmt,
  benchmarkLabel,
  RowActionCell,
  hideDate,
  showLogo = true,
  metricMode,
}: MarketRowProps<W>) {
  const singlePerf = !!metricMode;
  const showAlpha = metricMode?.isVsMarket ?? false;
  // Loud when the row has earned an analysis rating, quiet otherwise. Mirrors
  // the UK row's `muted = !analysis` convention so the unread pool fades and
  // the analysed rows stand out at a glance.
  const muted = !dealing.rating || !dealing.isPurchase;
  const tradeDay = dealing.tradeDate.slice(0, 10);
  const disclosedDay = dealing.disclosedDate.slice(0, 10);
  const tradeDiffers = tradeDay !== disclosedDay;

  const stockPct =
    dealing.entryPrice != null &&
    stockCurrentMajor != null &&
    dealing.entryPrice > 0
      ? stockReturnPct(dealing.entryPrice, stockCurrentMajor)
      : null;
  const benchPct =
    benchmarkEntry != null && benchmarkCurrent != null && benchmarkEntry > 0
      ? benchmarkReturnPct(benchmarkEntry, benchmarkCurrent)
      : null;
  const alpha =
    stockPct != null && benchPct != null ? stockPct - benchPct : null;

  // UK LSE tickers carry a ".L" suffix on the wire (used by /api/prices)
  // but it's noise in the UI. Stripping a trailing ".L" is a no-op for
  // every other market.
  const ticker = (dealing.ticker || "—").replace(/\.L$/, "");
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
      <div className="md:hidden px-4 py-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-xs text-foreground/50 font-medium">
            {shortDate(dealing.disclosedDate)}
            {tradeDiffers && (
              <span className="text-[10px] text-muted/70 ml-2">
                · trade {shortDate(dealing.tradeDate)}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <RowActionCell dealing={dealing} />
          </div>
        </div>
        <div className="flex items-start gap-3">
          {showLogo && (
            <CompanyLogo className="mt-0.5" size={36} ticker={ticker} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary shrink-0">
                {ticker}
              </span>
              <span className="text-sm font-medium truncate">{company}</span>
            </div>
            <div className="text-xs text-muted truncate mt-1">
              {insiderLine}
            </div>
          </div>
          <div className="shrink-0 text-base font-medium tabular-nums leading-tight text-right">
            {valueLabel}
            {dealing.legCount > 1 && (
              <div className="text-[10px] text-muted/80 mt-0.5">
                {dealing.legCount} fills
              </div>
            )}
          </div>
        </div>
        {singlePerf
          ? (showAlpha ? alpha != null : stockPct != null) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
              </div>
            )
          : (stockPct != null || alpha != null) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {stockPct != null && <DeltaBadge value={stockPct} />}
                {alpha != null && <DeltaBadge suffix="pp" value={alpha} />}
                {alpha != null && (
                  <span className="text-[10px] text-muted/70">
                    vs {benchmarkLabel}
                  </span>
                )}
              </div>
            )}
      </div>

      {/* ── Desktop (md+) ── */}
      <div className="hidden md:flex items-stretch">
        {!hideDate && (
          <div className="w-32 shrink-0 px-4 py-4 flex flex-col justify-center border-r border-black/[0.06] dark:border-white/[0.06] min-h-[4rem]">
            <div className="text-sm text-foreground/90 font-medium leading-tight">
              {shortDate(dealing.disclosedDate)}
            </div>
            {tradeDiffers && (
              <div className="text-[10px] text-muted/75 mt-1">
                trade {shortDate(dealing.tradeDate)}
              </div>
            )}
          </div>
        )}
        <div className="w-24 shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <span className="font-mono text-sm font-semibold px-2 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary">
            {ticker}
          </span>
        </div>
        <div className="flex-1 min-w-0 px-4 py-4 flex items-center gap-3 border-r border-black/[0.06] dark:border-white/[0.06]">
          {showLogo && <CompanyLogo size={36} ticker={ticker} />}
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium truncate leading-snug">
              {company}
            </div>
            <div className="text-sm text-muted truncate mt-0.5">
              {insiderLine}
            </div>
          </div>
        </div>
        <div className="w-32 shrink-0 px-4 py-4 flex flex-col items-end justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <div className="text-xl font-medium tabular-nums">{valueLabel}</div>
          {dealing.legCount > 1 && (
            <div className="text-xs text-muted tabular-nums mt-0.5">
              {dealing.legCount} fills
            </div>
          )}
        </div>
        {singlePerf ? (
          <div className="w-32 shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            {showAlpha ? (
              alpha != null ? (
                <DeltaBadge suffix="pp" value={alpha} />
              ) : (
                <span className="text-xs text-muted/50">—</span>
              )
            ) : stockPct != null ? (
              <DeltaBadge value={stockPct} />
            ) : (
              <span className="text-xs text-muted/50">—</span>
            )}
          </div>
        ) : (
          <>
            <div className="w-24 shrink-0 px-2 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
              {stockPct != null ? (
                <DeltaBadge value={stockPct} />
              ) : (
                <span className="text-xs text-muted/50">—</span>
              )}
            </div>
            <div className="w-24 shrink-0 px-2 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
              {alpha != null ? (
                <DeltaBadge suffix="pp" value={alpha} />
              ) : (
                <span className="text-xs text-muted/50">—</span>
              )}
            </div>
          </>
        )}
        <div className="w-44 shrink-0 px-3 py-4 flex flex-col items-center justify-center gap-1">
          <RowActionCell dealing={dealing} />
        </div>
      </div>
    </button>
  );
}
