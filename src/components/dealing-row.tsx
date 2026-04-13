import type { Dealing } from "@/lib/api";
import { RatingBadge } from "@/components/rating-badge";

function fmtGbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function parseDate(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { weekday: "", day: "—", month: "" };
  return {
    weekday: d.toLocaleString("en-GB", { weekday: "short" }),
    day: ordinal(d.getDate()),
    month: d.toLocaleString("en-GB", { month: "short" }),
  };
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

export function DealingRowHeader({ sticky = false, showVsFtse = false }: { sticky?: boolean; showVsFtse?: boolean }) {
  return (
    <div className={`hidden md:flex items-center text-xs text-muted font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05] rounded-t-xl ${sticky ? "sticky top-[166px] z-[9]" : ""}`}>
      <div className="w-36 shrink-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">Date</div>
      <div className="w-[4.5rem] shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">Ticker</div>
      <div className="flex-1 min-w-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">Company</div>
      <div className="w-36 shrink-0 px-4 py-2.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]">Value</div>
      <div className="w-32 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">Performance</div>
      {showVsFtse && <div className="w-28 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">vs FTSE</div>}
      <div className="w-32 shrink-0 px-4 py-2.5 text-center">Rating</div>
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
  showMonth,
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
  showMonth?: boolean;
}) {
  const a = dealing.analysis;
  const t = dealing.triage;
  const muted = !a;
  const date = parseDate(dealing.trade_date);
  const today = checkIsToday(dealing.trade_date);

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
              <span className="text-xs font-semibold text-[#6b5038]">Today</span>
            ) : (
              <span className="text-xs text-foreground/50 font-medium">
                {date.weekday} {date.day}{showMonth ? `, ${date.month}` : ""}
              </span>
            )}
          </div>
        )}
        {/* Main content: left info + right value/rating */}
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
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className="text-base font-medium tabular-nums">{fmtGbp(dealing.value_gbp)}</span>
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
        <div className="w-36 shrink-0 px-4 py-4 flex items-center border-r border-black/[0.06] dark:border-white/[0.06]">
          {hideDate ? null : today ? (
            <div className="text-base font-semibold text-[#6b5038]">Today</div>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm text-foreground/50 font-medium">{date.weekday}</span>
              <span className="text-base font-medium leading-tight">{date.day},</span>
              {showMonth && <span className="text-sm text-foreground/50 font-medium">{date.month}</span>}
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

        {/* Rating */}
        <div className="w-32 shrink-0 px-4 py-4 flex items-center justify-center">
          {a ? (
            <RatingBadge rating={a.rating} />
          ) : (
            <span className="inline-flex items-center justify-center w-full rounded-md border border-[#d0c8be]/50 bg-[#d0c8be]/10 py-2 text-sm font-semibold text-[#7a7068]">
              {VERDICT_LABEL[t?.verdict ?? ""] ?? "—"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
