import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";

import DefaultLayout from "@/layouts/default";
import { api } from "@/lib/api";
import type {
  IngestSummary,
  MarketConfig,
  MarketDealing,
  MarketStats,
  NewsPayload,
} from "@/lib/markets/types";

import { MarketDetailDrawer } from "./market-detail-drawer";
import { MarketFilterBar, type MarketViewMode } from "./market-filter-bar";
import { MarketHeroCard, type MarketHeroStats } from "./market-hero";
import { MarketRow, MarketRowHeader } from "./market-row";
import { MarketTodayDrawer } from "./market-today-drawer";
import { bucketByMonth, todayKeyIso } from "./market-utils";

/** The full shell that every market page mounts. Reads everything from
 *  MarketConfig — adding a new market means writing a new MarketConfig and
 *  pointing a route at `<MarketPage config={…} />`. Nothing in here should
 *  grow per-market branches. */
export function MarketPage<W>({ config }: { config: MarketConfig<W> }) {
  const [view, setView] = useState<string>(config.defaultView);
  const [viewMode, setViewMode] = useState<MarketViewMode>("chronological");
  const [search, setSearch] = useState("");
  const [dealings, setDealings] = useState<MarketDealing<W>[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openMonths, setOpenMonths] = useState<Set<string> | null>(null);

  /** Live stock prices keyed by ticker — close_pence column raw values. */
  const [prices, setPrices] = useState<Record<string, number>>({});
  /** Benchmark daily closes keyed by ISO date — raw values from the
   *  prices table (index points). */
  const [benchEntries, setBenchEntries] = useState<Record<string, number>>({});

  const [news, setNews] = useState<NewsPayload | null>(
    config.fetchNews ? null : null,
  );
  const hasNewsSource = !!config.fetchNews;

  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(null);
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
  // call to /api/prices/latest — same shape across markets.
  useEffect(() => {
    if (dealings.length === 0) return;
    const tickers = Array.from(new Set(dealings.map((d) => d.ticker).filter(Boolean)));
    if (tickers.length === 0) return;
    api
      .latestPrices([...tickers, config.benchmarkTicker])
      .then((list) => {
        const map: Record<string, number> = {};
        for (const p of list) map[p.ticker] = p.price_pence;
        setPrices(map);
      })
      .catch(() => {});
  }, [dealings, config.benchmarkTicker]);

  // Benchmark daily-close history — pre-loaded once per market.
  useEffect(() => {
    api
      .priceHistory(config.benchmarkTicker, 365)
      .then((bars) => {
        const map: Record<string, number> = {};
        for (const b of bars) map[b.date] = b.close_pence;
        setBenchEntries(map);
      })
      .catch(() => {});
  }, [config.benchmarkTicker]);

  // News — optional. Refresh on the same cadence as the main poll so the
  // strip stays live.
  useEffect(() => {
    if (!config.fetchNews) return;
    let active = true;
    const fetchNews = () => {
      config.fetchNews!()
        .then((n) => { if (active) setNews(n); })
        .catch(() => {});
    };
    fetchNews();
    const interval = config.pollIntervalMs ?? 30_000;
    if (!interval) return () => { active = false; };
    const id = setInterval(fetchNews, interval);
    return () => { active = false; clearInterval(id); };
  }, [config]);

  /* ───────── Derived state ───────────────────────────────────────────── */

  const filteredDealings = useMemo(() => {
    if (!search.trim()) return dealings;
    const q = search.trim().toLowerCase();
    return dealings.filter(
      (d) =>
        d.ticker.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q) ||
        d.insiderName.toLowerCase().includes(q),
    );
  }, [dealings, search]);

  const todayIso = useMemo(() => todayKeyIso(), []);

  const todayDealings = useMemo(
    () => filteredDealings.filter((d) => d.disclosedDate.slice(0, 10) === todayIso),
    [filteredDealings, todayIso],
  );

  const monthBuckets = useMemo(
    () => bucketByMonth(filteredDealings, todayIso),
    [filteredDealings, todayIso],
  );

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

  const benchmarkEntry = useCallback(
    (d: MarketDealing<W>): number | undefined => {
      const tradeIso = d.tradeDate.slice(0, 10);
      const disclosedIso = d.disclosedDate.slice(0, 10);
      return benchEntries[tradeIso] ?? benchEntries[disclosedIso];
    },
    [benchEntries],
  );

  const benchmarkCurrent = prices[config.benchmarkTicker];

  const byGain = useMemo(() => {
    return filteredDealings
      .map((d) => {
        const current = stockCurrent(d.ticker);
        if (d.entryPrice == null || current == null || d.entryPrice <= 0) return null;
        const pct = ((current - d.entryPrice) / d.entryPrice) * 100;
        return { dealing: d, pct };
      })
      .filter((x): x is { dealing: MarketDealing<W>; pct: number } => x != null)
      .sort((a, b) => b.pct - a.pct);
  }, [filteredDealings, stockCurrent]);

  const heroStats = useMemo<MarketHeroStats | null>(() => {
    if (benchmarkCurrent == null || Object.keys(benchEntries).length === 0) return null;
    const picks: { stockRet: number; benchRet: number }[] = [];
    for (const d of filteredDealings) {
      const current = stockCurrent(d.ticker);
      const benchEntry = benchmarkEntry(d);
      if (
        d.entryPrice == null || d.entryPrice <= 0 ||
        current == null ||
        benchEntry == null || benchEntry <= 0
      ) continue;
      const stockRet = (current - d.entryPrice) / d.entryPrice;
      const benchRet = (benchmarkCurrent - benchEntry) / benchEntry;
      if (!isFinite(stockRet) || !isFinite(benchRet)) continue;
      picks.push({ stockRet, benchRet });
    }
    if (picks.length === 0) return null;
    const avgStock = picks.reduce((s, p) => s + p.stockRet, 0) / picks.length;
    const avgBench = picks.reduce((s, p) => s + p.benchRet, 0) / picks.length;
    return {
      count: picks.length,
      avgStock,
      avgBench,
      alphaPp: (avgStock - avgBench) * 100,
      beatCount: picks.filter((p) => p.stockRet > p.benchRet).length,
    };
  }, [filteredDealings, stockCurrent, benchmarkEntry, benchmarkCurrent, benchEntries]);

  const selectedDealing = useMemo(
    () => (selectedKey ? filteredDealings.find((d) => d.key === selectedKey) ?? null : null),
    [filteredDealings, selectedKey],
  );

  const currentView = config.views.find((v) => v.id === view);
  const heroViewLabel = currentView ? `${currentView.label} filings` : "Filings";

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

  /* ───────── Render ──────────────────────────────────────────────────── */

  const emptyState = filteredDealings.length === 0 && !loading && (
    <div className="bg-[#faf7f2] dark:bg-surface rounded-xl px-4 py-10 text-center text-sm text-muted">
      {search.trim() ? (
        <>
          No filings match <span className="font-medium text-foreground/70">"{search}"</span>.{" "}
          <button
            onClick={() => setSearch("")}
            className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
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
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {config.title}
          </h1>
          <div className="mt-2 text-sm text-foreground/55 max-w-2xl">
            {config.description}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            className="inline-flex rounded-full border border-separator bg-surface/40 p-1"
          >
            {config.views.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={`text-sm px-4 py-1.5 rounded-full transition-colors font-medium ${
                  view === v.id
                    ? "bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882]"
                    : "text-muted hover:text-foreground"
                }`}
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
          <div className="ml-auto flex items-center gap-3 text-xs">
            {stats?.latestDisclosedLabel && (
              <span className="text-muted hidden sm:inline">
                {stats.latestDisclosedLabel}
              </span>
            )}
            {config.ingest && (
              <button
                onClick={runIngest}
                disabled={ingesting}
                className="rounded-full border border-separator bg-[#6b5038]/10 hover:bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882] px-3 py-1.5 font-medium disabled:opacity-50 transition-colors"
              >
                {ingesting ? "Fetching…" : config.ingest.label}
              </button>
            )}
          </div>
        </div>

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

        {/* Hero — performance vs benchmark + market positioning copy */}
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="hidden lg:flex flex-col justify-center px-2">
            <h2 className="text-2xl font-semibold tracking-tight">{config.heroHeading}</h2>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              {config.heroTaglines.map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <span className="text-[#6b5038]">✓</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <MarketHeroCard
            stats={heroStats}
            benchmarkLabel={config.benchmarkLabel}
            viewLabel={heroViewLabel}
          />
        </div>

        {/* Today — inline card; lg+ hides this because the right drawer
            already shows today's filings. */}
        <div className="lg:hidden bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e8e0d5] dark:border-separator">
            <div className="text-sm font-semibold flex items-center gap-2">
              <PlayIcon className="w-4 h-4" />Today
            </div>
            {todayDealings.length > 0 && (
              <div className="text-xs text-muted mt-0.5">
                {todayDealings.length}{" "}
                {todayDealings.length === 1 ? "filing" : "filings"} disclosed today
              </div>
            )}
          </div>
          {todayDealings.length > 0 ? (
            <div className="divide-y divide-black/[0.06] dark:divide-separator">
              {todayDealings.map((d) => (
                <MarketRow
                  key={d.key}
                  dealing={d}
                  selected={selectedKey === d.key}
                  onSelect={() => setSelectedKey(d.key)}
                  stockCurrentMajor={stockCurrent(d.ticker)}
                  benchmarkEntry={benchmarkEntry(d)}
                  benchmarkCurrent={benchmarkCurrent}
                  fmt={config.priceFormat}
                  benchmarkLabel={config.benchmarkLabel}
                  RowActionCell={config.RowActionCell}
                  hideDate
                />
              ))}
            </div>
          ) : (
            <div className="px-5 py-6 text-sm text-muted">
              No filings disclosed today yet.
            </div>
          )}
        </div>

        {loading && filteredDealings.length === 0 && (
          <div className="bg-[#faf7f2] dark:bg-surface rounded-xl px-4 py-10 text-center text-sm text-muted">
            Loading…
          </div>
        )}

        {emptyState}

        {/* By-gain view */}
        {filteredDealings.length > 0 && viewMode === "by-gain" && (
          <div className="bg-[#faf7f2] dark:bg-surface rounded-xl animate-content-in">
            <MarketFilterBar
              viewMode={viewMode}
              onViewMode={setViewMode}
              search={search}
              onSearch={setSearch}
            />
            <MarketRowHeader benchmarkLabel={config.benchmarkLabel} />
            <div className="divide-y divide-black/[0.06] dark:divide-separator overflow-hidden rounded-b-xl">
              {byGain.map(({ dealing: d }) => (
                <MarketRow
                  key={d.key}
                  dealing={d}
                  selected={selectedKey === d.key}
                  onSelect={() => setSelectedKey(d.key)}
                  stockCurrentMajor={stockCurrent(d.ticker)}
                  benchmarkEntry={benchmarkEntry(d)}
                  benchmarkCurrent={benchmarkCurrent}
                  fmt={config.priceFormat}
                  benchmarkLabel={config.benchmarkLabel}
                  RowActionCell={config.RowActionCell}
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
                        viewMode={viewMode}
                        onViewMode={setViewMode}
                        search={search}
                        onSearch={setSearch}
                      />
                    </div>
                  )}
                  <div className={`sticky top-[102px] z-10 ${monthIdx === 0 ? "" : "pt-3"} bg-[#f5f0e8] dark:bg-background`}>
                    <button
                      className={`w-full flex items-center justify-between px-6 py-5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors bg-[#faf7f2] dark:bg-surface ${monthIdx === 0 ? "" : "rounded-t-xl"} ${monthOpen ? "" : "rounded-b-xl"}`}
                      onClick={() => toggleMonth(month.key)}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <CalendarDaysIcon className="w-5 h-5 text-muted shrink-0" />
                        <div className="text-xl font-semibold">{month.label} {month.year}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted">
                          {month.count} {month.count === 1 ? "filing" : "filings"}
                        </span>
                        <ChevronDownIcon
                          className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${monthOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                  </div>
                  {monthOpen && (
                    <div className="bg-[#faf7f2] dark:bg-surface rounded-b-xl">
                      <MarketRowHeader benchmarkLabel={config.benchmarkLabel} />
                      <div className="divide-y divide-black/[0.06] dark:divide-separator">
                        {month.days.map((day) => (
                          <Fragment key={day.key}>
                            {day.dealings.map((d) => (
                              <MarketRow
                                key={d.key}
                                dealing={d}
                                selected={selectedKey === d.key}
                                onSelect={() => setSelectedKey(d.key)}
                                stockCurrentMajor={stockCurrent(d.ticker)}
                                benchmarkEntry={benchmarkEntry(d)}
                                benchmarkCurrent={benchmarkCurrent}
                                fmt={config.priceFormat}
                                benchmarkLabel={config.benchmarkLabel}
                                RowActionCell={config.RowActionCell}
                              />
                            ))}
                          </Fragment>
                        ))}
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
              <> of {stats.viewCounts[view] ?? stats.total} {currentView?.label.toLowerCase()}</>
            )}
            {search.trim() && filteredDealings.length !== dealings.length && (
              <> · {dealings.length - filteredDealings.length} hidden by search</>
            )}
          </div>
          {stats?.debugBreakdown && (
            <div className="text-[10px] opacity-70">{stats.debugBreakdown}</div>
          )}
        </div>
      </section>

      <MarketTodayDrawer
        todayDealings={todayDealings}
        onSelect={(d) => setSelectedKey(d.key)}
        news={hasNewsSource ? news : undefined}
        newsHeading={config.newsHeading}
        newsFooterNote={config.newsFooterNote}
        fmt={config.priceFormat}
        selectedKey={selectedKey}
      />

      <MarketDetailDrawer
        dealing={selectedDealing}
        onClose={() => setSelectedKey(null)}
        fmt={config.priceFormat}
        DetailBody={config.DetailBody}
        DetailPosition={config.DetailPosition}
      />
    </DefaultLayout>
  );
}
