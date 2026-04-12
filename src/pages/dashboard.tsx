import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DefaultLayout from "@/layouts/default";
import { title, subtitle } from "@/components/primitives";
import { DealingRow, DealingRowHeader } from "@/components/dealing-row";
import { DealingDetailPanel } from "@/components/dealing-detail-panel";
import { Skeleton } from "@/components/skeleton";
import { api, type Dealing } from "@/lib/api";
import { ChevronDownIcon, CalendarDaysIcon, PlayIcon, TrashIcon } from "@heroicons/react/24/outline";

type ViewMode = "chronological" | "by-gain";

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

function buildSegments(all: Dealing[], monthKey: string): Segment[] {
  // Sort so suggested deals come before skipped within each day
  const sorted = [...all].sort((a, b) => {
    const aS = isSuggested(a) ? 0 : 1;
    const bS = isSuggested(b) ? 0 : 1;
    return aS - bS;
  });

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

  for (const d of sorted) {
    if (isSuggested(d)) {
      flushSkipped();
      segments.push({ type: "analysed", deal: d });
    } else {
      pendingSkipped.push(d);
    }
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
  const [viewMode, setViewMode] = useState<ViewMode>("chronological");
  const [openMonths, setOpenMonths] = useState<Set<string> | null>(null);
  const [openSkipped, setOpenSkipped] = useState<Set<string>>(new Set());
  const [skippedVisible, setSkippedVisible] = useState<Record<string, number>>({});
  const [monthNoteworthyOnly, setMonthNoteworthyOnly] = useState<Set<string>>(new Set());
  const [monthExpandAll, setMonthExpandAll] = useState<Set<string>>(new Set());
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

  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const todayDeals = useMemo((): Dealing[] => {
    if (!dealings) return [];
    return dealings.filter((d) => d.trade_date.slice(0, 10) === todayKey);
  }, [dealings, todayKey]);

  const isTradingDay = useMemo(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5;
  }, []);

  const grouped = useMemo((): MonthBucket[] => {
    if (!dealings) return [];
    const buckets: MonthBucket[] = [];
    for (const d of dealings) {
      // Exclude today's deals — they get their own section
      if (d.trade_date.slice(0, 10) === todayKey) continue;

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
  }, [dealings, todayKey]);

  // Default-open the first month once data arrives
  useEffect(() => {
    if (openMonths === null && grouped.length > 0) {
      setOpenMonths(new Set([grouped[0].key]));
    }
  }, [grouped, openMonths]);

  const byGain = useMemo((): Dealing[] => {
    if (!dealings) return [];
    return dealings
      .filter((d) => isSuggested(d) && prices[d.ticker] != null)
      .map((d) => ({ ...d, _gainPct: ((prices[d.ticker] - d.price_pence) / d.price_pence) * 100 }))
      .sort((a, b) => b._gainPct - a._gainPct);
  }, [dealings, prices]);

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleNoteworthyOnly = (key: string) => {
    setMonthNoteworthyOnly((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExpandAll = (key: string) => {
    setMonthExpandAll((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Collapse all skipped clusters for this month
        setOpenSkipped((s) => {
          const ns = new Set(s);
          for (const k of ns) { if (k.startsWith(key)) ns.delete(k); }
          return ns;
        });
      } else {
        next.add(key);
      }
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

  const renderSkippedCluster = (deals: Dealing[], clusterKey: string, forceOpen = false) => {
    const isOpen = forceOpen || openSkipped.has(clusterKey);
    const newest = deals[0];
    const d = new Date(newest.trade_date);
    const weekday = d.toLocaleString("en-GB", { weekday: "short" });
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "short" });
    const limit = skippedVisible[clusterKey] ?? 5;
    const visible = deals.slice(0, limit);
    const remaining = deals.length - limit;

    const allTickers = deals.map((x) => x.ticker.replace(/\.L$/, ""));

    return (
      <div className="bg-black/[0.04] dark:bg-white/[0.03]">
        {/* Cluster trigger row */}
        <button
          className={`w-full flex items-stretch text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors ${isOpen ? "bg-black/[0.04] dark:bg-white/[0.05]" : ""}`}
          onClick={() => toggleSkipped(clusterKey)}
        >
          {/* Date — same w-36 as DealingRow */}
          <div className="w-36 shrink-0 px-4 py-4 flex items-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm text-foreground/50 font-medium">{weekday}</span>
              <span className="text-base font-medium leading-tight">{ordinal(day)},</span>
              <span className="text-sm text-foreground/50 font-medium">{month}</span>
            </div>
          </div>
          {/* Ticker — skip icon */}
          <div className="w-[4.5rem] shrink-0 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <TrashIcon className="w-4 h-4 text-muted/50" />
          </div>
          {/* Tickers + caption */}
          <div className="flex-1 min-w-0 px-4 py-4 flex items-center">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {allTickers.slice(0, 5).map((t, i) => (
                  <span key={i} className="font-mono text-xs px-1.5 py-0.5 rounded border bg-[#e8e0d5]/60 dark:bg-surface-secondary/60 border-[#d0c8be]/50 dark:border-border/50 text-muted">
                    {t}
                  </span>
                ))}
                {allTickers.length > 5 && (
                  <span className="text-xs text-muted/70">+{allTickers.length - 5} more</span>
                )}
              </div>
              <div className="text-xs text-muted/70 mt-1.5">None of these purchases met our criteria to analyse further</div>
            </div>
            <ChevronDownIcon className={`w-5 h-5 text-muted shrink-0 ml-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </div>
        </button>

        {/* Expanded rows */}
        {isOpen && (
          <div className="divide-y divide-black/[0.06] dark:divide-separator">
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
              <div className="px-6 py-4">
                <button
                  className="text-sm text-[#7a6a58] hover:text-[#6b5038] transition-colors"
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

        <div className="space-y-6">
          {/* View mode toggle */}
          <div className="bg-[#faf7f2] dark:bg-surface px-6 py-4 rounded-xl flex gap-2 border border-transparent dark:border-separator/50">
            {(["chronological", "by-gain"] as const).map((mode) => (
              <button
                key={mode}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  viewMode === mode
                    ? "border-[#6b5038] bg-[#6b5038]/10 text-[#6b5038]"
                    : "border-separator text-muted hover:border-[#6b5038]/50"
                }`}
                onClick={() => setViewMode(mode)}
              >
                {mode === "chronological" ? "Chronological" : "By gain"}
              </button>
            ))}
          </div>

          {err && <div className="text-sm text-red-400">Error: {err}</div>}

          {!dealings ? (
            <DashboardSkeleton />
          ) : viewMode === "by-gain" ? (
            byGain.length === 0 ? (
              <div className="text-sm text-muted">No dealings with current prices available.</div>
            ) : (
              <div className="bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden animate-content-in">
                <DealingRowHeader sticky />
                <div className="divide-y divide-black/[0.06] dark:divide-separator">
                  {byGain.map((d) => (
                    <DealingRow
                      key={d.id}
                      dealing={d}
                      currentPricePence={prices[d.ticker]}
                      selected={selected?.id === d.id}
                      onSelect={selectDealing}
                                            showMonth
                    />
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-6 animate-content-in">
              {/* Today section — hidden on non-trading days */}
              {isTradingDay && (
              <div className="bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5">
                  <div>
                    <div className="text-xl font-semibold flex items-center gap-2"><PlayIcon className="w-5 h-5" />Today</div>
                    {todayDeals.length > 0 && (
                      <div className="text-xs text-muted mt-0.5">
                        {todayDeals.filter(isSuggested).length} analysed · {todayDeals.filter((d) => !isSuggested(d)).length} skipped
                      </div>
                    )}
                  </div>
                </div>
                {todayDeals.length > 0 && (
                  <>
                  <DealingRowHeader />
                  <div className="divide-y divide-black/[0.06] dark:divide-separator">
                    {todayDeals.map((d) => (
                      <DealingRow
                        key={d.id}
                        dealing={d}
                        currentPricePence={prices[d.ticker]}
                        selected={selected?.id === d.id}
                        onSelect={selectDealing}
                                                hideDate
                      />
                    ))}
                  </div>
                  </>
                )}
              </div>
              )}

              {/* Month groups (excluding today) */}
              {grouped.map(({ label, year, key, days, analysedCount, skippedCount }) => {
                const monthOpen = openMonths?.has(key) ?? false;

                return (
                  <div key={key} className="">
                    {/* Month header */}
                    <div className="sticky top-16 z-10 pt-3 bg-[#f5f0e8] dark:bg-background">
                    <button
                      className={`w-full flex items-center justify-between px-6 py-5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors bg-[#faf7f2] dark:bg-surface rounded-t-xl ${monthOpen ? "" : "rounded-b-xl"}`}
                      onClick={() => toggleMonth(key)}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <CalendarDaysIcon className="w-5 h-5 text-muted shrink-0" />
                        <div className="text-xl font-semibold">{label} {year}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted">
                          {analysedCount} analysed · {skippedCount} skipped
                        </span>
                        <ChevronDownIcon
                          className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${monthOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                    {monthOpen && (
                      <div className="flex items-center gap-6 px-6 py-4 bg-[#faf8f5] dark:bg-surface border-t border-[#e8e0d5] dark:border-separator">
                        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none hover:text-foreground transition-colors">
                          <input
                            type="checkbox"
                            checked={monthNoteworthyOnly.has(key)}
                            onChange={() => toggleNoteworthyOnly(key)}
                            className="w-3.5 h-3.5 rounded accent-[#6b5038]"
                          />
                          Noteworthy only
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none hover:text-foreground transition-colors">
                          <input
                            type="checkbox"
                            checked={monthExpandAll.has(key)}
                            onChange={() => toggleExpandAll(key)}
                            className="w-3.5 h-3.5 rounded accent-[#6b5038]"
                          />
                          Expand all
                        </label>
                      </div>
                    )}
                    </div>

                    {monthOpen && (() => {
                      const noteworthyOnly = monthNoteworthyOnly.has(key);
                      const expandAll = monthExpandAll.has(key);

                      return (
                      <div className="bg-[#faf7f2] dark:bg-surface rounded-b-xl">
                        <DealingRowHeader sticky />
                        <div className="divide-y divide-black/[0.06] dark:divide-separator">
                        {days.map((day) => {
                          const segments = buildSegments(day.all, day.key);

                          return segments.map((seg) => {
                            if (noteworthyOnly && seg.type === "skipped") return null;
                            if (seg.type === "analysed") {
                              return (
                              <DealingRow
                                key={seg.deal.id}
                                dealing={seg.deal}
                                currentPricePence={prices[seg.deal.ticker]}
                                selected={selected?.id === seg.deal.id}
                                onSelect={selectDealing}
                                                                showMonth
                              />
                              );
                            }
                            if (expandAll) {
                              return (
                                <div key={seg.clusterKey}>
                                  {renderSkippedCluster(seg.deals, seg.clusterKey, true)}
                                </div>
                              );
                            }
                            return (
                              <div key={seg.clusterKey}>
                                {renderSkippedCluster(seg.deals, seg.clusterKey)}
                              </div>
                            );
                          });
                        })}
                        </div>
                      </div>
                      );
                    })()}
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
      <div className="bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-32 mt-2" />
        </div>
        <div className="divide-y divide-black/[0.06] dark:divide-separator">
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
    <div className="px-6 py-5 flex items-center gap-5">
      <div className="flex flex-col w-36 shrink-0 pr-6 gap-1.5">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-5 w-14" />
      </div>
      <div className="w-[4.5rem] shrink-0">
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <Skeleton className="h-8 w-24 shrink-0" />
      <Skeleton className="h-8 w-32 rounded-md shrink-0" />
    </div>
  );
}
