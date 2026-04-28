import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DefaultLayout from "@/layouts/default";
import { title } from "@/components/primitives";
import { DealingRow, DealingRowHeader } from "@/components/dealing-row";
import { DealingDetailPanel } from "@/components/dealing-detail-panel";
import { Skeleton } from "@/components/skeleton";
import { api, type Dealing } from "@/lib/api";
import { isSuggestedDealing } from "@/lib/dealing-classify";
import { compareDealingsNewestFirst, formatDisclosedParts } from "@/lib/dealing-dates";
import { useDataVersion } from "@/lib/use-data-version";
import { useDiscretion } from "@/lib/discretion";
import { BlurredDealingRow } from "@/components/discretion/blurred-dealing-row";
import {
  ChevronDownIcon,
  CalendarDaysIcon,
  PlayIcon,
  TrashIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/24/outline";

type ViewMode = "chronological" | "by-gain";
type HeroFilter = "all" | "significant" | "noteworthy" | "minor" | "routine";

/** Set true to show the per-month "Noteworthy only" / "Expand all" toolbar again. */
const SHOW_MONTH_FILTER_BAR = false;

/** Ticker stand-ins shown (blurred) in skipped-cluster headers when discretion mode is on. */
const PLACEHOLDER_TICKERS = ["GSK", "BARC", "RR", "VOD", "BP", "TSCO", "AZN", "LLOY", "DGE", "REL"];

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

function buildSegments(all: Dealing[], monthKey: string): Segment[] {
  // Sort so suggested deals come before skipped within each day
  const sorted = [...all].sort((a, b) => {
    const aS = isSuggestedDealing(a) ? 0 : 1;
    const bS = isSuggestedDealing(b) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return compareDealingsNewestFirst(a, b);
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
    if (isSuggestedDealing(d)) {
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
  const [heroFilter, setHeroFilter] = useState<HeroFilter>("significant");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const discretion = useDiscretion();

  const isTradingDay = useMemo(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5;
  }, []);

  const selected = useMemo(
    () => (routeId && dealings ? dealings.find((d) => d.id === routeId) ?? null : null),
    [routeId, dealings],
  );

  const selectDealing = (d: Dealing | null) => {
    if (d) navigate(`/dealings/${d.id}`);
    else navigate("/");
  };

  const loadDealings = useCallback(() => {
    api.dealings().then(setDealings).catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => { loadDealings(); }, [loadDealings]);

  // Poll for new data every 30s — refetch when the DB fingerprint changes
  useDataVersion(loadDealings, 30_000);

  useEffect(() => {
    if (!dealings || dealings.length === 0) return;
    const tickers = [...new Set(dealings.map((d) => d.ticker)), "^FTAS"];
    api.latestPrices(tickers).then((list) => {
      const map: Record<string, number> = {};
      for (const p of list) map[p.ticker] = p.price_pence;
      setPrices(map);
    }).catch(() => {});
  }, [dealings]);

  // Bulk-load FTSE daily closes so we can show "vs FTSE" on every row.
  useEffect(() => {
    if (!dealings || dealings.length === 0) return;
    api.priceHistory("^FTAS", 365).then((bars) => {
      const map: Record<string, number> = {};
      for (const b of bars) map[b.date] = b.close_pence;
      setFtseEntries(map);
    }).catch(() => {});
  }, [dealings]);

  const filteredDealings = useMemo(() => {
    if (!dealings) return null;
    if (!search.trim()) return dealings;
    const q = search.trim().toLowerCase();
    return dealings.filter((d) =>
      d.ticker.toLowerCase().includes(q) ||
      d.company.toLowerCase().includes(q) ||
      d.director.name.toLowerCase().includes(q),
    );
  }, [dealings, search]);

  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const todayDeals = useMemo((): Dealing[] => {
    if (!filteredDealings) return [];
    const list = filteredDealings.filter(
      (d) => (d.disclosed_date ?? d.trade_date).slice(0, 10) === todayKey,
    );
    return [...list].sort(compareDealingsNewestFirst);
  }, [filteredDealings, todayKey]);

  const grouped = useMemo((): MonthBucket[] => {
    if (!filteredDealings) return [];
    const buckets: MonthBucket[] = [];
    for (const d of filteredDealings) {
      // Bucket by DISCLOSED date so the day labels and cluster headers (which
      // also render the disclosed date) align with the actual grouping.
      // Bucketing by trade_date previously produced duplicate day groups
      // when several trade_dates shared a disclosed_date.
      const disclosedIso = d.disclosed_date || d.trade_date;
      const dayKey = disclosedIso.slice(0, 10);

      // Exclude today's deals — they get their own section
      if (dayKey === todayKey) continue;

      const date = new Date(disclosedIso);
      const monthLabel = date.toLocaleString("en-GB", { month: "long" });
      const year = date.getFullYear();
      const monthKey = `${monthLabel}-${year}`;
      let bucket = buckets.find((b) => b.key === monthKey);
      if (!bucket) {
        bucket = { label: monthLabel, year, key: monthKey, days: [], analysedCount: 0, skippedCount: 0 };
        buckets.push(bucket);
      }

      let day = bucket.days.find((db) => db.key === dayKey);
      if (!day) {
        const weekday = date.toLocaleString("en-GB", { weekday: "short" }).toUpperCase();
        const dayStr = ordinal(date.getDate());
        day = { weekday, day: dayStr, key: dayKey, all: [], analysedCount: 0, skippedCount: 0 };
        bucket.days.push(day);
      }
      day.all.push(d);
      if (isSuggestedDealing(d)) { day.analysedCount++; bucket.analysedCount++; }
      else { day.skippedCount++; bucket.skippedCount++; }
    }
    for (const b of buckets) {
      for (const day of b.days) {
        day.all.sort(compareDealingsNewestFirst);
      }
    }
    return buckets;
  }, [filteredDealings, todayKey]);

  // Default-open all months once data arrives
  useEffect(() => {
    if (openMonths === null && grouped.length > 0) {
      setOpenMonths(new Set(grouped.map((g) => g.key)));
    }
  }, [grouped, openMonths]);

  const byGain = useMemo((): Dealing[] => {
    if (!filteredDealings) return [];
    return filteredDealings
      .filter((d) => isSuggestedDealing(d) && prices[d.ticker] != null)
      .map((d) => ({ ...d, _gainPct: ((prices[d.ticker] - d.price_pence) / d.price_pence) * 100 }))
      .sort((a, b) => b._gainPct - a._gainPct);
  }, [filteredDealings, prices]);


  // Hero performance stats — computed client-side from dealings + prices + FTSE
  const heroStats = useMemo(() => {
    if (!dealings || Object.keys(prices).length === 0 || Object.keys(ftseEntries).length === 0) return null;
    const ftseNow = prices["^FTAS"];
    if (ftseNow == null) return null;

    // Filter dealings based on heroFilter
    const filtered = dealings.filter((d) => {
      if (d.tx_type && d.tx_type !== "buy") return false;
      const rating = d.analysis?.rating;
      if (heroFilter === "all") return true;
      if (heroFilter === "routine") return !rating || rating === "routine";
      return rating === heroFilter;
    });

    // Build per-pick stats
    const picks: { ticker: string; stockRet: number; ftseRet: number; alpha: number }[] = [];
    for (const d of filtered) {
      const current = prices[d.ticker];
      const ftseEntry = ftseEntries[d.trade_date.slice(0, 10)];
      if (current == null || ftseEntry == null || ftseEntry === 0 || d.price_pence === 0) continue;
      const stockRet = (current - d.price_pence) / d.price_pence;
      const ftseRet = (ftseNow - ftseEntry) / ftseEntry;
      if (!isFinite(stockRet) || !isFinite(ftseRet)) continue;
      picks.push({ ticker: d.ticker.replace(/\.L$/, ""), stockRet, ftseRet, alpha: (stockRet - ftseRet) * 100 });
    }

    if (picks.length === 0) return null;

    const avgStock = picks.reduce((s, p) => s + p.stockRet, 0) / picks.length;
    const avgFtse = picks.reduce((s, p) => s + p.ftseRet, 0) / picks.length;
    const alphaPp = (avgStock - avgFtse) * 100;
    const beatCount = picks.filter((p) => p.alpha > 0).length;

    const topPicks = [...picks].filter((p) => p.stockRet > 0).sort((a, b) => b.stockRet - a.stockRet).slice(0, 5);

    return { count: picks.length, avgStock, avgFtse, alphaPp, beatCount, topPicks };
  }, [dealings, prices, ftseEntries, heroFilter]);

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

  const renderSkippedCluster = (
    deals: Dealing[],
    clusterKey: string,
    forceOpen = false,
    unblurredCount: number = Number.POSITIVE_INFINITY,
  ) => {
    const isOpen = forceOpen || openSkipped.has(clusterKey);
    const newest = deals[0];
    const { dateLabel } = formatDisclosedParts(newest.disclosed_date || newest.trade_date);
    const limit = skippedVisible[clusterKey] ?? 5;
    const visible = deals.slice(0, limit);
    const remaining = deals.length - limit;

    const allTickers = deals.map((x) => x.ticker.replace(/\.L$/, ""));

    return (
      <div className="bg-black/[0.04] dark:bg-white/[0.03]">
        {/* Cluster trigger row */}
        <button
          className={`w-full text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors ${isOpen ? "bg-black/[0.04] dark:bg-white/[0.05]" : ""}`}
          onClick={() => toggleSkipped(clusterKey)}
        >
          {/* ── Mobile skipped cluster (<md) ── */}
          <div className="md:hidden px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <TrashIcon className="w-3.5 h-3.5 text-muted/50 shrink-0" />
              <span className="text-xs text-foreground/50 font-medium">{dateLabel}</span>
              <ChevronDownIcon className={`w-4 h-4 text-muted shrink-0 ml-auto transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {allTickers.slice(0, 4).map((t, i) => {
                const blurred = discretion.enabled && i >= unblurredCount;
                return (
                  <span
                    key={i}
                    aria-hidden={blurred || undefined}
                    className={`font-mono text-xs px-1.5 py-0.5 rounded border bg-[#e8e0d5]/60 dark:bg-surface-secondary/60 border-[#d0c8be]/50 dark:border-border/50 text-muted ${blurred ? "select-none" : ""}`}
                    style={blurred ? { filter: "blur(4px)" } : undefined}
                  >
                    {blurred ? PLACEHOLDER_TICKERS[i % PLACEHOLDER_TICKERS.length] : t}
                  </span>
                );
              })}
              {allTickers.length > 4 && (
                <span className="text-xs text-muted/70">+{allTickers.length - 4} more</span>
              )}
            </div>
            <div className="text-xs text-muted/70 mt-1.5">None met our criteria to analyse further</div>
          </div>

          {/* ── Desktop skipped cluster (md+) ── */}
          <div className="hidden md:flex items-stretch">
            <div className="w-40 shrink-0 px-4 py-4 flex items-center border-r border-black/[0.06] dark:border-white/[0.06]">
              <div className="text-sm text-foreground/90 font-medium leading-tight">{dateLabel}</div>
            </div>
            <div className="w-[4.5rem] shrink-0 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
              <TrashIcon className="w-4 h-4 text-muted/50" />
            </div>
            <div className="flex-1 min-w-0 px-4 py-4 flex items-center">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {allTickers.slice(0, 5).map((t, i) => {
                    const blurred = discretion.enabled && i >= unblurredCount;
                    return (
                      <span
                        key={i}
                        aria-hidden={blurred || undefined}
                        className={`font-mono text-xs px-1.5 py-0.5 rounded border bg-[#e8e0d5]/60 dark:bg-surface-secondary/60 border-[#d0c8be]/50 dark:border-border/50 text-muted ${blurred ? "select-none" : ""}`}
                        style={blurred ? { filter: "blur(4px)" } : undefined}
                      >
                        {blurred ? PLACEHOLDER_TICKERS[i % PLACEHOLDER_TICKERS.length] : t}
                      </span>
                    );
                  })}
                  {allTickers.length > 5 && (
                    <span className="text-xs text-muted/70">+{allTickers.length - 5} more</span>
                  )}
                </div>
                <div className="text-xs text-muted/70 mt-1.5">None of these purchases met our criteria to analyse further</div>
              </div>
              <ChevronDownIcon className={`w-5 h-5 text-muted shrink-0 ml-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </div>
          </div>
        </button>

        {/* Expanded rows */}
        {isOpen && (
          <div className="divide-y divide-black/[0.06] dark:divide-separator">
            {visible.map((d, i) =>
              i < unblurredCount ? (
                <DealingRow
                  key={d.id}
                  dealing={d}
                  currentPricePence={prices[d.ticker]}
                  ftseEntryPence={ftseEntries[d.trade_date.slice(0, 10)]}
                  ftseCurrentPence={prices["^FTAS"]}
                  showVsFtse
                  selected={selected?.id === d.id}
                  onSelect={selectDealing}
                  hideDate
                  suppressSkippedLabel
                />
              ) : (
                <BlurredDealingRow
                  key={`${clusterKey}-blur-${i}`}
                  seed={clusterKey}
                  index={i}
                  isoDate={d.trade_date.slice(0, 10)}
                  showVsFtse
                  hideDate
                />
              ),
            )}
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

  const tickerEl = heroStats && heroStats.topPicks.length > 0 ? (
    <div className="flex items-stretch">
      <div className="shrink-0 flex items-center py-2.5 pr-4 border-r border-separator/40 text-[9px] font-semibold uppercase tracking-widest text-[#6b5038]/70 whitespace-nowrap">
        Biggest gains detected
      </div>
      <div className="flex-1 overflow-hidden">
        <div style={{ display: "flex", width: "max-content", animation: "ho-ticker 28s linear infinite" }}>
          {[...heroStats.topPicks, ...heroStats.topPicks].map((p, i) => (
            <div key={i} className="inline-flex items-center gap-2 px-5 py-2.5 border-r border-separator/30 shrink-0">
              <span className="text-[11px] font-mono font-medium text-foreground/75">{p.ticker}</span>
              <span className="text-[11px] font-mono" style={{ color: "oklch(36% 0.16 155)" }}>
                +{(p.stockRet * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <DefaultLayout drawerRight={isTradingDay} ticker={tickerEl}>
      <section className="pb-8 space-y-8">
        {/* Full-bleed hero — breaks out of container */}
        <div className="relative -mx-4 md:-mx-6 overflow-hidden">
          {/* Top fade — orbs dissolve into ticker */}
          <div className="absolute inset-x-0 top-0 h-16 pointer-events-none z-[5] bg-gradient-to-b from-[#f5f0e8] dark:from-background to-transparent" />
          {/* Bottom fade — orbs dissolve into content */}
          <div className="absolute inset-x-0 bottom-0 h-20 pointer-events-none z-[5] bg-gradient-to-t from-[#f5f0e8] dark:from-background to-transparent" />
        <div
          className="relative flex flex-col lg:flex-row items-center lg:items-center gap-5 lg:gap-8 px-6 py-5 lg:px-8 lg:py-7 max-w-7xl mx-auto"
        >
          {/* Animated background — spans full hero */}
          <style>{`
            .hero-orb { position: absolute; border-radius: 50%; will-change: opacity, transform; pointer-events: none; }
            .hero-orb-a { animation: ho-a 3.5s cubic-bezier(0.45,0.05,0.55,0.95) infinite; }
            .hero-orb-b { animation: ho-b 4.2s cubic-bezier(0.4,0,0.6,1) infinite; animation-delay: -1.2s; }
            .hero-orb-c { animation: ho-c 3.8s cubic-bezier(0.5,0,0.5,1) infinite; animation-delay: -2.4s; }
            .hero-orb-d { animation: ho-d 5s ease-in-out infinite; }
            .hero-orb-e { animation: ho-e 4.5s cubic-bezier(0.4,0.1,0.6,0.9) infinite; animation-delay: -3s; }
            .hero-dot { position: absolute; border-radius: 50%; will-change: opacity, transform; pointer-events: none; }
            .hero-dot-a { animation: ho-dot 8s ease-in-out infinite; animation-delay: 0.3s; }
            .hero-dot-b { animation: ho-dot 8s ease-in-out infinite; animation-delay: 1.6s; }
            .hero-dot-c { animation: ho-dot 8s ease-in-out infinite; animation-delay: 3.65s; }
            .hero-glow { position: absolute; border-radius: 50%; will-change: opacity, transform; pointer-events: none; }
            .hero-glow-a { animation: ho-glow 8s ease-out infinite; animation-delay: 0.3s; }
            .hero-glow-b { animation: ho-glow 8s ease-out infinite; animation-delay: 1.6s; }
            .hero-glow-c { animation: ho-glow 8s ease-out infinite; animation-delay: 3.65s; }
            @keyframes ho-a {
              0%   { opacity: 0.03; transform: scale(0.8) translate(-5%,2%); }
              20%  { opacity: 0.22; transform: scale(1.15) translate(-2%,1%); }
              38%  { opacity: 0.16; transform: scale(1.05) translate(-1%,0.5%); }
              55%  { opacity: 0.03; transform: scale(0.85); }
              100% { opacity: 0.03; transform: scale(0.8) translate(-5%,2%); }
            }
            @keyframes ho-b {
              0%   { opacity: 0.02; transform: scale(0.85); }
              25%  { opacity: 0.18; transform: scale(1.2) translate(3%,-2%); }
              45%  { opacity: 0.12; transform: scale(1.08) translate(2%,-1%); }
              62%  { opacity: 0.02; transform: scale(0.88); }
              100% { opacity: 0.02; transform: scale(0.85); }
            }
            @keyframes ho-c {
              0%   { opacity: 0.02; transform: scale(0.9); }
              15%  { opacity: 0.16; transform: scale(1.15) translate(1%,4%); }
              32%  { opacity: 0.10; transform: scale(1.05) translate(0.5%,2%); }
              48%  { opacity: 0.02; transform: scale(0.88); }
              68%  { opacity: 0.08; transform: scale(1.04) translate(1%,1%); }
              82%  { opacity: 0.02; transform: scale(0.9); }
              100% { opacity: 0.02; transform: scale(0.9); }
            }
            @keyframes ho-d {
              0%   { opacity: 0.01; transform: scale(0.82); }
              28%  { opacity: 0.12; transform: scale(1.1) translate(-1%,-3%); }
              44%  { opacity: 0.02; transform: scale(0.86); }
              100% { opacity: 0.01; transform: scale(0.82); }
            }
            @keyframes ho-e {
              0%   { opacity: 0.02; transform: scale(0.75); }
              22%  { opacity: 0.14; transform: scale(1.15) translate(2%,-3%); }
              40%  { opacity: 0.08; transform: scale(1.06) translate(1%,-2%); }
              58%  { opacity: 0.02; transform: scale(0.78); }
              100% { opacity: 0.02; transform: scale(0.75); }
            }
            @keyframes ho-dot {
              0%   { opacity: 0;    transform: scale(0); }
              5%   { opacity: 0.7;  transform: scale(1.3); }
              8%   { opacity: 0.55; transform: scale(1.0); }
              16%  { opacity: 0;    transform: scale(0.6); }
              100% { opacity: 0;    transform: scale(0); }
            }
            @keyframes ho-glow {
              0%   { opacity: 0;    transform: scale(0); }
              5%   { opacity: 0.35; transform: scale(0.8); }
              14%  { opacity: 0;    transform: scale(2.5); }
              100% { opacity: 0;    transform: scale(0); }
            }
            @keyframes pulse-dot {
              0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
              40% { opacity: 0.6; transform: scale(1); }
            }
            .hero-line { fill: none; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; will-change: opacity, stroke-dashoffset; }
            .hero-line-a { animation: ho-line 18s ease-in-out infinite; animation-delay: 0.8s; stroke-dasharray: 300; }
            .hero-line-b { animation: ho-line 14s ease-in-out infinite; animation-delay: -5s; stroke-dasharray: 300; }
            .hero-line-c { animation: ho-line 11s ease-in-out infinite; animation-delay: -8s; stroke-dasharray: 200; }
            @keyframes ho-line {
              0%   { opacity: 0;    stroke-dashoffset: 300; }
              6%   { opacity: 0.11; stroke-dashoffset: 278; }
              70%  { opacity: 0.11; stroke-dashoffset: 0; }
              86%  { opacity: 0;    stroke-dashoffset: 0; }
              100% { opacity: 0;    stroke-dashoffset: 300; }
            }
            @media (prefers-reduced-motion: reduce) {
              .hero-orb, .hero-dot, .hero-glow, .hero-line { animation: none !important; }
              .hero-orb-a { opacity: 0.12; }
              .hero-orb-b { opacity: 0.08; }
              .hero-orb-c { opacity: 0.06; }
              .hero-orb-d { opacity: 0.04; }
              .hero-orb-e { opacity: 0.04; }
              .hero-line { opacity: 0; }
            }
          `}</style>
          {/* Orb container — only right 66% of hero */}
          <div className="hidden lg:block absolute inset-y-0 left-[34%] right-0 pointer-events-none z-0">
            {/* Trend lines — price movement suggestion */}
            <svg
              aria-hidden="true"
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Uptrend with two small pullbacks */}
              <polyline
                className="hero-line hero-line-a"
                points="0,56 10,51 18,47 24,53 33,45 41,41 49,44 57,37 65,33 71,37 79,30 87,27 95,25 100,23"
                stroke="#9a8878"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {/* V-shape dip and recovery */}
              <polyline
                className="hero-line hero-line-b"
                points="0,68 14,73 26,80 38,77 50,70 62,63 72,58 82,53 92,49 100,46"
                stroke="#b0a090"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {/* Short volatile run — mid-right */}
              <polyline
                className="hero-line hero-line-c"
                points="38,53 48,48 55,51 63,44 71,48 79,41 87,45 94,39 100,37"
                stroke="#8B7258"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Large ambient orbs — fixed size for perfect circles */}
            <div className="hero-orb hero-orb-a" style={{ left: "10%", top: "-40%", width: 320, height: 320, background: "#b8a898" }} />
            <div className="hero-orb hero-orb-b" style={{ left: "45%", top: "-20%", width: 280, height: 280, background: "#c4b5a5" }} />
            <div className="hero-orb hero-orb-c" style={{ left: "25%", top: "30%", width: 260, height: 260, background: "#a89880" }} />
            {/* Ring orbs */}
            <div className="hero-orb hero-orb-d" style={{ left: "5%", top: "-50%", width: 360, height: 360, border: "1px solid #9a8878", background: "transparent" }} />
            <div className="hero-orb hero-orb-e" style={{ left: "40%", top: "10%", width: 240, height: 240, border: "1px solid #b0a090", background: "transparent" }} />
            {/* Purchase dots with glow */}
            <div className="hero-glow hero-glow-a" style={{ left: "15%", top: "20%", width: 20, height: 20, border: "1px solid #8B6040", background: "transparent" }} />
            <div className="hero-dot hero-dot-a" style={{ left: "15%", top: "20%", width: 10, height: 10, background: "#8B6040", marginLeft: 5, marginTop: 5 }} />
            <div className="hero-glow hero-glow-b" style={{ left: "40%", top: "62%", width: 20, height: 20, border: "1px solid #8B6040", background: "transparent" }} />
            <div className="hero-dot hero-dot-b" style={{ left: "40%", top: "62%", width: 10, height: 10, background: "#8B6040", marginLeft: 5, marginTop: 5 }} />
            <div className="hero-glow hero-glow-c" style={{ left: "75%", top: "10%", width: 20, height: 20, border: "1px solid #8B6040", background: "transparent" }} />
            <div className="hero-dot hero-dot-c" style={{ left: "75%", top: "10%", width: 10, height: 10, background: "#8B6040", marginLeft: 5, marginTop: 5 }} />
          </div>

          {/* Left — branding + value prop */}
          <div className="relative flex-1 text-center lg:text-left z-10">
            <h1 className={title()}>Find value in<br />insider deals.</h1>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              {[
                "Every UK director purchase, automatically screened",
                "AI-rated by conviction, context, and track record",
                "Only the buys worth your attention rise to the top",
              ].map((line) => (
                <li key={line} className="flex items-center justify-center lg:justify-start gap-2">
                  <span className="text-[#6b5038]">✓</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — performance vs FTSE */}
          <div className="relative w-full lg:w-[380px] shrink-0 z-10">
            {heroStats ? (() => {
              const { count, avgStock, avgFtse, alphaPp, beatCount } = heroStats;
              const beat = alphaPp >= 0;

              return (
                <div className="bg-[#faf7f2] dark:bg-surface rounded-xl border border-[#e8e0d5]/60 dark:border-separator/60 overflow-hidden">
                  {/* Header + filter pills */}
                  <div className="px-4 py-3 border-b border-[#e8e0d5] dark:border-separator">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted uppercase tracking-wider">
                      <ArrowTrendingUpIcon className="w-4 h-4" />
                      Performance vs FTSE
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(["all", "significant", "noteworthy", "minor", "routine"] as const).map((f) => (
                        <button
                          key={f}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                            heroFilter === f
                              ? "border-[#6b5038] bg-[#6b5038]/10 text-[#6b5038]"
                              : "border-[#d0c8be]/60 dark:border-separator text-muted hover:border-[#6b5038]/50"
                          }`}
                          onClick={() => setHeroFilter(f)}
                        >
                          {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alpha headline */}
                  <div className="px-4 py-3">
                    <div className="text-xs text-muted mb-1">Outperformance</div>
                    <div className="text-2xl font-semibold tracking-tight" style={{ color: beat ? "oklch(36% 0.16 155)" : "oklch(38% 0.16 18)" }}>
                      {beat ? "+" : ""}{alphaPp.toFixed(1)}<span className="text-base ml-0.5">pp</span>
                    </div>
                    <div className="text-[10px] text-muted/60 mt-0.5">{count} purchases</div>
                  </div>

                  {/* Stat rows */}
                  <div className="px-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">{heroFilter === "all" ? "All purchases" : heroFilter.charAt(0).toUpperCase() + heroFilter.slice(1)}</span>
                      <span className="font-medium font-mono" style={{ color: avgStock >= 0 ? "oklch(36% 0.16 155)" : "oklch(38% 0.16 18)" }}>
                        {avgStock >= 0 ? "+" : ""}{(avgStock * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">FTSE All-Share</span>
                      <span className="font-medium font-mono text-foreground/70">
                        {avgFtse >= 0 ? "+" : ""}{(avgFtse * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="border-t border-[#e8e0d5] dark:border-separator pt-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted">Beat FTSE</span>
                        <span className="font-medium font-mono">
                          {beatCount}/{count}
                          <span className="text-muted ml-1.5">
                            ({count > 0 ? Math.round((beatCount / count) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })() : (
              <div className="bg-[#faf7f2] dark:bg-surface rounded-xl border border-[#e8e0d5]/60 dark:border-separator/60 overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-[#e8e0d5] dark:border-separator space-y-2.5">
                  <Skeleton className="h-3.5 w-36" />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-10 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-18 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
                {/* Alpha headline */}
                <div className="px-5 py-5">
                  <Skeleton className="h-3 w-24 mb-2" />
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-2.5 w-20 mt-2" />
                </div>
                {/* Stat rows */}
                <div className="px-4 pb-3 space-y-2">
                  <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-16" /></div>
                  <div className="flex justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-16" /></div>
                  <div className="border-t border-[#e8e0d5] dark:border-separator pt-2">
                    <div className="flex justify-between"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-24" /></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        </div>

        <div className="space-y-6">
            {/* Mobile-only today section */}
            {isTradingDay && (
              <div className="lg:hidden bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e8e0d5] dark:border-separator">
                  <div className="text-sm font-semibold flex items-center gap-2"><PlayIcon className="w-4 h-4" />Today</div>
                  {todayDeals.length > 0 && (
                    <div className="text-xs text-muted mt-0.5">
                      {todayDeals.filter(isSuggestedDealing).length} analysed · {todayDeals.filter((d) => !isSuggestedDealing(d)).length} skipped
                    </div>
                  )}
                </div>
                {todayDeals.length > 0 ? (
                  <div className="divide-y divide-black/[0.06] dark:divide-separator">
                    {(discretion.enabled
                      ? todayDeals.slice(0, discretion.listCap)
                      : todayDeals
                    ).map((d) => (
                      <DealingRow
                        key={d.id}
                        dealing={d}
                        currentPricePence={prices[d.ticker]}
                        selected={selected?.id === d.id}
                        onSelect={selectDealing}
                        hideDate
                      />
                    ))}
                    {discretion.enabled &&
                      Array.from({
                        length: Math.max(0, todayDeals.length - discretion.listCap),
                      }).map((_, i) => (
                        <BlurredDealingRow
                          key={`today-blur-${i}`}
                          seed="today"
                          index={i}
                          isoDate={todayKey}
                          hideDate
                        />
                      ))}
                  </div>
                ) : (
                  <div className="px-5 py-4 text-sm text-muted">
                    Monitoring for new trades...
                  </div>
                )}
              </div>
            )}

            {err && <div className="text-sm text-red-400">Error: {err}</div>}

            {!dealings ? (
              <DashboardSkeleton />
            ) : viewMode === "by-gain" ? (
              byGain.length === 0 ? (
                <div className="text-sm text-muted">No dealings with current prices available.</div>
              ) : (
                <div className="bg-[#faf7f2] dark:bg-surface rounded-xl animate-content-in">
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#e8e0d5]/50 dark:border-separator/30">
                    <div className="flex gap-2">
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
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search ticker, company, director..."
                      className="w-72 rounded-full border border-separator bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:border-[#6b5038]/50 transition-colors"
                    />
                  </div>
                  <DealingRowHeader showVsFtse />
                  <div className="divide-y divide-black/[0.06] dark:divide-separator overflow-hidden rounded-b-xl">
                    {(discretion.enabled ? byGain.slice(0, discretion.listCap) : byGain).map((d) => (
                      <DealingRow
                        key={d.id}
                        dealing={d}
                        currentPricePence={prices[d.ticker]}
                        ftseEntryPence={ftseEntries[d.trade_date.slice(0, 10)]}
                        ftseCurrentPence={prices["^FTAS"]}
                        showVsFtse
                        selected={selected?.id === d.id}
                        onSelect={selectDealing}
                      />
                    ))}
                    {discretion.enabled &&
                      Array.from({
                        length: Math.max(0, byGain.length - discretion.listCap),
                      }).map((_, i) => (
                        <BlurredDealingRow
                          key={`bygain-blur-${i}`}
                          seed="bygain"
                          index={i}
                          isoDate={new Date().toISOString().slice(0, 10)}
                          showVsFtse
                        />
                      ))}
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-6 animate-content-in">
                {/* Month groups (excluding today) */}
                {grouped.map(({ label, year, key, days, analysedCount, skippedCount }, monthIdx) => {
                  const monthOpen = openMonths?.has(key) ?? false;

                  return (
                    <div key={key}>
                      {/* Filter bar — attached to first month */}
                      {monthIdx === 0 && (
                        <div className="flex items-center gap-3 bg-[#faf7f2] dark:bg-surface px-5 py-3.5 rounded-t-xl border-b border-[#e8e0d5]/50 dark:border-separator/30">
                          <div className="flex gap-2">
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
                          <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search ticker, company, director..."
                            className="w-72 rounded-full border border-separator bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:border-[#6b5038]/50 transition-colors"
                          />
                        </div>
                      )}
                      {/* Month header */}
                      <div className={`sticky top-[102px] z-10 ${monthIdx === 0 ? "" : "pt-3"} bg-[#f5f0e8] dark:bg-background`}>
                      <button
                        className={`w-full flex items-center justify-between px-6 py-5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors bg-[#faf7f2] dark:bg-surface ${monthIdx === 0 ? "" : "rounded-t-xl"} ${monthOpen ? "" : "rounded-b-xl"}`}
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
                      {SHOW_MONTH_FILTER_BAR && monthOpen && (
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
                          <DealingRowHeader showVsFtse />
                          <div className="divide-y divide-black/[0.06] dark:divide-separator">
                          {days.map((day) => {
                            const segments = buildSegments(day.all, day.key);
                            // Per-day allowance of unblurred trade rows when discretion is on.
                            // Analysed segments take 1 each; inside an open cluster, the first
                            // `allowance` visible trades render real and the rest are blurred.
                            let realRemaining = discretion.enabled
                              ? discretion.listCap
                              : Number.POSITIVE_INFINITY;

                            return (
                              <Fragment key={day.key}>
                                {segments.map((seg) => {
                                  if (noteworthyOnly && seg.type === "skipped") return null;
                                  if (seg.type === "analysed") {
                                    if (realRemaining > 0) {
                                      realRemaining--;
                                      return (
                                        <DealingRow
                                          key={seg.deal.id}
                                          dealing={seg.deal}
                                          currentPricePence={prices[seg.deal.ticker]}
                                          ftseEntryPence={ftseEntries[seg.deal.trade_date.slice(0, 10)]}
                                          ftseCurrentPence={prices["^FTAS"]}
                                          showVsFtse
                                          selected={selected?.id === seg.deal.id}
                                          onSelect={selectDealing}
                                        />
                                      );
                                    }
                                    return (
                                      <BlurredDealingRow
                                        key={`${seg.deal.id}-blur`}
                                        seed={seg.deal.id}
                                        index={0}
                                        isoDate={seg.deal.trade_date.slice(0, 10)}
                                        showVsFtse
                                      />
                                    );
                                  }
                                  // skipped cluster
                                  const allowance = realRemaining;
                                  const isOpen =
                                    expandAll || openSkipped.has(seg.clusterKey);
                                  if (isOpen && discretion.enabled) {
                                    const visibleN = Math.min(
                                      seg.deals.length,
                                      skippedVisible[seg.clusterKey] ?? 5,
                                    );
                                    realRemaining = Math.max(
                                      0,
                                      realRemaining - Math.min(allowance, visibleN),
                                    );
                                  }
                                  return (
                                    <div key={seg.clusterKey}>
                                      {renderSkippedCluster(
                                        seg.deals,
                                        seg.clusterKey,
                                        expandAll,
                                        allowance,
                                      )}
                                    </div>
                                  );
                                })}
                              </Fragment>
                            );
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
