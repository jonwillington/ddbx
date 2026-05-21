import type {
  ChartMode,
  IngestSummary,
  MarketConfig,
  MarketDealing,
  MarketStats,
  NewsPayload,
} from "@/lib/markets/types";

import {
  CalendarDaysIcon,
  ChevronDownIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DailySummaryBanner,
  DailySummarySheet,
} from "./daily-summary-banner";
import { MarketChartModeToggle } from "./market-chart-mode-toggle";
import { MarketDetailDrawer } from "./market-detail-drawer";
import { MarketFilterBar, type MarketViewMode } from "./market-filter-bar";
import { MarketHero } from "./market-hero";
import {
  MarketDayHeader,
  MarketRow,
  MarketRowHeader,
  MarketRowSkeleton,
} from "./market-row";
import { type SparkBar } from "./market-row-spark";
import { MarketSkippedCluster } from "./market-skipped-cluster";
import { MarketTodayDrawer } from "./market-today-drawer";
import { MarketTodayEmpty } from "./market-today-empty";
import { bucketByMonth, todayKeyIso } from "./market-utils";

import DefaultLayout from "@/layouts/default";
import { api } from "@/lib/api";
import {
  modeFromAxes,
  useDashboardMetricMode,
} from "@/lib/dashboard-metric-mode";
import { useDailySummaries } from "@/lib/markets/use-daily-summaries";

/** The full shell that every market page mounts. Reads everything from
 *  MarketConfig — adding a new market means writing a new MarketConfig and
 *  pointing a route at `<MarketPage config={…} />`. Nothing in here should
 *  grow per-market branches. */
