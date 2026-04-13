import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DefaultLayout from "@/layouts/default";
import { title } from "@/components/primitives";
import { DealingRow, DealingRowHeader } from "@/components/dealing-row";
import { DealingDetailPanel } from "@/components/dealing-detail-panel";
import { Skeleton } from "@/components/skeleton";
import { api, type Dealing, type UkNewsItem } from "@/lib/api";
import {
  ChevronDownIcon,
  CalendarDaysIcon,
  PlayIcon,
  TrashIcon,
  ArrowTrendingUpIcon,
  NewspaperIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsUpDownIcon,
} from "@heroicons/react/24/outline";

type ViewMode = "chronological" | "by-gain";
type HeroFilter = "all" | "significant" | "noteworthy" | "minor" | "routine";

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

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
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
  const [ukNews, setUkNews] = useState<{
    items: UkNewsItem[];
    fetched_at: string | null;
  } | null>(null);

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
    return filteredDealings.filter((d) => d.trade_date.slice(0, 10) === todayKey);
  }, [filteredDealings, todayKey]);

  const isTradingDay = useMemo(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5;
  }, []);

  useEffect(() => {
    if (!isTradingDay) {
      setUkNews(null);
      return;
    }
    let cancelled = false;
    api
      .ukNews()
      .then((data) => {
        if (!cancelled) setUkNews(data);
      })
      .catch(() => {
        if (!cancelled) setUkNews({ items: [], fetched_at: null });
      });
    return () => {
      cancelled = true;
    };
  }, [isTradingDay]);

  const marketOpen = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    if (dow < 1 || dow > 5) return false;
    const h = parseInt(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
    const m = parseInt(now.toLocaleString("en-GB", { timeZone: "Europe/London", minute: "2-digit" }));
    const mins = h * 60 + m;
    return mins >= 480 && mins < 990;
  }, []);

  const grouped = useMemo((): MonthBucket[] => {
    if (!filteredDealings) return [];
    const buckets: MonthBucket[] = [];
    for (const d of filteredDealings) {
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
      .filter((d) => isSuggested(d) && prices[d.ticker] != null)
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
          className={`w-full text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors ${isOpen ? "bg-black/[0.04] dark:bg-white/[0.05]" : ""}`}
          onClick={() => toggleSkipped(clusterKey)}
        >
          {/* ── Mobile skipped cluster (<md) ── */}
          <div className="md:hidden px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <TrashIcon className="w-3.5 h-3.5 text-muted/50 shrink-0" />
              <span className="text-xs text-foreground/50 font-medium">{weekday} {ordinal(day)}, {month}</span>
              <ChevronDownIcon className={`w-4 h-4 text-muted shrink-0 ml-auto transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {allTickers.slice(0, 4).map((t, i) => (
                <span key={i} className="font-mono text-xs px-1.5 py-0.5 rounded border bg-[#e8e0d5]/60 dark:bg-surface-secondary/60 border-[#d0c8be]/50 dark:border-border/50 text-muted">
                  {t}
                </span>
              ))}
              {allTickers.length > 4 && (
                <span className="text-xs text-muted/70">+{allTickers.length - 4} more</span>
              )}
            </div>
            <div className="text-xs text-muted/70 mt-1.5">None met our criteria to analyse further</div>
          </div>

          {/* ── Desktop skipped cluster (md+) ── */}
          <div className="hidden md:flex items-stretch">
            <div className="w-36 shrink-0 px-4 py-4 flex items-center border-r border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm text-foreground/50 font-medium">{weekday}</span>
                <span className="text-base font-medium leading-tight">{ordinal(day)},</span>
                <span className="text-sm text-foreground/50 font-medium">{month}</span>
              </div>
            </div>
            <div className="w-[4.5rem] shrink-0 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
              <TrashIcon className="w-4 h-4 text-muted/50" />
            </div>
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
                ftseEntryPence={ftseEntries[d.trade_date.slice(0, 10)]}
                ftseCurrentPence={prices["^FTAS"]}
                showVsFtse
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

  const ukTodayNewsStrip = (
    <div className="border-b border-[#e8e0d5] dark:border-separator px-5 lg:px-4 py-3 shrink-0 max-h-[min(38vh,280px)] overflow-y-auto">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted mb-3">
        <span className="inline-flex items-center gap-2">
        <NewspaperIcon className="w-3.5 h-3.5" />
          UK market news
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] text-muted/70">
          <ArrowsUpDownIcon className="w-3 h-3" />
          Scroll
        </span>
      </div>
      {ukNews === null ? (
        <p className="text-xs text-muted">Loading headlines…</p>
      ) : ukNews.items.length === 0 ? (
        <p className="text-xs text-muted">No headlines available right now.</p>
      ) : (
        <ul className="space-y-4">
          {ukNews.items.slice(0, 12).map((n, i) => (
            <li key={`${n.url}-${i}`} className="pb-0.5">
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 group"
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostnameFromUrl(n.url))}&sz=32`}
                  alt=""
                  className="w-3.5 h-3.5 mt-0.5 rounded-sm shrink-0"
                  loading="lazy"
                />
                <span className="min-w-0">
                  <span className="block text-[10px] font-mono leading-none text-[#6b5038]/90 dark:text-[#c4a882] mb-1">
                    {n.source}
                  </span>
                  <span className="inline-flex items-start gap-1.5 text-xs text-foreground/90 leading-snug line-clamp-3 group-hover:text-[#6b5038] transition-colors">
                    <span>{n.title}</span>
                    <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5 shrink-0 mt-0.5 opacity-60 group-hover:opacity-100" />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {ukNews?.fetched_at && (
        <p className="text-[10px] text-muted/50 mt-2">
          Refreshed{" "}
          {new Date(ukNews.fetched_at).toLocaleString("en-GB", {
            timeZone: "Europe/London",
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
      <p className="text-[10px] text-muted/45 mt-2 leading-relaxed">
        Third-party headlines (BBC, Guardian, City AM, This is Money); opens in a new tab.
      </p>
    </div>
  );

  return (
    <DefaultLayout drawerRight={isTradingDay}>
      <section className="pb-8 space-y-8">
        {/* Full-bleed hero — breaks out of container, gradients fade to page bg */}
        <div
          className="relative -mx-4 md:-mx-6 overflow-hidden"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 40%, transparent 70%), radial-gradient(ellipse 40% 80% at 15% 50%, rgba(255,255,255,0.2) 0%, transparent 70%), radial-gradient(ellipse 35% 70% at 70% 30%, rgba(232,224,213,0.18) 0%, transparent 65%), radial-gradient(circle at 85% 80%, rgba(200,188,172,0.1) 0%, transparent 50%)" }}
        >
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
            @keyframes ho-ticker {
              from { transform: translateX(0); }
              to   { transform: translateX(-50%); }
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
          {/* Orb container — only right 66% of hero, hidden on mobile */}
          <div className="hidden lg:block absolute inset-y-0 left-[34%] right-0 overflow-hidden pointer-events-none">
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

        {/* Top-by-alpha ticker strip */}
        {heroStats && heroStats.topPicks.length > 0 && (
          <div className="flex items-stretch border-t border-[#e8e0d5]/50 dark:border-separator/40" style={{ background: "rgba(240,235,226,0.25)" }}>
            <div className="shrink-0 flex items-center px-3 border-r border-[#e8e0d5]/50 dark:border-separator/40 text-[9px] font-semibold uppercase tracking-widest text-[#6b5038]/70 whitespace-nowrap">
              Biggest gains detected
            </div>
            <div className="flex-1 overflow-hidden">
              <div style={{ display: "flex", width: "max-content", animation: "ho-ticker 28s linear infinite" }}>
                {[...heroStats.topPicks, ...heroStats.topPicks].map((p, i) => (
                  <div key={i} className="inline-flex items-center gap-2 px-5 py-1.5 border-r border-[#e8e0d5]/40 dark:border-separator/30 shrink-0">
                    <span className="text-[11px] font-mono font-medium text-foreground/75">{p.ticker}</span>
                    <span className="text-[11px] font-mono" style={{ color: p.stockRet >= 0 ? "oklch(36% 0.16 155)" : "oklch(38% 0.16 18)" }}>
                      {p.stockRet >= 0 ? "+" : ""}{(p.stockRet * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        </div>

        <div className="space-y-6">
            {/* View mode toggle + search */}
            <div className="flex items-center gap-3 bg-[#faf7f2] dark:bg-surface px-5 py-3.5 rounded-xl border border-transparent dark:border-separator/50">
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

            {/* Mobile-only today section */}
            {isTradingDay && (
              <div className="lg:hidden bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e8e0d5] dark:border-separator">
                  <div className="text-sm font-semibold flex items-center gap-2"><PlayIcon className="w-4 h-4" />Today</div>
                  {todayDeals.length > 0 && (
                    <div className="text-xs text-muted mt-0.5">
                      {todayDeals.filter(isSuggested).length} analysed · {todayDeals.filter((d) => !isSuggested(d)).length} skipped
                    </div>
                  )}
                </div>
                {ukTodayNewsStrip}
                {todayDeals.length > 0 ? (
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
                  <DealingRowHeader showVsFtse />
                  <div className="divide-y divide-black/[0.06] dark:divide-separator overflow-hidden rounded-b-xl">
                    {byGain.map((d) => (
                      <DealingRow
                        key={d.id}
                        dealing={d}
                        currentPricePence={prices[d.ticker]}
                        ftseEntryPence={ftseEntries[d.trade_date.slice(0, 10)]}
                        ftseCurrentPence={prices["^FTAS"]}
                        showVsFtse
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
                {/* Month groups (excluding today) */}
                {grouped.map(({ label, year, key, days, analysedCount, skippedCount }) => {
                  const monthOpen = openMonths?.has(key) ?? false;

                  return (
                    <div key={key}>
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
                          <DealingRowHeader sticky showVsFtse />
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
                                  ftseEntryPence={ftseEntries[seg.deal.trade_date.slice(0, 10)]}
                                  ftseCurrentPence={prices["^FTAS"]}
                                  showVsFtse
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

      {/* Today drawer — fixed full-height panel on right edge (desktop only) */}
      {isTradingDay && (
        <aside className="hidden lg:flex fixed top-0 right-0 bottom-0 w-80 flex-col border-l border-[#e8e0d5] dark:border-separator bg-[#faf7f2] dark:bg-surface z-20">
          {/* Header — matches navbar h-16 */}
          <div className="h-16 px-5 flex items-center border-b border-[#e8e0d5] dark:border-separator shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-semibold">Today</span>
              {todayDeals.length > 0 && (
                <span className="text-[10px] text-muted truncate">
                  {todayDeals.filter(isSuggested).length} analysed · {todayDeals.filter((d) => !isSuggested(d)).length} skipped
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <span className="relative inline-flex items-center justify-center w-4 h-4">
                  <span className="absolute inset-0 rounded-full" style={{ background: marketOpen ? "oklch(45% 0.14 155 / 0.15)" : "oklch(45% 0.14 18 / 0.15)" }} />
                  <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: marketOpen ? "oklch(45% 0.14 155)" : "oklch(45% 0.14 18 / 0.6)" }} />
                </span>
                <span className="text-xs text-muted">{marketOpen ? "Open" : "Closed"}</span>
              </div>
            </div>
          </div>

          {ukTodayNewsStrip}

          {/* Scrollable deal list */}
          {todayDeals.length > 0 ? (
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-black/[0.06] dark:divide-separator">
              {todayDeals.map((d) => {
                const a = d.analysis;
                const tickerLabel = d.ticker.replace(/\.L$/, "");
                const companyLabel = d.company.replace(/\s*\([^)]*\)\s*$/, "");
                return (
                  <button
                    key={d.id}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      selected?.id === d.id
                        ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]"
                        : "hover:bg-black/[0.03] dark:hover:bg-white/5"
                    } ${!a ? "opacity-60" : ""}`}
                    onClick={() => selectDealing(d)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary">
                        {tickerLabel}
                      </span>
                      <span className="text-sm font-medium truncate">{companyLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted truncate">
                        {d.director.name}
                      </span>
                      <span className="text-sm font-medium tabular-nums shrink-0 ml-2">
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(d.value_gbp)}
                      </span>
                    </div>
                    {a && (
                      <div className="mt-1.5">
                        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          a.rating === "significant" ? "bg-[#8b4513]/18 text-[#6b2f0a] border-[#8b4513]/40 dark:bg-[#d4845a]/15 dark:text-[#e8a878] dark:border-[#d4845a]/35" :
                          a.rating === "noteworthy"  ? "bg-[#6b5038]/14 text-[#4a3520] border-[#6b5038]/35 dark:bg-[#b8956e]/12 dark:text-[#c4a882] dark:border-[#b8956e]/30" :
                          a.rating === "minor"       ? "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40" :
                                                       "bg-transparent text-[#b0a898] border-[#d8d0c6]/60"
                        }`}>
                          {a.rating.charAt(0).toUpperCase() + a.rating.slice(1)}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex items-center justify-center py-4">
              <div className="text-center px-3">
                {marketOpen ? (
                  <>
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b0a898] animate-[pulse-dot_1.4s_ease-in-out_infinite]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b0a898] animate-[pulse-dot_1.4s_ease-in-out_0.2s_infinite]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b0a898] animate-[pulse-dot_1.4s_ease-in-out_0.4s_infinite]" />
                    </div>
                    <div className="text-sm text-muted">No new trades yet today</div>
                    <div className="text-xs text-muted/50 mt-1">Monitoring for new disclosures</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-muted">Markets are closed</div>
                    <div className="text-xs text-muted/50 mt-1">No new dealings today</div>
                  </>
                )}
              </div>
            </div>
          )}
        </aside>
      )}

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
