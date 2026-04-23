import type { Dealing } from "@/lib/api";
import { RatingBadge } from "@/components/rating-badge";
import { isSuggestedDealing } from "@/lib/dealing-classify";
import { formatDisclosedCompact, formatDisclosedParts } from "@/lib/dealing-dates";

function fmtGbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function checkIsToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function shortTradeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
}

const VERDICT_LABEL: Record<string, string> = {
  skip: "Skipped",
  maybe: "Maybe",
  promising: "Promising",
};

function deltaStyle(delta: number): { bg: string; text: string } {
  const abs = Math.abs(delta);
  // Intensity ramps from 0% → 30%+
  const t = Math.min(abs / 30, 1);

  if (delta >= 0) {
    const bgAlpha = (0.08 + t * 0.22).toFixed(2);
    const l = Math.round(42 - t * 18);           // lightness 42% → 24%
    const c = (0.10 + t * 0.14).toFixed(3);       // chroma 0.10 → 0.24
    return {
      bg: `oklch(${l}% ${c} 155 / ${bgAlpha})`,
      text: `oklch(${l}% ${c} 155)`,
    };
  } else {
    const bgAlpha = (0.08 + t * 0.22).toFixed(2);
    const l = Math.round(45 - t * 16);
    const c = (0.10 + t * 0.14).toFixed(3);
    return {
      bg: `oklch(${l}% ${c} 18 / ${bgAlpha})`,
      text: `oklch(${l}% ${c} 18)`,
    };
  }
}

function PriceDelta({ entry, current }: { entry: number; current: number }) {
  const delta = ((current - entry) / entry) * 100;
  const sign = delta >= 0 ? "+" : "";
  const { bg, text } = deltaStyle(delta);
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-sm font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {delta >= 0 ? "▲" : "▼"} {sign}{delta.toFixed(1)}%
    </span>
  );
}

function AlphaDelta({ stockEntry, stockCurrent, ftseEntry, ftseCurrent }: { stockEntry: number; stockCurrent: number; ftseEntry: number; ftseCurrent: number }) {
  const stockPct = ((stockCurrent - stockEntry) / stockEntry) * 100;
  const ftsePct = ((ftseCurrent - ftseEntry) / ftseEntry) * 100;
  const alpha = stockPct - ftsePct;
  const sign = alpha >= 0 ? "+" : "";
  const { bg, text } = deltaStyle(alpha);
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-sm font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {sign}{alpha.toFixed(1)}%
    </span>
  );
}

export function DealingRowHeader({ showVsFtse = false }: { showVsFtse?: boolean }) {
  return (
    <div className="hidden md:flex items-center text-xs text-muted font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05] rounded-t-xl">
      <div className="w-40 shrink-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">Disclosed</div>
      <div className="w-[4.5rem] shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">Ticker</div>
      <div className="flex-1 min-w-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">Company</div>
      <div className="w-36 shrink-0 px-4 py-2.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]">Value</div>
      <div className="w-32 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">Performance</div>
      {showVsFtse && <div className="w-28 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">vs FTSE</div>}
      <div className="w-40 shrink-0 px-4 py-2.5 text-center">Rating</div>
    </div>
  );
}

