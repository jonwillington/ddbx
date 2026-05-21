// Multi-market plumbing for the public site. One MarketConfig per market;
// the generic <MarketPage> reads it and renders the same shape (header,
// hero, today, monthly list, drawers) regardless of where the data comes
// from. New markets land as a new MarketConfig file — nothing in the shell
// should grow per-market branches.
//
// Strategy: the wire-format types stay per-market (UK `Dealing`, US
// `UsDealing`, EU `EuDealing`) because they're genuinely different — Form 4
// has footnotes and 10b5-1 flags, RNS has the AIM-tier concept, etc.
// MarketDealing is the *shared columns* the shell renders. Anything richer
// stays on the wire row (`raw`) and is surfaced through component slots
// (RowActionCell, DetailBody) that the market provides.
//
// Companion: ~/ddbx-ios-app/investigations/multi-market/strategy.md lays
// out the equivalent decision for iOS — option (b), "translate at the
// edge, two wire contracts."

import type { ComponentType, ReactNode } from "react";
import type { PriceFormat } from "@/components/position-card";
import type { MarketSession } from "@/lib/market-status";
import type { HolidaySource } from "@/lib/bank-holidays";
import type { Rating } from "@/types/ddbx";

/** Triage label string. Markets are free to use their own taxonomies — the
 *  hero / today card just renders whatever the adapter produces. */
export type Tone = "buy" | "sell" | "plan" | "grant" | "exercise" | "neutral";

/** The shared row surface. One per logical card in the list — adapters do
 *  whatever bucketing they need (US groups Form 4 legs by filing_id; UK is
 *  1:1 with Dealing). `raw` is the original wire row, kept so slot
 *  components can read market-specific fields without re-fetching. */
export interface MarketDealing<W = unknown> {
  /** Unique key for selection / list keys. Stable across refetches. */
  key: string;
  /** Display identifier. Used in URLs (UK uses Dealing.id). May equal `key`. */
  id: string;

  ticker: string;
  company: string;
  insiderName: string;
  insiderRole?: string;

  /** ISO `YYYY-MM-DD…` strings — disclosure on the regulator side. Used for
   *  month/day bucketing and "today" detection. */
  disclosedDate: string;
  /** When the underlying trade happened. Often === disclosedDate. */
  tradeDate: string;

  /** Whether to render this row at full opacity. False rows render muted —
   *  for UK that's "didn't pass the analyst filter"; for US it's grants /
   *  exercises / footnoted non-trades. */
  isPurchase: boolean;

  /** Trade value in the market's domestic major currency unit. null when
   *  every leg was footnote-priced. */
  value: number | null;
  /** Per-share entry price in the same major-currency unit as `value`. */
  entryPrice: number | null;
  /** Total shares (sum across legs for US tranche-split filings). */
  shares: number;
  /** Number of underlying wire rows folded into this MarketDealing. >1 only
   *  on US tranche splits today. */
  legCount: number;

  /** Optional rating, when the market has a deep-analysis pipeline. Same
   *  Rating union the UK uses; markets without analysis omit this. */
  rating?: Rating;
  /** Optional triage verdict, when the market has a triage pass. US uses
   *  "promising" | "maybe" | "skip". */
  triageVerdict?: string;

  /** Human-readable action ("Open-market buy", "Director purchase"). */
  actionLabel: string;
  /** Visual tone for action chip + row muting decisions. */
  actionTone: Tone;

  /** The wire row that produced this MarketDealing. Slot components read
   *  market-specific extras off this. Typed via generic so each market keeps
   *  its own structure. */
  raw: W;
}

/** Counts surfaced by the view tab strip and footer. The adapter populates
 *  these from whatever backend it talks to. */
export interface MarketStats {
  total: number;
  /** Map from view-id → count. Whatever view ids the market declares. */
  viewCounts: Record<string, number>;
  /** Optional caption — e.g. "Latest disclosure 2026-05-19". */
  latestDisclosedLabel?: string;
  /** Optional debug/transparency line — e.g. "By code: P=3 · S=12 · A=4". */
  debugBreakdown?: string;
}

/** One view tab definition — id matches what the adapter expects in
 *  fetchDealings({ view }). */
export interface MarketView {
  id: string;
  label: string;
}

/** Result of fetchDealings — already grouped/normalized. */
export interface DealingsPayload<W = unknown> {
  dealings: MarketDealing<W>[];
  stats: MarketStats;
}

/** Manual ingest hook — optional. /us has one for SEC EDGAR pulls. */
export interface IngestAction {
  label: string;
  run: () => Promise<IngestSummary | void>;
}

export interface IngestSummary {
  scanned: number;
  parsed: number;
  inserted: number;
  replaced: number;
  errors: unknown[];
}

