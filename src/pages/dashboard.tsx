import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DefaultLayout from "@/layouts/default";
import { title, subtitle } from "@/components/primitives";
import { DealingRow } from "@/components/dealing-row";
import { DealingDetailPanel } from "@/components/dealing-detail-panel";
import { Skeleton } from "@/components/skeleton";
import { api, type Dealing, type Rating } from "@/lib/api";

type Filter = Rating | "all";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "all" },
  { label: "Significant", value: "significant" },
  { label: "Noteworthy", value: "noteworthy" },
  { label: "Minor", value: "minor" },
];

interface DayBucket {
  weekday: string;       // e.g. "THU"
  day: string;           // e.g. "4th"
  key: string;           // ISO date e.g. "2026-04-08"
  all: Dealing[];
  analysedCount: number;
  skippedCount: number;
}

interface MonthBucket {
  label: string;
  year: number;
  key: string;
  days: DayBucket[];
  analysedCount: number;
  skippedCount: number;
}

type Segment =
  | { type: "analysed"; deal: Dealing }
  | { type: "skipped"; deals: Dealing[]; clusterKey: string };

// A dealing only counts as "suggested" if Opus actually rated it above the
// noise floor. "routine" means <2 of 6 checklist items passed — functionally
// the same as a triage skip, so we group it with the skipped cluster.
function isSuggested(d: Dealing): boolean {
  return !!d.analysis && d.analysis.rating !== "routine";
}