export function MarketPage<W>({
  config,
  selectedKey: selectedKeyProp,
  onSelectionChange,
}: {
  config: MarketConfig<W>;
  /** Optional controlled selection. When provided, MarketPage uses this
   *  instead of internal state and reports changes through
   *  onSelectionChange — lets a router-aware wrapper drive selection from
   *  the URL (e.g. /dealings/:id). */
  selectedKey?: string | null;
  onSelectionChange?: (key: string | null) => void;
}) {
  const [view, setView] = useState<string>(config.defaultView);
  const [viewMode, setViewMode] = useState<MarketViewMode>("chronological");
  const [search, setSearch] = useState("");
  const [dealings, setDealings] = useState<MarketDealing<W>[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [internalSelectedKey, setInternalSelectedKey] = useState<string | null>(
    null,
  );
  const controlled = selectedKeyProp !== undefined;
  const selectedKey = controlled
    ? (selectedKeyProp ?? null)
    : internalSelectedKey;
  const setSelectedKey = useCallback(
    (key: string | null) => {
      if (!controlled) setInternalSelectedKey(key);
      onSelectionChange?.(key);
    },
    [controlled, onSelectionChange],
  );
  const [openMonths, setOpenMonths] = useState<Set<string> | null>(null);
  const [heroFilterId, setHeroFilterId] = useState<string | null>(
    config.defaultHeroFilter ?? config.heroFilters?.[0]?.id ?? null,
  );
  const [openSkipped, setOpenSkipped] = useState<Set<string>>(new Set());
  /** When non-null, the daily-summary sheet is open for this date. */
  const [openSummaryDate, setOpenSummaryDate] = useState<string | null>(null);
  const [skippedVisible, setSkippedVisible] = useState<Record<string, number>>(
    {},
  );

  // Global chart mode — drives the inline sparkline AND the right-most
  // Performance cell. Persisted in localStorage via the dashboard metric
  // mode hook (also gives us cross-tab sync). Replaces the older
  // per-market `useMetricMode`.
  const metric = useDashboardMetricMode();
  const chartMode: ChartMode = useMemo(
    () => ({ axis: metric.comparison, anchor: metric.anchor }),
    [metric.comparison, metric.anchor],
  );
  const setChartMode = useCallback(
    (next: ChartMode) => {
      metric.setMode(modeFromAxes(next.axis, next.anchor));
    },
    [metric],
  );
  const useGating = config.useGating;
  const gating = useGating ? useGating() : undefined;

  /** Live stock prices keyed by ticker — close_pence column raw values. */
  const [prices, setPrices] = useState<Record<string, number>>({});
  /** Benchmark daily closes keyed by ISO date — raw values from the
   *  prices table (index points). */
  const [benchEntries, setBenchEntries] = useState<Record<string, number>>({});
  /** Benchmark daily closes as a sorted bar array — same data as
   *  benchEntries but kept as a list so the sparkline can walk it
   *  with a pointer. */
  const [benchmarkBars, setBenchmarkBars] = useState<SparkBar[]>([]);
  /** Per-ticker daily close history for the inline sparkline. Populated
   *  asynchronously as the per-ticker fetches resolve; the sparkline
   *  renders a `—` placeholder until its ticker lands. */
  const [stockBars, setStockBars] = useState<Record<string, SparkBar[]>>({});

  const [news, setNews] = useState<NewsPayload | null>(
    config.fetchNews ? null : null,
  );
  const hasNewsSource = !!config.fetchNews;

  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(
    null,
  );
  const [ingesting, setIngesting] = useState(false);

  /* ───────── Data loading ─────────────────────────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await config.fetchDealings({ view });

      setDealings(r.dealings);
      setStats(r.stats);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [config, view]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll for fresh data — defaults to 30s. Markets with their own cadence
  // can override via pollIntervalMs (0 to disable entirely).
  useEffect(() => {
    const interval = config.pollIntervalMs ?? 30_000;

    if (!interval) return;
    const id = setInterval(() => {
      void load();
    }, interval);

    return () => clearInterval(id);
  }, [config.pollIntervalMs, load]);

  // Latest prices for every ticker on screen + the benchmark. One batched
  // call to /api/prices/latest — same shape across markets. Skipped
  // entirely when the market opted out via enableLivePrices=false (Sweden
  // today, because pipeline/prices.ts in the worker doesn't yet know how
  // to fetch SEK closes). Avoids spamming Yahoo with .ST symbols it'd
  // return nothing for.
  const livePricesEnabled = config.enableLivePrices !== false;
  const logosEnabled = config.enableLogos !== false;

  // Effective TodayEmpty slot — explicit `config.TodayEmpty` wins (bespoke
  // copy), otherwise the shared MarketTodayEmpty kicks in for any market
  // that declared a session + holiday source. Markets with neither fall
  // through to the generic "No filings yet" line further down.
  const TodayEmptyComponent = config.TodayEmpty
    ? config.TodayEmpty
    : config.session && config.holidays
      ? () => (
          <MarketTodayEmpty
            holidays={config.holidays!}
            session={config.session!}
          />
        )
      : undefined;

  useEffect(() => {
    if (!livePricesEnabled) return;
    if (dealings.length === 0) return;
    const tickers = Array.from(
      new Set(dealings.map((d) => d.ticker).filter(Boolean)),
    );

    if (tickers.length === 0) return;
    api
      .latestPrices([...tickers, config.benchmarkTicker])
      .then((list) => {
        const map: Record<string, number> = {};

        for (const p of list) map[p.ticker] = p.price_pence;
        setPrices(map);
      })
      .catch(() => {});
  }, [dealings, config.benchmarkTicker, livePricesEnabled]);

  // Benchmark daily-close history — pre-loaded once per market. Kept in
  // two shapes: a date-keyed map for `benchmarkEntry()` lookups, and a
  // sorted bar array the sparkline walks with a pointer.
  useEffect(() => {
    if (!livePricesEnabled) return;
    api
      .priceHistory(config.benchmarkTicker, 365)
      .then((bars) => {
        const map: Record<string, number> = {};
        const sparkBars: SparkBar[] = bars.map((b) => ({
          date: b.date,
          close: b.close_pence,
        }));

        for (const b of bars) map[b.date] = b.close_pence;
        setBenchEntries(map);
        setBenchmarkBars(sparkBars);
      })
      .catch(() => {});
  }, [config.benchmarkTicker, livePricesEnabled]);

  // Per-ticker daily-close history for the sparkline column. Fired in
  // parallel against /api/prices/history (worker checks D1 cache first,
  // falls back to Yahoo). Tracked via a ref so the effect only re-runs
  // when the dealings list itself changes — the setStockBars writes
  // would otherwise feedback-loop the effect.
  const stockBarsRequested = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!livePricesEnabled) return;
    if (dealings.length === 0) return;
    const tickers = Array.from(
      new Set(dealings.map((d) => d.ticker).filter(Boolean)),
    );

    for (const ticker of tickers) {
      if (stockBarsRequested.current.has(ticker)) continue;
      stockBarsRequested.current.add(ticker);
      api
        .priceHistory(ticker, 365)
        .then((bars) => {
          const sparkBars: SparkBar[] = bars.map((b) => ({
            date: b.date,
            close: b.close_pence,
          }));

          setStockBars((prev) => ({ ...prev, [ticker]: sparkBars }));
        })
        .catch(() => {
          // Stash an empty array so we don't keep retrying a tombstone'd
          // ticker on every dealings poll.
          setStockBars((prev) => ({ ...prev, [ticker]: [] }));
        });
    }
  }, [dealings, livePricesEnabled]);

  // News — optional. Refresh on the same cadence as the main poll so the
  // strip stays live.
  useEffect(() => {
    if (!config.fetchNews) return;
    let active = true;
    const fetchNews = () => {
      config.fetchNews!()
        .then((n) => {
          if (active) setNews(n);
        })
        .catch(() => {});
    };

    fetchNews();
    const interval = config.pollIntervalMs ?? 30_000;

    if (!interval)
      return () => {
        active = false;
      };
    const id = setInterval(fetchNews, interval);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [config]);

  /* ───────── Derived state ───────────────────────────────────────────── */

  // Hero filter pills now act on the actual deals list (not just on the
  // long-gone hero perf card). Predicate runs first; the search box is
  // applied on top so the user can filter further inside a rating tier.
  const heroPredicate = useMemo(() => {
    if (!config.heroFilters || !heroFilterId) return null;

    return (
      config.heroFilters.find((h) => h.id === heroFilterId)?.predicate ?? null
    );
  }, [config.heroFilters, heroFilterId]);

  const filteredDealings = useMemo(() => {
    let base = heroPredicate ? dealings.filter(heroPredicate) : dealings;
    const q = search.trim().toLowerCase();

    if (!q) return base;

    return base.filter(
      (d) =>
        d.ticker.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q) ||
        d.insiderName.toLowerCase().includes(q),
    );
  }, [dealings, search, heroPredicate]);

  const todayIso = useMemo(() => todayKeyIso(), []);

  const todayDealings = useMemo(
    () =>
      filteredDealings.filter((d) => d.disclosedDate.slice(0, 10) === todayIso),
    [filteredDealings, todayIso],
  );

  const monthBuckets = useMemo(
    () =>
      bucketByMonth(filteredDealings, todayIso, {
        isSkipped: config.isSkipped,
      }),
    [filteredDealings, todayIso, config.isSkipped],
  );

  // Daily summaries — UK-only today. The hook collects the unique ISO
  // dates in the open months and fetches a per-date payload in parallel,
  // caching across remounts. Other markets get an empty map back and the
  // banner slot stays empty.
  const summaryDates = useMemo(() => {
    const dates = new Set<string>();

    for (const m of monthBuckets) {
      for (const d of m.days) {
        if (d.suggested.length > 0) dates.add(d.key);
      }
    }
    if (todayDealings.length > 0) dates.add(todayIso);

    return Array.from(dates);
  }, [monthBuckets, todayDealings, todayIso]);
  const dailySummaries = useDailySummaries(config.id, summaryDates);

  useEffect(() => {
    if (openMonths === null && monthBuckets.length > 0) {
      setOpenMonths(new Set(monthBuckets.map((m) => m.key)));
    }
  }, [monthBuckets, openMonths]);

  const stockCurrent = useCallback(
    (ticker: string): number | undefined => {
      const raw = prices[ticker];

      if (raw == null) return undefined;

      return config.normalizeLivePrice(raw);
    },
    [prices, config],
  );

  // When the user picks the disclosure anchor we look up the benchmark
  // close on the disclosure date first (and fall back to trade-day).
  // Otherwise the older trade-day preference stands.
  const anchorsOnDisclosure = chartMode.anchor === "disclosure";
  const benchmarkEntry = useCallback(
    (d: MarketDealing<W>): number | undefined => {
      const tradeIso = d.tradeDate.slice(0, 10);
      const disclosedIso = d.disclosedDate.slice(0, 10);

      if (anchorsOnDisclosure) {
        return benchEntries[disclosedIso] ?? benchEntries[tradeIso];
      }

      return benchEntries[tradeIso] ?? benchEntries[disclosedIso];
    },
    [benchEntries, anchorsOnDisclosure],
  );

  const benchmarkCurrent = prices[config.benchmarkTicker];

  const byGain = useMemo(() => {
    return filteredDealings
      .map((d) => {
        const current = stockCurrent(d.ticker);

        if (d.entryPrice == null || current == null || d.entryPrice <= 0)
          return null;
        const pct = ((current - d.entryPrice) / d.entryPrice) * 100;

        return { dealing: d, pct };
      })
      .filter((x): x is { dealing: MarketDealing<W>; pct: number } => x != null)
      .sort((a, b) => b.pct - a.pct);
  }, [filteredDealings, stockCurrent]);

  const selectedDealing = useMemo(
    () =>
      selectedKey
        ? (filteredDealings.find((d) => d.key === selectedKey) ?? null)
        : null,
    [filteredDealings, selectedKey],
  );

  const currentView = config.views.find((v) => v.id === view);

  const chartModeToggle = (
    <MarketChartModeToggle
      benchmarkLabel={config.benchmarkLabel}
      mode={chartMode}
      onChange={setChartMode}
    />
  );

  /* ───────── Handlers ────────────────────────────────────────────────── */

  const runIngest = async () => {
    if (!config.ingest) return;
    setIngesting(true);
    setErr(null);
    try {
      const r = await config.ingest.run();

      if (r) setIngestSummary(r);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setIngesting(false);
    }
  };

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev ?? []);

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
    setSkippedVisible((prev) => ({
      ...prev,
      [clusterKey]: (prev[clusterKey] ?? 5) + 5,
    }));
  };

  /* ───────── Render ──────────────────────────────────────────────────── */

  const emptyState = filteredDealings.length === 0 && !loading && (
    <div className="bg-[#faf7f2] dark:bg-surface rounded-xl px-4 py-10 text-center text-sm text-muted">
      {search.trim() ? (
        <>
          No filings match{" "}
          <span className="font-medium text-foreground/70">"{search}"</span>.{" "}
          <button
            className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
            onClick={() => setSearch("")}
          >
            Clear search
          </button>
        </>
      ) : config.renderEmptyState ? (
        config.renderEmptyState({ view, stats, setView })
      ) : (
        <>No filings yet.</>
      )}
    </div>
  );

  return (
    <DefaultLayout drawerRight>
      <section className="pb-8 space-y-6">
        {config.topNotice && (
          <div className="-mx-4 md:-mx-6 px-4 md:px-6 py-2.5 text-center text-sm border-b border-amber-300/40 bg-amber-100/60 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/50">
            <span className="inline-flex items-center gap-2">
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                Beta
              </span>
              {config.topNotice}
            </span>
          </div>
        )}

        {/* Shared hero — first content under the navbar. Perf moved to
            /performance; the old title + description block is dropped
            because the hero IS the page heading. */}
        <MarketHero marketLabel={config.marketLabel} />

        {(config.views.length > 1 ||
          config.ingest ||
          stats?.latestDisclosedLabel) && (
          <div className="flex flex-wrap items-center gap-3">
            {config.views.length > 1 && (
              <div
                className="inline-flex rounded-full border border-separator bg-surface/40 p-1"
                role="tablist"
              >
                {config.views.map((v) => (
                  <button
                    key={v.id}
                    aria-selected={view === v.id}
                    className={`text-sm px-4 py-1.5 rounded-full transition-colors font-medium ${
                      view === v.id
                        ? "bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882]"
                        : "text-muted hover:text-foreground"
                    }`}
                    role="tab"
                    onClick={() => setView(v.id)}
                  >
                    {v.label}
                    {stats && (
                      <span className="ml-1 text-xs opacity-60 tabular-nums">
                        {stats.viewCounts[v.id] ?? 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-3 text-xs">
              {stats?.latestDisclosedLabel && (
                <span className="text-muted hidden sm:inline">
                  {stats.latestDisclosedLabel}
                </span>
              )}
              {config.ingest && (
                <button
                  className="rounded-full border border-separator bg-[#6b5038]/10 hover:bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882] px-3 py-1.5 font-medium disabled:opacity-50 transition-colors"
                  disabled={ingesting}
                  onClick={runIngest}
                >
                  {ingesting ? "Fetching…" : config.ingest.label}
                </button>
              )}
            </div>
          </div>
        )}

        {ingestSummary && (
          <div className="rounded-lg border border-separator bg-surface/40 px-4 py-2 text-xs text-foreground/65">
            Last manual ingest: scanned {ingestSummary.scanned}, parsed{" "}
            {ingestSummary.parsed}, {ingestSummary.inserted} new ·{" "}
            {ingestSummary.replaced} updated
            {ingestSummary.errors.length > 0 && (
              <span className="text-amber-700 dark:text-amber-300">
                {" "}
                · {ingestSummary.errors.length} parse error
                {ingestSummary.errors.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

        {err && (
          <div className="rounded-lg border border-rose-300/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-2 text-sm text-rose-900 dark:text-rose-200">
            {err}
          </div>
        )}

        {/* Rating filter pills sit directly above the deals; they now filter
            the actual list (not just a defunct hero stats card). */}
        {config.heroFilters && config.heroFilters.length > 0 && (
          <div
            className="flex flex-wrap justify-center gap-1.5 animate-content-in"
            role="tablist"
          >
            {config.heroFilters.map((f) => (
              <button
                key={f.id}
                aria-selected={heroFilterId === f.id}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  heroFilterId === f.id
                    ? "border-[#6b5038]/50 bg-[#6b5038]/10 text-[#6b5038] dark:text-[#a8804e]"
                    : "border-separator text-muted hover:text-foreground hover:border-[#6b5038]/30"
                }`}
                role="tab"
                onClick={() => setHeroFilterId(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Today — inline card; lg+ hides this because the right drawer
            already shows today's filings. */}
        <div className="lg:hidden bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e8e0d5] dark:border-separator">
            <div className="text-sm font-semibold flex items-center gap-2">
              <PlayIcon className="w-4 h-4" />
              Today
            </div>
            {todayDealings.length > 0 && (
              <div className="text-xs text-muted mt-0.5">
                {todayDealings.length}{" "}
                {todayDealings.length === 1 ? "filing" : "filings"} disclosed
                today
              </div>
            )}
          </div>
          {todayDealings.length > 0 ? (
            <div className="divide-y divide-black/[0.06] dark:divide-separator">
              {todayDealings.map((d) => (
                <MarketRow
                  key={d.key}
                  hideDate
                  RowActionCell={config.RowActionCell}
                  benchmarkBars={benchmarkBars}
                  benchmarkCurrent={benchmarkCurrent}
                  benchmarkEntry={benchmarkEntry(d)}
                  benchmarkLabel={config.benchmarkLabel}
                  chartMode={chartMode}
                  dealing={d}
                  fmt={config.priceFormat}
                  selected={selectedKey === d.key}
                  showLogo={logosEnabled}
                  stockBars={stockBars[d.ticker]}
                  stockCurrentMajor={stockCurrent(d.ticker)}
                  onSelect={() => setSelectedKey(d.key)}
                />
              ))}
            </div>
          ) : loading ? (
            <div className="divide-y divide-black/[0.06] dark:divide-separator">
              {Array.from({ length: 3 }).map((_, i) => (
                <MarketRowSkeleton key={i} hideDate />
              ))}
            </div>
          ) : TodayEmptyComponent ? (
            <TodayEmptyComponent />
          ) : (
            <div className="px-5 py-6 text-sm text-muted">
              No filings disclosed today yet.
            </div>
          )}
        </div>

        {loading && filteredDealings.length === 0 && (
          <div className="bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden animate-content-in">
            <MarketRowHeader
              benchmarkLabel={config.benchmarkLabel}
              chartMode={chartMode}
            />
            <div className="divide-y divide-black/[0.06] dark:divide-separator">
              {Array.from({ length: 8 }).map((_, i) => (
                <MarketRowSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {emptyState}

        {/* By-gain view */}
        {filteredDealings.length > 0 && viewMode === "by-gain" && (
          <div className="bg-[#faf7f2] dark:bg-surface rounded-xl animate-content-in">
            <MarketFilterBar
              search={search}
              trailing={chartModeToggle}
              viewMode={viewMode}
              onSearch={setSearch}
              onViewMode={setViewMode}
            />
            <MarketRowHeader
              benchmarkLabel={config.benchmarkLabel}
              chartMode={chartMode}
            />
            <div className="divide-y divide-black/[0.06] dark:divide-separator overflow-hidden rounded-b-xl">
              {byGain.map(({ dealing: d }) => (
                <MarketRow
                  key={d.key}
                  RowActionCell={config.RowActionCell}
                  benchmarkBars={benchmarkBars}
                  benchmarkCurrent={benchmarkCurrent}
                  benchmarkEntry={benchmarkEntry(d)}
                  benchmarkLabel={config.benchmarkLabel}
                  chartMode={chartMode}
                  dealing={d}
                  fmt={config.priceFormat}
                  selected={selectedKey === d.key}
                  showLogo={logosEnabled}
                  stockBars={stockBars[d.ticker]}
                  stockCurrentMajor={stockCurrent(d.ticker)}
                  onSelect={() => setSelectedKey(d.key)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Chronological / month + day buckets */}
        {filteredDealings.length > 0 && viewMode === "chronological" && (
          <div className="space-y-6 animate-content-in">
            {monthBuckets.map((month, monthIdx) => {
              const monthOpen = openMonths?.has(month.key) ?? false;

              return (
                <div key={month.key}>
                  {monthIdx === 0 && (
                    <div className="bg-[#faf7f2] dark:bg-surface rounded-t-xl border-b border-[#e8e0d5]/50 dark:border-separator/30">
                      <MarketFilterBar
                        search={search}
                        trailing={chartModeToggle}
                        viewMode={viewMode}
                        onSearch={setSearch}
                        onViewMode={setViewMode}
                      />
                    </div>
                  )}
                  <div
                    className={`sticky top-[102px] z-10 ${monthIdx === 0 ? "" : "pt-3"} bg-[#f5f0e8] dark:bg-background`}
                  >
                    <button
                      className={`w-full flex items-center justify-between px-6 py-5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors bg-[#faf7f2] dark:bg-surface ${monthIdx === 0 ? "" : "rounded-t-xl"} ${monthOpen ? "" : "rounded-b-xl"}`}
                      onClick={() => toggleMonth(month.key)}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <CalendarDaysIcon className="w-5 h-5 text-muted shrink-0" />
                        <div className="text-xl font-semibold">
                          {month.label} {month.year}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted">
                          {config.isSkipped
                            ? `${month.suggestedCount} analysed · ${month.skippedCount} skipped`
                            : `${month.count} ${month.count === 1 ? "filing" : "filings"}`}
                        </span>
                        <ChevronDownIcon
                          className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${monthOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                  </div>
                  {monthOpen && (
                    <div className="bg-[#faf7f2] dark:bg-surface rounded-b-xl">
                      <MarketRowHeader
                        benchmarkLabel={config.benchmarkLabel}
                        chartMode={chartMode}
                      />
                      <div className="divide-y divide-black/[0.06] dark:divide-separator">
                        {month.days.map((day) => {
                          const clusterKey = `${month.key}-${day.key}`;
                          const hasContent =
                            day.suggested.length > 0 || day.skipped.length > 0;

                          return (
                            <Fragment key={day.key}>
                              {hasContent && (
                                <MarketDayHeader
                                  banner={(() => {
                                    const s = dailySummaries.get(day.key);

                                    if (!s) return undefined;

                                    return (
                                      <DailySummaryBanner
                                        isToday={day.key === todayIso}
                                        summary={s}
                                        onOpen={() =>
                                          setOpenSummaryDate(day.key)
                                        }
                                      />
                                    );
                                  })()}
                                  day={day.day}
                                  isoDate={day.key}
                                  skippedCount={day.skipped.length}
                                  suggestedCount={day.suggested.length}
                                  weekday={day.weekday}
                                />
                              )}
                              {day.suggested.map((d) => (
                                <MarketRow
                                  key={d.key}
                                  RowActionCell={config.RowActionCell}
                                  benchmarkBars={benchmarkBars}
                                  benchmarkCurrent={benchmarkCurrent}
                                  benchmarkEntry={benchmarkEntry(d)}
                                  benchmarkLabel={config.benchmarkLabel}
                                  chartMode={chartMode}
                                  dealing={d}
                                  fmt={config.priceFormat}
                                  selected={selectedKey === d.key}
                                  showLogo={logosEnabled}
                                  stockBars={stockBars[d.ticker]}
                                  stockCurrentMajor={stockCurrent(d.ticker)}
                                  onSelect={() => setSelectedKey(d.key)}
                                />
                              ))}
                              {day.skipped.length > 0 && (
                                <MarketSkippedCluster
                                  RowActionCell={config.RowActionCell}
                                  benchmarkBars={benchmarkBars}
                                  benchmarkCurrent={benchmarkCurrent}
                                  benchmarkEntry={benchmarkEntry}
                                  benchmarkLabel={config.benchmarkLabel}
                                  chartMode={chartMode}
                                  dealings={day.skipped}
                                  fmt={config.priceFormat}
                                  open={openSkipped.has(clusterKey)}
                                  selectedKey={selectedKey}
                                  showLogo={logosEnabled}
                                  stockBars={stockBars}
                                  stockCurrent={stockCurrent}
                                  visibleCount={skippedVisible[clusterKey] ?? 5}
                                  onSelect={(d) => setSelectedKey(d.key)}
                                  onShowMore={() => showMoreSkipped(clusterKey)}
                                  onToggle={() => toggleSkipped(clusterKey)}
                                />
                              )}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="text-xs text-muted text-center space-y-1">
          <div>
            Showing {filteredDealings.length} filing
            {filteredDealings.length === 1 ? "" : "s"}
            {stats && (
              <>
                {" "}
                of {stats.viewCounts[view] ?? stats.total}{" "}
                {currentView?.label.toLowerCase()}
              </>
            )}
            {search.trim() && filteredDealings.length !== dealings.length && (
              <>
                {" "}
                · {dealings.length - filteredDealings.length} hidden by search
              </>
            )}
          </div>
          {stats?.debugBreakdown && (
            <div className="text-[10px] opacity-70">{stats.debugBreakdown}</div>
          )}
        </div>
      </section>

      <MarketTodayDrawer
        TodayEmpty={TodayEmptyComponent}
        fmt={config.priceFormat}
        loading={loading && dealings.length === 0}
        news={hasNewsSource ? news : undefined}
        newsFooterNote={config.newsFooterNote}
        newsHeading={config.newsHeading}
        selectedKey={selectedKey}
        todayDealings={todayDealings}
        onSelect={(d) => setSelectedKey(d.key)}
      />

      <MarketDetailDrawer
        AnalysisOverlay={config.AnalysisOverlay}
        DetailBody={config.DetailBody}
        DetailPosition={config.DetailPosition}
        DummyDetailBody={config.DummyDetailBody}
        dealing={selectedDealing}
        fmt={config.priceFormat}
        gating={gating}
        showLogo={logosEnabled}
        onClose={() => setSelectedKey(null)}
      />

      <DailySummarySheet
        date={openSummaryDate}
        onClose={() => setOpenSummaryDate(null)}
        onSelectDeal={(deal) => {
          // UK MarketDealing.key === dealing.id; this surface is UK-only
          // because /api/daily-summary is UK-only.
          setOpenSummaryDate(null);
          setSelectedKey(deal.id);
        }}
      />
    </DefaultLayout>
  );
}
