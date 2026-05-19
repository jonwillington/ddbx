import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowsUpDownIcon,
  ArrowTopRightOnSquareIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";

import { Skeleton } from "@/components/skeleton";
import type { MarketDealing, NewsItem, NewsPayload } from "@/lib/markets/types";
import type { PriceFormat } from "@/components/position-card";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

interface MarketTodayDrawerProps<W> {
  /** Filings disclosed today. Empty array is the "no filings yet" state. */
  todayDealings: MarketDealing<W>[];
  /** Click a today row → opens the detail drawer. */
  onSelect: (d: MarketDealing<W>) => void;
  /** Optional news. null = loading skeleton; undefined = market has no news
   *  source yet (the news section is hidden entirely). */
  news?: NewsPayload | null;
  /** Heading rendered above the news strip. Defaults to "Market news". */
  newsHeading?: string;
  /** Caption rendered below the news strip. */
  newsFooterNote?: ReactNode;
  /** Format bundle for the value column on each row. */
  fmt: PriceFormat;
  /** Selection state — used to highlight the currently-open detail row. */
  selectedKey?: string | null;
  /** Optional empty-state component for the today pane. Falls back to the
   *  default "No filings disclosed today yet." copy when undefined. */
  TodayEmpty?: ComponentType;
  /** True while the initial dealings fetch is in flight. Lets the drawer
   *  render skeleton rows instead of the empty state. */
  loading?: boolean;
}

/** Persistent right-hand drawer, lg+ only. Each market mounts its own
 *  inside MarketPage; the global UK drawer in App.tsx is independently
 *  controlled by HIDE_DRAWER_PREFIXES. */