function buildSegments(all: Dealing[], monthKey: string, filter: Filter): Segment[] {
  const segments: Segment[] = [];
  let pendingSkipped: Dealing[] = [];

  const flushSkipped = () => {
    if (pendingSkipped.length > 0) {
      segments.push({
        type: "skipped",
        deals: [...pendingSkipped],
        clusterKey: `${monthKey}-${pendingSkipped[0].id}`,
      });
      pendingSkipped = [];
    }
  };

  for (const d of all) {
    if (isSuggested(d) && (filter === "all" || d.analysis!.rating === filter)) {
      flushSkipped();
      segments.push({ type: "analysed", deal: d });
    } else if (!isSuggested(d)) {
      pendingSkipped.push(d);
    }
    // filtered-out analysed: silently skip — don't break skipped cluster
  }
  flushSkipped();
  return segments;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const [dealings, setDealings] = useState<Dealing[] | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [ftseEntries, setFtseEntries] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [openSkipped, setOpenSkipped] = useState<Set<string>>(new Set());
  const [skippedVisible, setSkippedVisible] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => (routeId && dealings ? dealings.find((d) => d.id === routeId) ?? null : null),
    [routeId, dealings],
  );

  const selectDealing = (d: Dealing | null) => {
    if (d) navigate(`/dealings/${d.id}`);
    else navigate("/");
  };

  useEffect(() => {
    api.dealings().then(setDealings).catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (!dealings || dealings.length === 0) return;
    const tickers = [...new Set(dealings.map((d) => d.ticker)), "^FTAS"];
    api.latestPrices(tickers).then((list) => {
      const map: Record<string, number> = {};
      for (const p of list) map[p.ticker] = p.price_pence;
      setPrices(map);
    }).catch(() => {});
  }, [dealings]);

  // Lazy-load FTSE entry price per trade date when a dealing is opened.
  useEffect(() => {
    if (!selected) return;
    const tradeDate = selected.trade_date.slice(0, 10);
    if (ftseEntries[tradeDate] != null) return;
    api.priceOn("^FTAS", tradeDate).then((price) => {
      if (price != null) setFtseEntries((prev) => ({ ...prev, [tradeDate]: price }));
    }).catch(() => {});
  }, [selected?.id]);

  const grouped = useMemo((): MonthBucket[] => {
    if (!dealings) return [];
    const buckets: MonthBucket[] = [];
    for (const d of dealings) {
      const date = new Date(d.trade_date);
      const monthLabel = date.toLocaleString("en-GB", { month: "long" });
      const year = date.getFullYear();
      const monthKey = `${monthLabel}-${year}`;
      let bucket = buckets.find((b) => b.key === monthKey);
      if (!bucket) {
        bucket = { label: monthLabel, year, key: monthKey, days: [], analysedCount: 0, skippedCount: 0 };
        buckets.push(bucket);
      }

      const dayKey = d.trade_date.slice(0, 10);
      let day = bucket.days.find((db) => db.key === dayKey);
      if (!day) {
        const weekday = date.toLocaleString("en-GB", { weekday: "short" }).toUpperCase();
        const dayStr = ordinal(date.getDate());
        day = { weekday, day: dayStr, key: dayKey, all: [], analysedCount: 0, skippedCount: 0 };
        bucket.days.push(day);
      }
      day.all.push(d);
      if (isSuggested(d)) { day.analysedCount++; bucket.analysedCount++; }
      else { day.skippedCount++; bucket.skippedCount++; }
    }
    return buckets;
  }, [dealings]);

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSkipped = (clusterKey: string) => {
    setOpenSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(clusterKey)) next.delete(clusterKey);
      else next.add(clusterKey);
      return next;
    });
  };

  const showMoreSkipped = (clusterKey: string) => {
    setSkippedVisible((prev) => ({ ...prev, [clusterKey]: (prev[clusterKey] ?? 5) + 5 }));
  };

  const renderSkippedCluster = (deals: Dealing[], clusterKey: string) => {
    const isOpen = openSkipped.has(clusterKey);
    const newest = deals[0];
    const d = new Date(newest.trade_date);
    const weekday = d.toLocaleString("en-GB", { weekday: "short" });
    const day = d.getDate();
    const limit = skippedVisible[clusterKey] ?? 5;
    const visible = deals.slice(0, limit);
    const remaining = deals.length - limit;

    const topTickers = deals.slice(0, 4).map((x) => x.ticker.replace(/\.L$/, ""));
    const caption = topTickers.join(", ") + (deals.length > 4 ? " ···" : "");

    return (
      <div className="bg-[#f5f0e8] dark:bg-black/20">
        {/* Cluster trigger row */}
        <button
          className="w-full px-6 py-3 flex items-center gap-4 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          onClick={() => toggleSkipped(clusterKey)}
        >
          <div className="flex flex-col w-24 shrink-0 pr-4 justify-center">
            <div className="text-[11px] text-[#b8a898] uppercase tracking-wide leading-none mb-0.5">{weekday}</div>
            <div className="text-xl font-semibold leading-tight text-[#9a8878]">{ordinal(day)}</div>
          </div>
          <div className="w-20 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-[#9a8878] flex items-center gap-1.5">
              {deals.length} skipped
              <span className={`text-sm transition-transform duration-200 inline-block ${isOpen ? "rotate-180" : ""}`}>▾</span>
            </div>
            <div className="text-xs text-[#b8a898] mt-0.5 font-mono">{caption}</div>
          </div>
        </button>

        {/* Expanded rows */}
        {isOpen && (
          <div className="divide-y divide-[#ccc4b8] dark:divide-separator">
            {visible.map((d) => (
              <DealingRow
                key={d.id}
                dealing={d}
                currentPricePence={prices[d.ticker]}
                selected={selected?.id === d.id}
                onSelect={selectDealing}
                hideDate
              />
            ))}
            {remaining > 0 && (
              <div className="px-6 py-3">
                <button
                  className="text-xs text-[#9a8878] hover:text-[#7a6552] transition-colors"
                  onClick={() => showMoreSkipped(clusterKey)}
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
  };

  return (
    <DefaultLayout>
      <section className="py-8 space-y-6">
        <div className="text-center py-8">
          <h1 className={title()}>Director dealings rated</h1>
          <p className={subtitle({ class: "mt-2 max-w-md mx-auto" })}>
            UK director purchases, triaged and deep-analysed overnight. Expand a
            row to see the evidence for and against.
          </p>
        </div>

        <div className="space-y-3">
          {/* Rating filter chips */}
          <div className="-mx-6 bg-[#faf7f2] dark:bg-content1 px-6 py-4 rounded-2xl flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  filter === f.value
                    ? "border-[#7a6552] bg-[#7a6552]/10 text-[#7a6552]"
                    : "border-separator text-muted hover:border-[#7a6552]/50"
                }`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {err && <div className="text-sm text-red-400">Error: {err}</div>}

          {!dealings ? (
            <DashboardSkeleton />
          ) : grouped.length === 0 ? (
            <div className="text-sm text-muted">No dealings match this filter.</div>
          ) : (
            <div className="space-y-3 animate-content-in">
              {grouped.map(({ label, year, key, days, analysedCount, skippedCount }, i) => {
                const monthOpen = i === 0 || openMonths.has(key);

                return (
                  <div key={key} className="-mx-6 bg-[#faf7f2] dark:bg-content1 rounded-2xl overflow-hidden">
                    {/* Month header */}
                    {i === 0 ? (
                      <div className="px-6 pt-5 pb-3">
                        <div className="text-xl font-semibold">{label} {year}</div>
                        <div className="text-xs text-muted mt-0.5">
                          {analysedCount} analysed · {skippedCount} skipped
                        </div>
                      </div>
                    ) : (
                      <button
                        className="w-full flex items-center justify-between px-6 py-5"
                        onClick={() => toggleMonth(key)}
                      >
                        <div className="text-left">
                          <div className="text-xl font-semibold">{label} {year}</div>
                          <div className="text-xs text-muted mt-0.5">
                            {analysedCount} analysed · {skippedCount} skipped
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${monthOpen ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}

                    {monthOpen && (
                      <div className="divide-y divide-[#e8e0d5] dark:divide-separator">
                        {days.map((day) => {
                          const segments = buildSegments(day.all, day.key, filter);

                          return segments.map((seg) =>
                            seg.type === "analysed" ? (
                              <DealingRow
                                key={seg.deal.id}
                                dealing={seg.deal}
                                currentPricePence={prices[seg.deal.ticker]}
                                selected={selected?.id === seg.deal.id}
                                onSelect={selectDealing}
                              />
                            ) : (
                              <div key={seg.clusterKey}>
                                {renderSkippedCluster(seg.deals, seg.clusterKey)}
                              </div>
                            )
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <DealingDetailPanel
        dealing={selected}
        currentPricePence={selected ? prices[selected.ticker] : undefined}
        ftseEntryPence={selected ? ftseEntries[selected.trade_date.slice(0, 10)] : undefined}
        ftseCurrentPence={prices["^FTAS"]}
        onClose={() => selectDealing(null)}
      />
    </DefaultLayout>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="-mx-6 bg-[#faf7f2] dark:bg-content1 rounded-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-32 mt-2" />
        </div>
        <div className="divide-y divide-[#e8e0d5] dark:divide-separator">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="px-6 py-4 flex items-center gap-4">
      <div className="flex flex-col w-24 shrink-0 pr-4 gap-1.5">
        <Skeleton className="h-2.5 w-8" />
        <Skeleton className="h-5 w-12" />
      </div>
      <div className="w-20 shrink-0">
        <Skeleton className="h-4 w-14" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-20 shrink-0" />
    </div>
  );
}
