// Shared helpers used by the multi-market shell. Anything that's pure
// computation and doesn't render JSX lives here so adapters and shell
// components can both reach it.

import type { MarketDealing } from "@/lib/markets/types";

export interface DayBucket<W> {
  weekday: string; // "MON"
  day: string; // "4th"
  key: string; // ISO disclosed date
  dealings: MarketDealing<W>[];
  /** Split of `dealings` per the market's isSkipped predicate. When the
   *  market doesn't supply one, `suggested === dealings` and `skipped`
   *  is empty. */
  suggested: MarketDealing<W>[];
  skipped: MarketDealing<W>[];
}

export interface MonthBucket<W> {
  label: string; // "May"
  year: number;
  key: string; // "May-2026"
  days: DayBucket<W>[];
  count: number;
  suggestedCount: number;
  skippedCount: number;
}

/** Group dealings into month → day buckets keyed on disclosed_date. Excludes
 *  rows whose disclosed_date equals todayIso — those belong to the dedicated
 *  Today section above the month list. When `isSkipped` is provided, each
 *  day's dealings are split into suggested + skipped so the shell can render
 *  the skipped rows under a collapsible cluster. */
export function bucketByMonth<W>(
  dealings: MarketDealing<W>[],
  todayIso: string,
  options?: {
    locale?: string;
    isSkipped?: (d: MarketDealing<W>) => boolean;
  },
): MonthBucket<W>[] {
  const locale = options?.locale ?? "en-US";
  const isSkipped = options?.isSkipped;
  const months: MonthBucket<W>[] = [];

  for (const d of dealings) {
    const iso = d.disclosedDate.slice(0, 10);

    if (iso === todayIso) continue;
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) continue;
    const monthLabel = date.toLocaleString(locale, { month: "long" });
    const year = date.getFullYear();
    const monthKey = `${monthLabel}-${year}`;
    let bucket = months.find((m) => m.key === monthKey);

    if (!bucket) {
      bucket = {
        label: monthLabel,
        year,
        key: monthKey,
        days: [],
        count: 0,
        suggestedCount: 0,
        skippedCount: 0,
      };
      months.push(bucket);
    }
    let day = bucket.days.find((db) => db.key === iso);

    if (!day) {
      const weekday = date
        .toLocaleString(locale, { weekday: "short" })
        .toUpperCase();

      day = {
        weekday,
        day: ordinal(date.getDate()),
        key: iso,
        dealings: [],
        suggested: [],
        skipped: [],
      };
      bucket.days.push(day);
    }
    day.dealings.push(d);
    const skipped = isSkipped ? isSkipped(d) : false;

    if (skipped) {
      day.skipped.push(d);
      bucket.skippedCount++;
    } else {
      day.suggested.push(d);
      bucket.suggestedCount++;
    }
    bucket.count++;
  }

  return months;
}

export function ordinal(n: number): string {
  const v = n % 100;

  if (v >= 11 && v <= 13) return `${n}th`;

  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

/** ISO `YYYY-MM-DD` for the local day. Markets resolve "today" in whatever
 *  timezone they care about by passing a custom Date in. */
export function todayKeyIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function stockReturnPct(entry: number, currentMajor: number): number {
  return ((currentMajor - entry) / entry) * 100;
}

export function benchmarkReturnPct(
  entryClose: number,
  currentClose: number,
): number {
  return ((currentClose - entryClose) / entryClose) * 100;
}

/** Tone ramp used by the delta badge. Magnitude grows up to ~30% before
 *  saturating. Mirrors the UK dashboard styling so all markets get the same
 *  visual language. */
export function deltaStyle(delta: number): { bg: string; text: string } {
  const abs = Math.abs(delta);
  const t = Math.min(abs / 30, 1);

  if (delta >= 0) {
    const bgAlpha = (0.08 + t * 0.22).toFixed(2);
    const l = Math.round(42 - t * 18);
    const c = (0.1 + t * 0.14).toFixed(3);

    return {
      bg: `oklch(${l}% ${c} 155 / ${bgAlpha})`,
      text: `oklch(${l}% ${c} 155)`,
    };
  }
  const bgAlpha = (0.08 + t * 0.22).toFixed(2);
  const l = Math.round(45 - t * 16);
  const c = (0.1 + t * 0.14).toFixed(3);

  return {
    bg: `oklch(${l}% ${c} 18 / ${bgAlpha})`,
    text: `oklch(${l}% ${c} 18)`,
  };
}

export function shortDate(iso: string, locale = "en-US"): string {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return iso;

  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** Cached per-row return numbers — derived purely from the inputs the shell
 *  has already computed for the live-price + benchmark fetches. The
 *  sparkline column and the right-most Performance cell both read from
 *  this so they can never disagree. */
export interface RowMetric {
  /** Stock's own return %, anchored at the dealing's entry price. */
  stockPct: number | null;
  /** Benchmark return % over the same window. */
  benchPct: number | null;
  /** stockPct − benchPct, in percentage points. */
  alpha: number | null;
}

export function computeRowMetric<W>({
  dealing,
  stockCurrentMajor,
  benchmarkEntry,
  benchmarkCurrent,
}: {
  dealing: MarketDealing<W>;
  stockCurrentMajor: number | undefined;
  benchmarkEntry: number | undefined;
  benchmarkCurrent: number | undefined;
}): RowMetric {
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

  return { stockPct, benchPct, alpha };
}
