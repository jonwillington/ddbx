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

function parseDate(iso: string): { weekday: string; day: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { weekday: "", day: "—" };
  return {
    weekday: d.toLocaleString("en-GB", { weekday: "short" }),
    day: ordinal(d.getDate()),
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

function PriceDelta({ entry, current }: { entry: number; current: number }) {
  const delta = ((current - entry) / entry) * 100;
  const sign = delta >= 0 ? "+" : "";
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold
        ${up ? "bg-[#7a6552]/10 text-[#5c4a38]" : "bg-[#b8ad9e]/15 text-[#7a6e63]"}`}
    >
      {up ? "▲" : "▼"} {sign}{delta.toFixed(1)}%
    </span>
  );
}

export function DealingRow({
  dealing,
  currentPricePence,
  selected,
  onSelect,
  rowClassName,
}: {
  dealing: Dealing;
  currentPricePence?: number;
  selected?: boolean;
  onSelect: (dealing: Dealing) => void;
  rowClassName?: string;
}) {
  const a = dealing.analysis;
  const t = dealing.triage;
  const muted = !a;
  const date = parseDate(dealing.trade_date);
  const today = checkIsToday(dealing.trade_date);

  return (
    <button
      className={`w-full flex items-center gap-4 px-6 py-3 text-left transition-colors
        ${muted ? "opacity-60" : ""}
        ${selected ? "ring-2 ring-[#7a6552]" : "hover:bg-black/10 dark:hover:bg-white/5"}
        ${rowClassName ?? ""}`}
      onClick={() => onSelect(dealing)}
    >
      {/* Date column */}
      <div className="flex flex-col w-24 shrink-0 pr-4 -my-2 py-2 justify-center">
        {today ? (
          <div className="text-base font-semibold text-[#7a6552]">Today</div>
        ) : (
          <>
            <div className="text-[11px] text-muted uppercase tracking-wide leading-none mb-0.5">
              {date.weekday}
            </div>
            <div className="text-xl font-semibold leading-tight">
              {date.day}
            </div>
          </>
        )}
      </div>

      {/* Ticker column */}
      <div className="w-20 shrink-0 flex items-center">
        <span className="font-mono text-sm font-semibold bg-surface px-1.5 py-0.5 rounded border border-separator text-foreground">
          {dealing.ticker.replace(/\.L$/, "")}
        </span>
      </div>

      {/* Company + director */}
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold truncate">{dealing.company.replace(/\s*\([^)]*\)\s*$/, "")}</div>
        <div className="text-xs text-muted truncate">
          {dealing.director.name} · {dealing.director.role}
        </div>
      </div>

      {/* Value + rating */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <div className="text-xl font-semibold">{fmtGbp(dealing.value_gbp)}</div>
        </div>
        {currentPricePence != null && (
          <PriceDelta entry={dealing.price_pence} current={currentPricePence} />
        )}
        {a ? (
          <RatingBadge rating={a.rating} className="ml-6" />
        ) : (
          <span className="ml-6 inline-flex items-center justify-center w-28 rounded-md border border-[#d0c8be]/50 bg-[#d0c8be]/10 py-1.5 text-xs font-semibold text-[#9a9188]">
            {VERDICT_LABEL[t?.verdict ?? ""] ?? "—"}
          </span>
        )}
      </div>
    </button>
  );
}
