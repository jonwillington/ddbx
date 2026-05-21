// UkMarket — the UK RNS director-dealings plugin for <MarketPage />.
// Mounted at `/` (and the static pages) via UkPreviewPage; the legacy
// dashboard.tsx retired in Phase 2. UK-specific behaviour (Opus analysis
// rendering, FTSE benchmark, discretion gating, metric-mode toggle,
// skipped-cluster collapsing, LSE-status empty state) all hang off this
// MarketConfig — the shell in `components/market/` is market-agnostic.

import type {
  GatingInfo,
  MarketConfig,
  MarketDealing,
  MarketStats,
  Tone,
} from "@/lib/markets/types";
import type { Dealing, Rating, TriageVerdict } from "@/types/ddbx";

import { useEffect, useState } from "react";
import { InformationCircleIcon as InformationCircleOutlineIcon } from "@heroicons/react/24/outline";

import { BlurredAnalysisOverlay } from "@/components/discretion/blurred-analysis-overlay";
import { DUMMY_ANALYSIS } from "@/components/discretion/dummy-analysis";
import { EvidenceTable } from "@/components/evidence-table";
import { MiniPriceChart } from "@/components/mini-price-chart";
import { PositionCard, type PriceFormat } from "@/components/position-card";
import { RatingBadge } from "@/components/rating-badge";
import { RatingChecklistView } from "@/components/rating-checklist-view";
import { api } from "@/lib/api";
import { UK_BANK_HOLIDAYS_SOURCE } from "@/lib/bank-holidays";
import { isSuggestedDealing } from "@/lib/dealing-classify";
import { useDiscretion } from "@/lib/discretion";
import { LSE } from "@/lib/market-status";

const FTSE_TICKER = "^FTAS";
const FTSE_LABEL = "FTSE";

/** GBP formatter bundle. RNS price_pence is already in pence and matches
 *  what /api/prices stores for LSE tickers, so quoteToValue = 0.01 and
 *  normalizeLivePrice is identity. */
const GBP_FORMAT: PriceFormat = {
  formatPrice: (n) => `${n.toFixed(0)}p`,
  formatValue: (n) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(n),
  quoteToValue: 0.01,
};

function fmtGbp(n: number | null | undefined): string {
  if (n == null) return "—";

  return GBP_FORMAT.formatValue(n);
}

/* ─── Wire → MarketDealing normalization ─────────────────────────────── */

function describeAction(d: Dealing): { label: string; tone: Tone } {
  // The UK pipeline runs a triage pass too, but the page-level signal is
  // tx_type + is_open_market_buy. We surface the underlying verb here so
  // the Today drawer and detail header read naturally.
  if (d.tx_type === "buy") {
    if (d.is_open_market_buy === false) {
      return { label: "Director award / scheme", tone: "grant" };
    }

    return { label: "Director purchase", tone: "buy" };
  }

  return { label: "Director sale", tone: "sell" };
}

export function toMarketDealing(d: Dealing): MarketDealing<Dealing> {
  const action = describeAction(d);

  return {
    key: d.id,
    id: d.id,
    ticker: d.ticker,
    company: d.company,
    insiderName: d.director.name,
    insiderRole: d.director.role,
    disclosedDate: d.disclosed_date || d.trade_date,
    tradeDate: d.trade_date,
    // The dashboard's mute rule is "didn't pass the analyst filter" — i.e.
    // isSuggestedDealing. Match it so muted rows look the same as today.
    isPurchase: isSuggestedDealing(d),
    value: d.value_gbp,
    entryPrice: d.price_pence,
    shares: d.shares,
    legCount: 1,
    rating: d.analysis?.rating,
    triageVerdict: d.triage?.verdict,
    actionLabel: action.label,
    actionTone: action.tone,
    raw: d,
  };
}

/* ─── Slot: RowActionCell (rating-only, mirrors UK row pattern) ──────── */

function UkRowActionCell({ dealing }: { dealing: MarketDealing<Dealing> }) {
  // Mirror UK's existing chip discipline: rating badge when an analysis is
  // attached, nothing otherwise. The market-row's muted state (driven by
  // isPurchase + rating) communicates "skipped / unanalysed" visually.
  if (!dealing.rating) return null;

  return <RatingBadge rating={dealing.rating} />;
}

/* ─── Slot: DetailPosition (entry / now / alpha + price chart) ──────── */