/** News item shape that the today drawer renders. Markets without a news
 *  source can simply omit fetchNews from their MarketConfig. */
export interface NewsItem {
  url: string;
  title: string;
  source: string;
}

export interface NewsPayload {
  items: NewsItem[];
  fetched_at: string | null;
}

/** Hero-card filter pill — a second axis on top of view tabs, used by UK
 *  to narrow the "average return vs benchmark" stat to one rating tier
 *  without changing what list is being fetched. The predicate runs over
 *  MarketDealings the shell already has on hand. */
export interface HeroFilter<W = unknown> {
  id: string;
  label: string;
  predicate: (d: MarketDealing<W>) => boolean;
}

/** A complete market plugin. Everything per-market hangs off here. */
export interface MarketConfig<W = unknown> {
  /** Stable identifier (`uk` | `us` | `eu` | …). Used in keys and URLs. */
  id: string;

  /** Page title — e.g. "US Form 4 (preview)". */
  title: string;
  /** Full HTML `<title>` for the dealings page. The shared DocumentTitle
   *  reads this from the active market — e.g. "ddbx · Director Dealings —
   *  UK Insider Transactions". */
  documentTitle: string;
  /** Explainer paragraph under the title. Markdown-y JSX is fine. */
  description: ReactNode;
  /** Short market label substituted into the shared hero headline
   *  ("Which directors have been buying shares in {marketLabel} companies?"). */
  marketLabel: string;
  /** Locale used for market-owned dates/numbers in the shared shell. Defaults
   *  to en-US when omitted. */
  locale?: string;
  /** Optional banner rendered above the hero — used by markets in
   *  early-access / beta to disclose data confidence. */
  topNotice?: ReactNode;

  /** Currency formatter bundle — used everywhere money is rendered. */
  priceFormat: PriceFormat;

  /** Optional trading-session shape — feeds the shared TodayEmpty state and
   *  any session-aware UI. UK supplies LSE; markets without a session
   *  concept can omit and the shell falls back to generic copy. */
  session?: MarketSession;
  /** Optional exchange-holiday source. UK uses GOV.UK England-and-Wales;
   *  US could supply a static NYSE map; SE similar for Nasdaq Stockholm. */
  holidays?: HolidaySource;

  /** Live-price normalization. Backend stores ticker closes in a column
   *  called `close_pence` regardless of market; for UK that's already in
   *  pence (matching dealing.price_pence); for US Yahoo's USD-cents path is
   *  observed live. Adapters supply the function that converts a raw close
   *  to the same major unit as MarketDealing.entryPrice — so the shell can
   *  compute stock return without knowing market specifics. */
  normalizeLivePrice: (
    close_pence: number,
    date?: string,
    fxRates?: Record<string, number>,
  ) => number | null;
  /** Whether the shared market shell should preload GBP/USD history so
   *  normalizeLivePrice can convert GBP-denominated price-cache rows back
   *  into native USD quotes. */
  usesGbpPerUsdFx?: boolean;

  /** Benchmark ticker passed to /api/prices — `^FTAS`, `^GSPC`, etc. */
  benchmarkTicker: string;
  /** Short label rendered in row headers, hero card, etc. */
  benchmarkLabel: string;

  /** View tabs to show (signal / interesting / all for US;
   *  significant / noteworthy / … for UK). */
  views: MarketView[];
  /** Initial selected view id. */
  defaultView: string;

  /** Poll cadence in ms; 0 to disable. Default 30s. */
  pollIntervalMs?: number;

  /** When false, MarketPage skips the per-ticker latest-price fetch and the
   *  benchmark-history fetch entirely. Set false on markets whose tickers
   *  the worker's /api/prices path doesn't know how to resolve yet (Sweden
   *  until pipeline/prices.ts learns SEK). Default true. */
  enableLivePrices?: boolean;

  /** When false, MarketRow and MarketDetailDrawer suppress the CompanyLogo
   *  bubble entirely (no empty circle, no monogram fallback). Use for
   *  markets where logo.dev coverage is thin enough that the placeholder is
   *  louder than nothing — verified for Sweden 2026-05-20: ~80% of seed-map
   *  tickers resolve to the same generic placeholder. Default true. */
  enableLogos?: boolean;

  /** Fetch dealings for a given view. Adapter does its own bucketing into
   *  MarketDealings before returning. */
  fetchDealings: (opts: { view: string }) => Promise<DealingsPayload<W>>;

  /** Optional news source. /api/news/uk for UK; nothing yet for US/EU. */
  fetchNews?: () => Promise<NewsPayload>;
  /** Heading rendered above the news strip in the today drawer. */
  newsHeading?: string;
  /** Footer caption under the news ("Refreshed at …"). */
  newsFooterNote?: ReactNode;

