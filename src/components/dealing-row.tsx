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

export function DealingRowHeader({ sticky = false }: { sticky?: boolean }) {
  return (
    <div className={`flex items-center text-xs text-muted font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05] ${sticky ? "sticky top-32 z-[9]" : ""}`}>
      <div className="w-36 shrink-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">Date</div>
      <div className="w-[4.5rem] shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">Ticker</div>
      <div className="flex-1 min-w-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">Company</div>
      <div className="w-36 shrink-0 px-4 py-2.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]">Value</div>
      <div className="w-32 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">Performance</div>
      <div className="w-32 shrink-0 px-4 py-2.5 text-center">Rating</div>
    </div>
  );
}

export function DealingRow({
  dealing,
  currentPricePence,
  selected,
  onSelect,
  rowClassName,
  hideDate,
  showMonth,
}: {
  dealing: Dealing;
  currentPricePence?: number;
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

  return (
    <button
      className={`w-full flex items-stretch text-left transition-colors
        ${muted ? "opacity-60" : ""}
        ${selected ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}
        ${rowClassName ?? ""}`}
      onClick={() => onSelect(dealing)}
    >
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
          {dealing.ticker.replace(/\.L$/, "")}
        </span>
      </div>

      {/* Company */}
      <div className="flex-1 min-w-0 px-4 py-4 flex flex-col justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
        <div className="text-base font-medium truncate leading-snug">{dealing.company.replace(/\s*\([^)]*\)\s*$/, "")}</div>
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
    </button>
  );
}