export function MarketTodayDrawer<W>({
  todayDealings,
  onSelect,
  news,
  newsHeading = "Market news",
  newsFooterNote,
  fmt,
  selectedKey,
  TodayEmpty,
  loading = false,
}: MarketTodayDrawerProps<W>) {
  const hasNewsSource = news !== undefined;
  const prevNewsUrlsRef = useRef<Set<string> | null>(null);
  const [newNewsUrls, setNewNewsUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!news || news.items.length === 0) return;
    const currentUrls = new Set(news.items.map((n) => n.url));
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
  }, [news]);

  return (
    <aside className="hidden lg:flex fixed top-0 right-0 bottom-0 w-80 flex-col border-l border-[#e8e0d5] dark:border-separator bg-[#faf7f2] dark:bg-surface z-20">
      {/* Header — matches navbar h-16 */}
      <div className="h-16 px-5 flex items-center border-b border-[#e8e0d5] dark:border-separator shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold">Today</span>
          {todayDealings.length > 0 && (
            <span className="text-[10px] text-muted truncate">
              {todayDealings.length} {todayDealings.length === 1 ? "filing" : "filings"}
            </span>
          )}
        </div>
      </div>

      {/* Top half — today's filings */}
      <div
        className={`flex flex-col min-h-0 ${
          hasNewsSource ? "flex-1 border-b border-[#e8e0d5] dark:border-separator" : "flex-1"
        }`}
      >
        <div className="px-4 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted shrink-0">
          Today&apos;s filings
        </div>
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-x-0 top-0 h-4 pointer-events-none z-[1] bg-gradient-to-b from-[#faf7f2] dark:from-surface to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-4 pointer-events-none z-[1] bg-gradient-to-t from-[#faf7f2] dark:from-surface to-transparent" />
          <div className="h-full overflow-y-auto overscroll-contain">
            {todayDealings.length > 0 ? (
              <div className="divide-y divide-black/[0.06] dark:divide-separator">
                {todayDealings.map((d) => (
                  <TodayRow
                    key={d.key}
                    dealing={d}
                    selected={selectedKey === d.key}
                    onSelect={() => onSelect(d)}
                    fmt={fmt}
                  />
                ))}
              </div>
            ) : loading ? (
              <div className="divide-y divide-black/[0.06] dark:divide-separator">
                {Array.from({ length: 4 }).map((_, i) => (
                  <TodayRowSkeleton key={i} />
                ))}
              </div>
            ) : TodayEmpty ? (
              <TodayEmpty />
            ) : (
              <div className="px-4 py-6 text-xs text-muted/70">
                No filings disclosed today yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom half — news strip (only if the market provides one) */}
      {hasNewsSource && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-x-0 top-0 h-4 pointer-events-none z-[1] bg-gradient-to-b from-[#faf7f2] dark:from-surface to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-4 pointer-events-none z-[1] bg-gradient-to-t from-[#faf7f2] dark:from-surface to-transparent" />
            <div className="h-full overflow-y-auto overscroll-contain">
              <NewsStrip
                news={news}
                heading={newsHeading}
                footerNote={newsFooterNote}
                newNewsUrls={newNewsUrls}
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function TodayRowSkeleton() {
  return (
    <div className="w-full px-4 py-3.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-10 rounded" />
            <Skeleton className="h-4 flex-1 rounded" />
          </div>
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <Skeleton className="h-4 w-14 rounded" />
          <Skeleton className="h-2.5 w-10 rounded" />
        </div>
      </div>
    </div>
  );
}

function TodayRow<W>({
  dealing,
  selected,
  onSelect,
  fmt,
}: {
  dealing: MarketDealing<W>;
  selected: boolean;
  onSelect: () => void;
  fmt: PriceFormat;
}) {
  const valueLabel = dealing.value != null ? fmt.formatValue(dealing.value) : "—";
  return (
    <button
      className={`w-full text-left px-4 py-3.5 transition-colors ${
        selected
          ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]"
          : "hover:bg-black/[0.03] dark:hover:bg-white/5"
      } ${!dealing.isPurchase ? "opacity-60" : ""}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary shrink-0">
              {(dealing.ticker || "—").replace(/\.L$/, "")}
            </span>
            <span className="text-sm font-medium truncate">
              {dealing.company || "—"}
            </span>
          </div>
          <div className="text-xs text-muted truncate">{dealing.insiderName}</div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1 text-right">
          <span className="text-sm font-medium tabular-nums leading-tight">
            {valueLabel}
          </span>
          {dealing.rating && (
            <span className="text-[10px] text-muted/70 uppercase">{dealing.rating}</span>
          )}
          {!dealing.rating && dealing.triageVerdict && (
            <span className="text-[10px] text-muted/70 uppercase">{dealing.triageVerdict}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function NewsStrip({
  news,
  heading,
  footerNote,
  newNewsUrls,
}: {
  news: NewsPayload | null | undefined;
  heading: string;
  footerNote?: ReactNode;
  newNewsUrls: Set<string>;
}) {
  return (
    <div className="border-b border-[#e8e0d5] dark:border-separator px-5 lg:px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted mb-3">
        <span className="inline-flex items-center gap-2">
          <NewspaperIcon className="w-3.5 h-3.5" />
          {heading}
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] text-muted/70">
          <ArrowsUpDownIcon className="w-3 h-3" />
          Scroll
        </span>
      </div>
      {news === null ? (
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
      ) : !news || news.items.length === 0 ? (
        <p className="text-xs text-muted">No headlines available right now.</p>
      ) : (
        <ul className="space-y-4">
          {news.items.slice(0, 12).map((n, i) => (
            <NewsRow key={`${n.url}-${i}`} item={n} index={i} fresh={newNewsUrls.has(n.url)} />
          ))}
        </ul>
      )}
      {news?.fetched_at && (
        <p className="text-[10px] text-muted/50 mt-2">
          Refreshed{" "}
          {new Date(news.fetched_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
      {footerNote && (
        <p className="text-[10px] text-muted/45 mt-2 leading-relaxed">{footerNote}</p>
      )}
    </div>
  );
}

function NewsRow({ item, index, fresh }: { item: NewsItem; index: number; fresh: boolean }) {
  return (
    <li className="pb-0.5" style={{ animation: `fade-in-up 0.4s ease-out ${index * 0.04}s both` }}>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group">
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostnameFromUrl(item.url))}&sz=32`}
          alt=""
          className="w-3.5 h-3.5 mt-0.5 rounded-sm shrink-0"
          loading="lazy"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] font-mono leading-none text-[#6b5038]/90 dark:text-[#c4a882] mb-1">
            {fresh && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#7c5cbf] animate-[fade-in-up_0.3s_ease-out]" />
            )}
            {item.source}
          </span>
          <span className="inline-flex items-start gap-1.5 text-xs text-foreground/90 leading-snug line-clamp-3 group-hover:text-[#6b5038] transition-colors">
            <span>{item.title}</span>
            <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5 shrink-0 mt-0.5 opacity-60 group-hover:opacity-100" />
          </span>
        </span>
      </a>
    </li>
  );
}