export function DealingRow({
  dealing,
  currentPricePence,
  ftseEntryPence,
  ftseCurrentPence,
  showVsFtse,
  selected,
  onSelect,
  rowClassName,
  hideDate,
  suppressSkippedLabel,
}: {
  dealing: Dealing;
  currentPricePence?: number;
  ftseEntryPence?: number;
  ftseCurrentPence?: number;
  showVsFtse?: boolean;
  selected?: boolean;
  onSelect: (dealing: Dealing) => void;
  rowClassName?: string;
  hideDate?: boolean;
  /** Hide the extra "Skipped" hint (e.g. rows inside an expanded skipped cluster). */
  suppressSkippedLabel?: boolean;
}) {
  const a = dealing.analysis;
  const t = dealing.triage;
  const muted = !a;
  const pipelineSkipped = !isSuggestedDealing(dealing);
  const skipStampRedundant =
    t?.verdict === "skip" && !a;
  const showSkippedNearDisclosure =
    pipelineSkipped &&
    !suppressSkippedLabel &&
    !skipStampRedundant;
  const displayIso = dealing.disclosed_date || dealing.trade_date;
  const { dateLabel, timePart } = formatDisclosedParts(displayIso);
  const today = checkIsToday(displayIso);
  const tradeDay = dealing.trade_date.slice(0, 10);
  const disclosedDay = (dealing.disclosed_date || dealing.trade_date).slice(0, 10);
  const tradeDiffers = tradeDay !== disclosedDay;

  const tickerLabel = dealing.ticker.replace(/\.L$/, "");
  const companyLabel = dealing.company.replace(/\s*\([^)]*\)\s*$/, "");

  return (
    <button
      className={`w-full text-left transition-colors
        ${muted ? "opacity-60" : ""}
        ${selected ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}
        ${rowClassName ?? ""}`}
      onClick={() => onSelect(dealing)}
    >
      {/* ── Mobile card layout (<md) ── */}
      <div className="md:hidden px-4 py-3.5">
        {/* Top line: date (if shown) */}
        {!hideDate && (
          <div className="mb-2">
            {today ? (
              <div>
                <span className="text-xs font-semibold text-[#6b5038]">Today</span>
                {timePart && (
                  <span className="block text-[10px] text-muted tabular-nums mt-0.5">{timePart}</span>
                )}
              </div>
            ) : (
              <div>
                <span className="text-xs text-foreground/50 font-medium">{dateLabel}</span>
                {timePart && (
                  <span className="block text-[10px] text-muted tabular-nums mt-0.5">{timePart}</span>
                )}
              </div>
            )}
            {tradeDiffers && (
              <span className="block text-[10px] text-muted/70 mt-1">
                Trade · {shortTradeDate(dealing.trade_date)}
              </span>
            )}
          </div>
        )}
        {/* Main content: left info + right value / Skipped / rating */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary shrink-0">
                {tickerLabel}
              </span>
              <span className="text-sm font-medium truncate">{companyLabel}</span>
            </div>
            <div className="text-xs text-muted truncate mt-1">
              {dealing.director.name} · {dealing.director.role}
            </div>
            {hideDate && (
              <div className="text-[10px] text-muted/90 tabular-nums mt-1">
                {formatDisclosedCompact(displayIso)}
                {tradeDiffers && (
                  <span className="text-muted/60"> · trade {shortTradeDate(dealing.trade_date)}</span>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-base font-medium tabular-nums leading-tight">{fmtGbp(dealing.value_gbp)}</span>
            {showSkippedNearDisclosure && (
              <span className="text-[10px] font-semibold text-amber-900/85 dark:text-amber-200/75 leading-none">
                Skipped
              </span>
            )}
            {a ? (
              <RatingBadge rating={a.rating} />
            ) : (
              <span className="inline-flex items-center rounded-md border border-[#d0c8be]/50 bg-[#d0c8be]/10 px-2 py-0.5 text-xs font-semibold text-[#7a7068]">
                {VERDICT_LABEL[t?.verdict ?? ""] ?? "—"}
              </span>
            )}
          </div>
        </div>
        {/* Performance pill on mobile */}
        {currentPricePence != null && (
          <div className="mt-2">
            <PriceDelta entry={dealing.price_pence} current={currentPricePence} />
          </div>
        )}
      </div>

      {/* ── Desktop table layout (md+) ── */}
      <div className="hidden md:flex items-stretch">
        {/* Date */}
        <div className="w-40 shrink-0 px-4 py-4 flex flex-col justify-center border-r border-black/[0.06] dark:border-white/[0.06] min-h-[3.5rem]">
          {hideDate ? (
            <div>
              <div className="text-xs text-foreground/85 font-medium leading-snug">
                {formatDisclosedCompact(displayIso)}
              </div>
              {tradeDiffers && (
                <div className="text-[10px] text-muted/75 mt-1">
                  Trade · {shortTradeDate(dealing.trade_date)}
                </div>
              )}
            </div>
          ) : today ? (
            <div>
              <div className="text-base font-semibold text-[#6b5038]">Today</div>
              {timePart && (
                <div className="text-xs text-muted tabular-nums mt-0.5">{timePart}</div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-sm text-foreground/90 font-medium leading-tight">{dateLabel}</div>
              {timePart && (
                <div className="text-xs text-muted tabular-nums mt-0.5">{timePart}</div>
              )}
              {tradeDiffers && (
                <div className="text-[10px] text-muted/75 mt-1">
                  Trade · {shortTradeDate(dealing.trade_date)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ticker */}
        <div className="w-[4.5rem] shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <span className="font-mono text-sm font-semibold px-2 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary">
            {tickerLabel}
          </span>
        </div>

        {/* Company */}
        <div className="flex-1 min-w-0 px-4 py-4 flex flex-col justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          <div className="text-base font-medium truncate leading-snug">{companyLabel}</div>
          <div className="text-sm text-muted truncate mt-0.5">
            {dealing.director.name} · {dealing.director.role}
          </div>
        </div>

        {/* Value */}
        <div className="w-36 shrink-0 px-4 py-4 flex items-center justify-end border-r border-black/[0.06] dark:border-white/[0.06]">
          <div className="text-xl font-medium tabular-nums">{fmtGbp(dealing.value_gbp)}</div>
        </div>

        {/* Performance */}
        <div className="w-32 shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
          {currentPricePence != null ? (
            <PriceDelta entry={dealing.price_pence} current={currentPricePence} />
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </div>

        {/* vs FTSE — alpha over the index */}
        {showVsFtse && (
          <div className="w-28 shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            {currentPricePence != null && ftseEntryPence != null && ftseCurrentPence != null ? (
              <AlphaDelta
                stockEntry={dealing.price_pence}
                stockCurrent={currentPricePence}
                ftseEntry={ftseEntryPence}
                ftseCurrent={ftseCurrentPence}
              />
            ) : (
              <span className="text-xs text-muted">—</span>
            )}
          </div>
        )}

        {/* Rating — Skipped stacks above badge on the right when relevant */}
        <div className="w-40 shrink-0 px-4 py-4 flex flex-col items-end justify-center gap-1">
          {showSkippedNearDisclosure && (
            <span className="text-[10px] font-semibold text-amber-900/85 dark:text-amber-200/75 leading-none">
              Skipped
            </span>
          )}
          {a ? (
            <RatingBadge rating={a.rating} />
          ) : (
            <span className="inline-flex items-center justify-center rounded-md border border-[#d0c8be]/50 bg-[#d0c8be]/10 py-2 px-3 text-sm font-semibold text-[#7a7068]">
              {VERDICT_LABEL[t?.verdict ?? ""] ?? "—"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