  /** Optional manual ingest button — currently used by /us. */
  ingest?: IngestAction;

  /** Component slot rendered in the row's right-most column. Receives the
   *  MarketDealing so it can read raw extras (Form 4 amendment flag, etc).
   *  Should produce visually compact chip(s). */
  RowActionCell: ComponentType<{ dealing: MarketDealing<W> }>;
  /** Component slot rendered as the body of the modal detail drawer (the
   *  popup that opens when a row is clicked). The shell provides the
   *  chrome — backdrop, scrollable container, escape-to-close. */
  DetailBody: ComponentType<{ dealing: MarketDealing<W> }>;
  /** Optional slot rendered above DetailBody — the position card / price
   *  chart block. Kept separate because the data wiring (live price fetch
   *  per ticker) belongs in the market, not the shell. */
  DetailPosition?: ComponentType<{ dealing: MarketDealing<W> }>;

  /** Empty-state copy when fetchDealings returns nothing for a given view. */
  renderEmptyState?: (opts: {
    view: string;
    stats: MarketStats | null;
    setView: (v: string) => void;
  }) => ReactNode;

  /** Optional component slot rendered when today has no filings yet. UK
   *  surfaces LSE-status-aware messaging ("Closed for Spring bank holiday"
   *  vs "No deals yet — markets reopen at 8:00"); markets without a session
   *  concept can omit this and fall back to the generic "No filings yet"
   *  copy. The slot is a Component (not a render fn) so it can hold hooks. */
  TodayEmpty?: ComponentType;

  /** Format a raw ticker for human-readable UI. The raw ticker is still passed
   *  to price/logo fetches; this is just display text. */
  formatTickerDisplay?: (ticker: string) => string;
  /** Optional market-specific row muting rule. When omitted, the shared row
   *  falls back to the historical UK rule: unrated or non-purchase rows fade. */
  isRowMuted?: (d: MarketDealing<W>) => boolean;

  /** Hero-card filter pills. Optional — when present, MarketPage renders a
   *  pill strip above the hero and narrows the hero performance stats to
   *  the matching dealings. UK uses this for the rating axis
   *  (Significant / Noteworthy / All / Routine). */
  heroFilters?: HeroFilter<W>[];
  /** Default-selected hero filter id; falls back to heroFilters[0]?.id. */
  defaultHeroFilter?: string;

  /** Predicate identifying "skipped" rows — dealings that exist in the data
   *  but didn't earn full analysis. The shell collapses these into a
   *  per-day cluster the user can expand. Markets without an analyst pass
   *  omit this and every row renders inline. */
  isSkipped?: (d: MarketDealing<W>) => boolean;

  /** Discretion-gating hook. When provided, MarketDetailDrawer calls
   *  `recordView(dealId)` on open and falls back to the dummy body +
   *  overlay when `hasFullAccess(dealId)` returns false. The hook owns
   *  whatever storage it needs — the shell never touches localStorage. */
  useGating?: () => GatingInfo;
  /** Component rendered as a blurred replacement for DetailBody when the
   *  current viewer doesn't have full access. Markets supply their own so
   *  the shape/length matches their real analysis. */
  DummyDetailBody?: ComponentType<{ dealing: MarketDealing<W> }>;
  /** Overlay rendered above the blurred dummy body — the "open the app" CTA.
   *  Positioned absolutely inside the drawer body. */
  AnalysisOverlay?: ComponentType;

}

/** Whether the per-row performance number (and the inline sparkline)
 *  shows the stock's own return or its alpha vs the market benchmark. */
export type ChartAxis = "raw" | "market";

/** Whether returns are measured from the trade date or from the disclosure
 *  date. Mirrors iOS `DashboardAnchor`. */
export type ChartAnchor = "trade" | "disclosure";

/** Two-axis mode that drives the inline sparkline and the right-most
 *  Performance cell on every row. Persisted to localStorage so the user's
 *  pick survives page reloads. */
export interface ChartMode {
  axis: ChartAxis;
  anchor: ChartAnchor;
}

/** Shape the shell expects back from `useGating`. Markets layer whatever
 *  policy they want behind these three fields; the shell only knows about
 *  per-deal access checks and view recording. */
export interface GatingInfo {
  /** Whether gating is on for this session at all. False = treat every
   *  drawer as fully-accessible. */
  enabled: boolean;
  /** True if the viewer is allowed to see real content for this deal. */
  hasFullAccess: (dealId: string) => boolean;
  /** Called by the shell when a drawer opens. Idempotent per dealId. */
  recordView: (dealId: string) => void;
}
