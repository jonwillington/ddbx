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

/** A complete market plugin. Everything per-market hangs off here. */
export interface MarketConfig<W = unknown> {
  /** Stable identifier (`uk` | `us` | `eu` | …). Used in keys and URLs. */
  id: string;

  /** Page title — e.g. "US Form 4 (preview)". */
  title: string;
  /** Explainer paragraph under the title. Markdown-y JSX is fine. */
  description: ReactNode;
  /** Marketing taglines for the lg+ left-side hero column. */
  heroTaglines: string[];
  /** Headline above the taglines. */
  heroHeading: string;

  /** Currency formatter bundle — used everywhere money is rendered. */
  priceFormat: PriceFormat;

  /** Live-price normalization. Backend stores ticker closes in a column
   *  called `close_pence` regardless of market; for UK that's already in
   *  pence (matching dealing.price_pence); for US Yahoo's USD-cents path is
   *  observed live. Adapters supply the function that converts a raw close
   *  to the same major unit as MarketDealing.entryPrice — so the shell can
   *  compute stock return without knowing market specifics. */
  normalizeLivePrice: (close_pence: number) => number;

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
}
