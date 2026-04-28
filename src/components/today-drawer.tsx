import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowsUpDownIcon,
  ArrowTopRightOnSquareIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";

import { api, type Dealing, type UkNewsItem } from "@/lib/api";
import { isSuggestedDealing } from "@/lib/dealing-classify";
import { compareDealingsNewestFirst, formatDisclosedCompact } from "@/lib/dealing-dates";
import { useDataVersion } from "@/lib/use-data-version";
import { useDiscretion } from "@/lib/discretion";
import { RatingBadge } from "@/components/rating-badge";
import { Skeleton } from "@/components/skeleton";
import { DayMoreInApp } from "@/components/discretion/day-more-in-app";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Self-contained right-hand drawer. Mounted at the page level on any route
// that wants the today/news column, so the layout stays consistent across
// Dashboard and Performance.
export function TodayDrawer() {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const discretion = useDiscretion();

  const [dealings, setDealings] = useState<Dealing[] | null>(null);
  const [ukNews, setUkNews] = useState<{
    items: UkNewsItem[];
    fetched_at: string | null;
  } | null>(null);
  const prevNewsUrlsRef = useRef<Set<string> | null>(null);
  const [newNewsUrls, setNewNewsUrls] = useState<Set<string>>(new Set());

  const isTradingDay = useMemo(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5;
  }, []);

  const loadDealings = useCallback(() => {
    api.dealings().then(setDealings).catch(() => {});
    if (isTradingDay) {
      api.ukNews().then(setUkNews).catch(() => {});
    }
  }, [isTradingDay]);

  useEffect(() => {
    loadDealings();
  }, [loadDealings]);

  const lastChecked = useDataVersion(loadDealings, 30_000);

  useEffect(() => {
    if (!ukNews || ukNews.items.length === 0) return;
    const currentUrls = new Set(ukNews.items.map((n) => n.url));
    if (prevNewsUrlsRef.current === null) {
      prevNewsUrlsRef.current = currentUrls;
    } else {
      const fresh = new Set<string>();
      for (const url of currentUrls) {
        if (!prevNewsUrlsRef.current.has(url)) fresh.add(url);
      }
      if (fresh.size > 0) setNewNewsUrls(fresh);
      prevNewsUrlsRef.current = currentUrls;
    }
  }, [ukNews]);

  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const todayDeals = useMemo((): Dealing[] => {
    if (!dealings) return [];
    const list = dealings.filter(
      (d) => (d.disclosed_date ?? d.trade_date).slice(0, 10) === todayKey,
    );
    return [...list].sort(compareDealingsNewestFirst);
  }, [dealings, todayKey]);

  const marketOpen = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    if (dow < 1 || dow > 5) return false;
    const h = parseInt(
      now.toLocaleString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        hour12: false,
      }),
    );
    const m = parseInt(
      now.toLocaleString("en-GB", {
        timeZone: "Europe/London",
        minute: "2-digit",
      }),
    );
    const mins = h * 60 + m;
    return mins >= 480 && mins < 990;
  }, []);

  if (!isTradingDay) return null;

  const selectDealing = (d: Dealing) => navigate(`/dealings/${d.id}`);

  const visibleDeals = discretion.enabled
    ? todayDeals.slice(0, discretion.listCap)
    : todayDeals;

  return (
    <aside className="hidden lg:flex fixed top-0 right-0 bottom-0 w-80 flex-col border-l border-[#e8e0d5] dark:border-separator bg-[#faf7f2] dark:bg-surface z-20">
      {/* Header — matches navbar h-16 */}
      <div className="h-16 px-5 flex items-center border-b border-[#e8e0d5] dark:border-separator shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold">Today</span>
          {todayDeals.length > 0 && (
            <span className="text-[10px] text-muted truncate">
              {todayDeals.filter(isSuggestedDealing).length} analysed ·{" "}
              {todayDeals.filter((d) => !isSuggestedDealing(d)).length} skipped
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="relative inline-flex items-center justify-center w-4 h-4">
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: marketOpen
                    ? "oklch(45% 0.14 155 / 0.15)"
                    : "oklch(45% 0.14 18 / 0.15)",
                }}
              />
              <span
                className="relative w-1.5 h-1.5 rounded-full"
                style={{
                  background: marketOpen
                    ? "oklch(45% 0.14 155)"
                    : "oklch(45% 0.14 18 / 0.6)",
                }}
              />
            </span>
            <span className="text-xs text-muted">
              {marketOpen ? "Open" : "Closed"}
            </span>
          </div>
        </div>
      </div>

      {/* Top half — Today's deals */}
      <div className="flex-1 min-h-0 flex flex-col border-b border-[#e8e0d5] dark:border-separator">
        <div className="px-4 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted shrink-0">
          Today&apos;s deals
        </div>
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-x-0 top-0 h-4 pointer-events-none z-[1] bg-gradient-to-b from-[#faf7f2] dark:from-surface to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-4 pointer-events-none z-[1] bg-gradient-to-t from-[#faf7f2] dark:from-surface to-transparent" />
          <div className="h-full overflow-y-auto overscroll-contain">
            {todayDeals.length > 0 && (
              <div className="divide-y divide-black/[0.06] dark:divide-separator">
                {visibleDeals.map((d) => {
                  const a = d.analysis;
                  const t = d.triage;
                  const tickerLabel = d.ticker.replace(/\.L$/, "");
                  const companyLabel = d.company.replace(/\s*\([^)]*\)\s*$/, "");
                  const suggested = isSuggestedDealing(d);
                  const displayIso = d.disclosed_date || d.trade_date;
                  const triageLabel =
                    t?.verdict === "skip"
                      ? "Skipped"
                      : t?.verdict === "maybe"
                        ? "Maybe"
                        : t?.verdict === "promising"
                          ? "Promising"
                          : "—";
                  const showSkippedRail =
                    !suggested && !(t?.verdict === "skip" && !a);
                  return (
                    <button
                      key={d.id}
                      className={`w-full text-left px-4 py-3.5 transition-colors ${
                        routeId === d.id
                          ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]"
                          : "hover:bg-black/[0.03] dark:hover:bg-white/5"
                      } ${!a ? "opacity-60" : ""}`}
                      onClick={() => selectDealing(d)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary shrink-0">
                              {tickerLabel}
                            </span>
                            <span className="text-sm font-medium truncate">
                              {companyLabel}
                            </span>
                          </div>
                          <div className="text-xs text-muted truncate">
                            {d.director.name}
                          </div>
                          <div className="text-[10px] text-muted/90 tabular-nums mt-1">
                            {formatDisclosedCompact(displayIso)}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1 text-right">
                          <span className="text-sm font-medium tabular-nums leading-tight">
                            {new Intl.NumberFormat("en-GB", {
                              style: "currency",
                              currency: "GBP",
                              maximumFractionDigits: 0,
                            }).format(d.value_gbp)}
                          </span>
                          {suggested && a && (
                            <span
                              className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                a.rating === "significant"
                                  ? "bg-[#8b4513]/18 text-[#6b2f0a] border-[#8b4513]/40 dark:bg-[#d4845a]/15 dark:text-[#e8a878] dark:border-[#d4845a]/35"
                                  : a.rating === "noteworthy"
                                    ? "bg-[#6b5038]/14 text-[#4a3520] border-[#6b5038]/35 dark:bg-[#b8956e]/12 dark:text-[#c4a882] dark:border-[#b8956e]/30"
                                    : a.rating === "minor"
                                      ? "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40"
                                      : "bg-transparent text-[#b0a898] border-[#d8d0c6]/60"
                              }`}
                            >
                              {a.rating.charAt(0).toUpperCase() + a.rating.slice(1)}
                            </span>
                          )}
                          {!suggested && (
                            <>
                              {showSkippedRail && (
                                <span className="text-[10px] font-semibold text-amber-900/85 dark:text-amber-200/75 leading-none">
                                  Skipped
                                </span>
                              )}
                              {a ? (
                                <RatingBadge
                                  rating={a.rating}
                                  className="!w-auto min-w-0 scale-[0.85] origin-right"
                                />
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-[#d0c8be]/50 bg-[#d0c8be]/10 px-2 py-0.5 text-[10px] font-semibold text-[#7a7068]">
                                  {triageLabel}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {discretion.enabled && (
                  <DayMoreInApp
                    variant="compact"
                    count={Math.max(0, todayDeals.length - discretion.listCap)}
                  />
                )}
              </div>
            )}

            {/* Monitoring indicator */}
            <div className="py-4">
              <div className="text-center px-3">
                {marketOpen ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-xs text-muted/60">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#b0a898] animate-[pulse-dot_1.4s_ease-in-out_infinite]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#b0a898] animate-[pulse-dot_1.4s_ease-in-out_0.2s_infinite]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#b0a898] animate-[pulse-dot_1.4s_ease-in-out_0.4s_infinite]" />
                      </span>
                      Monitoring for new disclosures
                    </div>
                    {lastChecked && (
                      <div className="text-[10px] text-muted/40 mt-1">
                        Last checked{" "}
                        {lastChecked.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-muted/50">Markets are closed</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom half — UK market news */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-x-0 top-0 h-4 pointer-events-none z-[1] bg-gradient-to-b from-[#faf7f2] dark:from-surface to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-4 pointer-events-none z-[1] bg-gradient-to-t from-[#faf7f2] dark:from-surface to-transparent" />
          <div className="h-full overflow-y-auto overscroll-contain">
            <UkNewsStrip
              ukNews={ukNews}
              newNewsUrls={newNewsUrls}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

function UkNewsStrip({
  ukNews,
  newNewsUrls,
}: {
  ukNews: { items: UkNewsItem[]; fetched_at: string | null } | null;
  newNewsUrls: Set<string>;
}) {
  return (
    <div className="border-b border-[#e8e0d5] dark:border-separator px-5 lg:px-4 py-3">
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
        <ul className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="pb-0.5 flex items-start gap-2">
              <Skeleton className="w-3.5 h-3.5 rounded-sm shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </span>
            </li>
          ))}
        </ul>
      ) : ukNews.items.length === 0 ? (
        <p className="text-xs text-muted">No headlines available right now.</p>
      ) : (
        <ul className="space-y-4">
          {ukNews.items.slice(0, 12).map((n, i) => (
            <li
              key={`${n.url}-${i}`}
              className="pb-0.5"
              style={{ animation: `fade-in-up 0.4s ease-out ${i * 0.04}s both` }}
            >
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
                  <span className="flex items-center gap-1.5 text-[10px] font-mono leading-none text-[#6b5038]/90 dark:text-[#c4a882] mb-1">
                    {newNewsUrls.has(n.url) && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#7c5cbf] animate-[fade-in-up_0.3s_ease-out]" />
                    )}
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
}