function UkDetailPosition({ dealing }: { dealing: MarketDealing<Dealing> }) {
  const d = dealing.raw;
  const ticker = d.ticker;
  const entryPrice = d.price_pence;
  const tradeDate = d.trade_date.slice(0, 10);

  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [ftseEntry, setFtseEntry] = useState<number | null>(null);
  const [ftseCurrent, setFtseCurrent] = useState<number | null>(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;

    api
      .latestPrices([ticker, FTSE_TICKER])
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find(
          (r) => r.ticker.toUpperCase() === ticker.toUpperCase(),
        );
        const ftse = rows.find((r) => r.ticker === FTSE_TICKER);

        setCurrentPrice(match?.price_pence ?? null);
        setFtseCurrent(ftse?.price_pence ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentPrice(null);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  useEffect(() => {
    let cancelled = false;

    // 90-day history is enough to find the trade-day close; the chart
    // component fetches its own 365-day window separately.
    api
      .priceHistory(FTSE_TICKER, 365)
      .then((bars) => {
        if (cancelled) return;
        const match = bars.find((b) => b.date === tradeDate);

        setFtseEntry(match?.close_pence ?? null);
      })
      .catch(() => {
        if (!cancelled) setFtseEntry(null);
      });

    return () => {
      cancelled = true;
    };
  }, [tradeDate]);

  return (
    <div className="mb-4 space-y-4">
      {currentPrice != null && d.value_gbp != null && (
        <PositionCard
          benchmark={{
            entry: ftseEntry,
            current: ftseCurrent,
            label: FTSE_LABEL,
          }}
          current={currentPrice}
          entry={entryPrice}
          fmt={GBP_FORMAT}
          originalValue={d.value_gbp}
          shares={d.shares}
        />
      )}
      <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4 h-72">
        <MiniPriceChart
          entryPrice={entryPrice}
          fmt={GBP_FORMAT}
          tickerForApi={ticker}
          tickerForDisplay={ticker.replace(/\.L$/, "")}
          tradeDate={tradeDate}
        />
      </div>
    </div>
  );
}

/* ─── Slot: DetailBody (analysis or triage-only notice) ─────────────── */

const VERDICT_LABEL: Record<TriageVerdict, string> = {
  skip: "Skipped",
  maybe: "Maybe",
  promising: "Promising",
};

function UkTriageOnlyNotice({ triage }: { triage: Dealing["triage"] }) {
  // Mirrors DealingDetailPanel's TriageOnlyAnalysisNotice — small inline
  // version so we don't have to break apart that component yet. When the
  // dashboard.tsx fully retires we can move the canonical version here.
  const verdictLabel = triage?.verdict
    ? VERDICT_LABEL[triage.verdict]
    : "Screened";

  return (
    <div
      className="flex gap-3 rounded-lg border border-amber-200/90 bg-amber-50/95 px-3.5 py-3.5 text-left shadow-sm dark:border-amber-900/55 dark:bg-amber-950/35"
      role="note"
    >
      <InformationCircleOutlineIcon
        aria-hidden
        className="w-5 h-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          No further analysis on this purchase
          <span className="font-normal font-mono text-xs text-amber-900/70 dark:text-amber-300/80 ml-2">
            ({verdictLabel})
          </span>
        </p>
        {triage?.reason ? (
          <p className="text-sm text-amber-950/95 dark:text-amber-100/90 mt-2 leading-relaxed">
            {triage.reason}
          </p>
        ) : (
          <p className="text-xs text-muted mt-2 italic">
            No triage explanation was stored for this purchase.
          </p>
        )}
      </div>
    </div>
  );
}

function UkDetailBody({ dealing }: { dealing: MarketDealing<Dealing> }) {
  const d = dealing.raw;
  const analysis = d.analysis;

  if (!analysis) {
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
          <Field label="Insider" value={d.director.name} />
          <Field label="Role" value={d.director.role ?? "—"} />
          <Field label="Amount" value={fmtGbp(d.value_gbp)} />
          <Field label="Shares" value={d.shares.toLocaleString()} />
        </dl>
        <UkTriageOnlyNotice triage={d.triage} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
        <Field label="Insider" value={d.director.name} />
        <Field label="Role" value={d.director.role ?? "—"} />
        <Field label="Amount" value={fmtGbp(d.value_gbp)} />
        <Field label="Shares" value={d.shares.toLocaleString()} />
      </dl>

      <div className="flex items-center gap-3">
        <RatingBadge rating={analysis.rating} />
        <span className="text-xs text-muted">
          {(analysis.confidence * 100).toFixed(0)}% confidence ·{" "}
          {analysis.catalyst_window} catalyst
        </span>
      </div>

      {analysis.summary && (
        <p className="text-xl font-semibold leading-snug text-foreground/90">
          {analysis.summary}
        </p>
      )}

      {analysis.checklist && (
        <RatingChecklistView checklist={analysis.checklist} />
      )}

      {analysis.thesis_points.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Thesis</h3>
          <div className="space-y-3">
            {analysis.thesis_points.map((p, i) => (
              <p key={i} className="text-sm text-foreground/90 leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-8">
        <EvidenceTable
          points={analysis.evidence_for}
          title="Why this is interesting"
          tone="for"
        />
        <EvidenceTable
          points={analysis.evidence_against}
          title="Why it might not be"
          tone="against"
        />
      </div>

      {analysis.key_risks.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-1">Key risks</h4>
          <ul className="text-sm list-disc pl-5 text-foreground/90 space-y-1">
            {analysis.key_risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.rating_rationale && (
        <p className="text-xs italic text-muted leading-relaxed border-t border-black/[0.06] dark:border-white/[0.08] pt-3">
          {analysis.rating_rationale}
        </p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
        {label}
      </dt>
      <dd className="text-sm font-medium truncate">{value}</dd>
    </div>
  );
}

/* ─── Slot: DummyDetailBody (gated drawer body) ──────────────────────── */

// Renders UkDetailBody but with the analysis replaced by a static stand-in.
// Behind the blur + overlay this just needs to look like real analysis at a
// glance — UkDetailBody handles the actual rendering.
function UkDummyDetailBody({ dealing }: { dealing: MarketDealing<Dealing> }) {
  const dummyDealing: MarketDealing<Dealing> = {
    ...dealing,
    raw: { ...dealing.raw, analysis: DUMMY_ANALYSIS },
  };

  return <UkDetailBody dealing={dummyDealing} />;
}

/* ─── Gating hook adapter ────────────────────────────────────────────── */

function useUkGating(): GatingInfo {
  const d = useDiscretion();

  return {
    enabled: d.enabled,
    hasFullAccess: d.hasFullAccess,
    recordView: d.recordView,
  };
}

/* ─── MarketConfig ───────────────────────────────────────────────────── */

// Rating-keyed hero pills. Live UK dashboard has this as a four-way
// filter that narrows the "Average return vs FTSE" stat to one rating
// tier — pipeline stages aren't a concept here (Opus screens every
// disclosure), so view tabs collapse to a single "All" view and the
// rating axis lives on heroFilters.
function ratingPredicate(target: Rating | "any" | "routine") {
  return (d: { rating?: Rating }) => {
    if (target === "any") return true;
    if (target === "routine") return !d.rating || d.rating === "routine";

    return d.rating === target;
  };
}

export const UkMarket: MarketConfig<Dealing> = {
  id: "uk",
  title: "UK director dealings (preview)",
  documentTitle: "ddbx · Director Dealings — UK Insider Transactions",
  session: LSE,
  holidays: UK_BANK_HOLIDAYS_SOURCE,
  description: (
    <>
      LSE RNS-filed director purchases, screened by Opus into{" "}
      <strong className="text-foreground/75">Significant</strong>{" "}
      (high-conviction signals) and{" "}
      <strong className="text-foreground/75">Noteworthy</strong> (worth a look).{" "}
      <strong className="text-foreground/75">All</strong> shows every disclosed
      buy for spot-checking the noise floor.
    </>
  ),
  marketLabel: "UK",
  priceFormat: GBP_FORMAT,
  // For LSE tickers /api/prices already stores pence (close_pence is literal
  // pence), and Dealing.price_pence is pence too, so the major unit on
  // MarketDealing.entryPrice is just pence — no conversion needed.
  normalizeLivePrice: (close_pence) => close_pence,
  benchmarkTicker: FTSE_TICKER,
  benchmarkLabel: FTSE_LABEL,
  // Single view — UK doesn't have pipeline stages the way US does, so the
  // tab strip is hidden (MarketPage shows it only when len > 1).
  views: [{ id: "all", label: "All" }],
  defaultView: "all",
  heroFilters: [
    {
      id: "significant",
      label: "Significant",
      predicate: ratingPredicate("significant"),
    },
    {
      id: "noteworthy",
      label: "Noteworthy",
      predicate: ratingPredicate("noteworthy"),
    },
    {
      id: "routine",
      label: "Routine / unrated",
      predicate: ratingPredicate("routine"),
    },
    { id: "any", label: "All", predicate: ratingPredicate("any") },
  ],
  defaultHeroFilter: "significant",
  pollIntervalMs: 30_000,
  fetchNews: () => api.ukNews(),
  newsHeading: "UK market news",
  newsFooterNote:
    "Third-party headlines (FT, Reuters, BBC Business, Guardian Business); opens in a new tab.",
  async fetchDealings() {
    // api.dealings() unwraps to a flat Dealing[] (see lib/api.ts). UK loads
    // the whole list and lets the hero filter narrow client-side — matches
    // the live dashboard behaviour and keeps API surface unchanged.
    const all = await api.dealings();
    const stats: MarketStats = {
      total: all.length,
      viewCounts: { all: all.length },
      latestDisclosedLabel: (() => {
        if (all.length === 0) return undefined;
        const latest = all.reduce<string | null>((acc, d) => {
          const iso = d.disclosed_date || d.trade_date;

          if (!acc) return iso;

          return iso > acc ? iso : acc;
        }, null);

        return latest ? `Latest disclosure ${latest.slice(0, 10)}` : undefined;
      })(),
    };

    return { dealings: all.map(toMarketDealing), stats };
  },
  RowActionCell: UkRowActionCell,
  DetailBody: UkDetailBody,
  DetailPosition: UkDetailPosition,
  // Rows that didn't earn an Opus rating (or were rated routine-only) collapse
  // into a per-day cluster the user can expand. Mirrors the live dashboard's
  // "X analysed · Y skipped" split.
  isSkipped: (d) => !isSuggestedDealing(d.raw),
  // Discretion gating: first drawer of the UK day is free; subsequent drawers
  // render the dummy body under a blur with a "use the app" overlay.
  useGating: useUkGating,
  DummyDetailBody: UkDummyDetailBody,
  AnalysisOverlay: BlurredAnalysisOverlay,
  renderEmptyState: () => <>No UK disclosures stored yet.</>,
};
