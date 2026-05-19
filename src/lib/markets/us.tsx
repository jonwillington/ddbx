// UsMarket — the US Form 4 plugin for <MarketPage />. Lifts everything
// Form-4-specific out of the page: the multi-leg grouping, the USD format
// bundle, the action-chip + verdict styling, the detail body (footnotes,
// derivative table, co-reporters, raw JSON).
//
// Each new market is a sibling file: src/lib/markets/uk.tsx,
// src/lib/markets/eu.tsx, etc. The shell shouldn't grow per-market branches.

import { useEffect, useMemo, useState } from "react";

import { MiniPriceChart } from "@/components/mini-price-chart";
import { PositionCard, type PriceFormat } from "@/components/position-card";
import { RatingBadge } from "@/components/rating-badge";
import { EvidenceTable } from "@/components/evidence-table";
import { RatingChecklistView } from "@/components/rating-checklist-view";
import { api } from "@/lib/api";
import type {
  MarketConfig,
  MarketDealing,
  MarketStats,
  Tone,
} from "@/lib/markets/types";
import type {
  Analysis,
  UsDealing,
  UsReporter,
  UsTransactionCode,
  UsTriageVerdict,
} from "@/types/ddbx";

const SPY_TICKER = "^GSPC";
const SPY_LABEL = "S&P 500";

/** USD formatter bundle. quoteToValue=1 because USD prices are already in
 *  the major unit; the only conversion we do is /100 on live closes (see
 *  normalizeLivePrice below). */
const USD_FORMAT: PriceFormat = {
  formatPrice: (n) => `$${n.toFixed(2)}`,
  formatValue: (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n),
  quoteToValue: 1,
};

/* ─── Wire-row grouping ──────────────────────────────────────────────── */

/** One logical filing after collapsing tranche-split rows. A Form 4 that
 *  filled at N prices yields N raw UsDealing rows but one purchase event.
 *  Mirrors UsDealingGroup in worker/db/types.ts but built client-side. */
export interface UsRowGroup {
  key: string;
  legs: UsDealing[];
  primary: UsDealing;
  total_shares: number;
  total_value: number | null;
  leg_count: number;
  triage_verdict?: UsTriageVerdict;
  triage_reason?: string;
  analysis?: Analysis | null;
}

function groupRows(rows: UsDealing[]): UsRowGroup[] {
  const map = new Map<string, UsRowGroup>();
  for (const r of rows) {
    const key = `${r.filing_id}|${r.transaction_code}|${r.reporter.cik}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        legs: [],
        primary: r,
        total_shares: 0,
        total_value: null,
        leg_count: 0,
        triage_verdict: r.triage_verdict,
        triage_reason: r.triage_reason,
        analysis: r.analysis ?? null,
      };
      map.set(key, g);
    }
    g.legs.push(r);
    g.leg_count++;
    g.total_shares += r.shares;
    if (r.value != null) g.total_value = (g.total_value ?? 0) + r.value;
  }
  return Array.from(map.values());
}

/* ─── Action / verdict styling ───────────────────────────────────────── */

const CODE_LABELS: Record<UsTransactionCode, string> = {
  P: "Open-market purchase",
  S: "Open-market sale",
  A: "Grant / award",
  M: "Exercise of derivative",
  F: "Payment of exercise/tax via shares",
  G: "Gift",
  C: "Conversion",
  D: "Disposition (tender / 16b-3)",
  J: "Other (footnoted)",
  V: "Voluntary",
  K: "Equity swap",
  X: "Exercise (in/at-the-money)",
  U: "Tender disposition",
  W: "Will / descent",
  Z: "Voting trust",
  L: "Small transaction",
  H: "Expiration",
  I: "Discretionary plan",
  E: "Short-position expiration",
};

const TONE_STYLES: Record<Tone, string> = {
  buy: "bg-emerald-700/15 text-emerald-800 border-emerald-700/35 dark:text-emerald-300 dark:border-emerald-300/30 font-semibold",
  sell: "bg-rose-700/12 text-rose-800 border-rose-700/30 dark:text-rose-300 dark:border-rose-300/30 font-semibold",
  plan: "bg-amber-200/15 text-amber-900/70 border-amber-400/25 dark:text-amber-200/60 dark:border-amber-300/20",
  grant: "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40 dark:text-foreground/55",
  exercise: "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40 dark:text-foreground/55",
  neutral: "bg-transparent text-[#b0a898] border-[#d8d0c6]/60 dark:text-foreground/45",
};

const VERDICT_STYLES: Record<UsTriageVerdict, string> = {
  promising:
    "bg-emerald-700/15 text-emerald-800 border-emerald-700/40 dark:text-emerald-300 dark:border-emerald-300/35 font-semibold",
  maybe:
    "bg-amber-600/10 text-amber-800 border-amber-600/30 dark:text-amber-200 dark:border-amber-300/25",
  skip:
    "bg-transparent text-[#a89e8c] border-[#d8d0c6]/55 dark:text-foreground/40",
};

const VERDICT_LABEL: Record<UsTriageVerdict, string> = {
  promising: "Promising",
  maybe: "Maybe",
  skip: "Skip",
};

function describeAction(row: UsDealing): { label: string; tone: Tone } {
  const planned = row.aff_10b5_one;
  const indirect = row.direct_indirect === "I";
  switch (row.transaction_code) {
    case "P":
      if (planned) return { label: "10b5-1 plan purchase", tone: "plan" };
      return { label: indirect ? "Open-market buy (indirect)" : "Open-market buy", tone: "buy" };
    case "S":
      if (planned) return { label: "10b5-1 plan sale", tone: "plan" };
      return { label: indirect ? "Open-market sale (indirect)" : "Open-market sale", tone: "sell" };
    case "A":
      return { label: row.is_derivative ? "Options / RSU grant" : "Stock grant", tone: "grant" };
    case "M":
      return { label: "Derivative exercise", tone: "exercise" };
    case "C":
      return { label: "Derivative conversion", tone: "exercise" };
    case "F":
      return { label: "Tax withholding via shares", tone: "neutral" };
    case "G":
      return { label: row.acquired_disposed === "A" ? "Gift received" : "Gift made", tone: "neutral" };
    case "D":
      return { label: "Tender / structural", tone: "neutral" };
    case "J":
      return { label: "Other (see footnote)", tone: "neutral" };
    case "X":
      return { label: "In-the-money exercise", tone: "exercise" };
    case "K":
      return { label: "Equity swap", tone: "neutral" };
    default:
      return { label: row.transaction_code, tone: "neutral" };
  }
}

function describeReporter(r: UsReporter): { name: string; role?: string } {
  if (r.officer_title) return { name: r.name, role: r.officer_title };
  if (r.roles.includes("officer")) return { name: r.name, role: "officer" };
  if (r.roles.includes("director")) return { name: r.name, role: "director" };
  if (r.roles.includes("ten_percent_owner")) return { name: r.name, role: "10% holder" };
  return { name: r.name };
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/* ─── Wire → MarketDealing normalization ─────────────────────────────── */

function toMarketDealing(group: UsRowGroup): MarketDealing<UsRowGroup> {
  const row = group.primary;
  const action = describeAction(row);
  const reporter = describeReporter(row.reporter);
  const entryPrice =
    group.total_value != null && group.total_shares > 0
      ? group.total_value / group.total_shares
      : row.price ?? null;
  return {
    key: group.key,
    id: group.key,
    ticker: row.ticker,
    company: row.company,
    insiderName: reporter.name,
    insiderRole: reporter.role,
    disclosedDate: row.disclosed_date,
    tradeDate: row.trade_date,
    isPurchase: action.tone === "buy" || action.tone === "sell",
    value: group.total_value,
    entryPrice,
    shares: group.total_shares,
    legCount: group.leg_count,
    rating: group.analysis?.rating,
    triageVerdict: group.triage_verdict,
    actionLabel: action.label,
    actionTone: action.tone,
    raw: group,
  };
}

/* ─── Slot components ────────────────────────────────────────────────── */

function ActionChip({
  label,
  tone,
  size = "md",
}: {
  label: string;
  tone: Tone;
  size?: "md" | "sm";
}) {
  const sizing = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1.5 text-sm";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border whitespace-nowrap ${sizing} ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}

function VerdictChip({ verdict, size = "md" }: { verdict: UsTriageVerdict; size?: "md" | "sm" }) {
  const sizing = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border whitespace-nowrap uppercase tracking-wide ${sizing} ${VERDICT_STYLES[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function UsRowActionCell({ dealing }: { dealing: MarketDealing<UsRowGroup> }) {
  // Mirror the UK row: the only chip that earns space here is the rating
  // (the user-facing answer to "is this interesting?"). Drop the
  // ActionChip — every row in the curated views is an open-market buy
  // already — and drop the triage VerdictChip — "maybe" / "skip" is
  // pipeline-internal language, not signal. Structural exceptions
  // (amendment, late filing) still surface because they change how a
  // reader should weight the row.
  const group = dealing.raw;
  const row = group.primary;
  const suffix: Array<{ label: string; tone: Tone }> = [];
  if (row.is_amendment) suffix.push({ label: "Amendment", tone: "neutral" });
  if (row.is_late) suffix.push({ label: "Late filing", tone: "neutral" });
  return (
    <>
      {group.analysis && <RatingBadge rating={group.analysis.rating} />}
      {suffix.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {suffix.map((b) => (
            <ActionChip key={b.label} label={b.label} tone={b.tone} size="sm" />
          ))}
        </div>
      )}
    </>
  );
}

function UsAnalysisSection({ analysis }: { analysis: Analysis }) {
  return (
    <div className="mb-4 space-y-6 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-surface p-5">
      <div className="flex items-center gap-3">
        <RatingBadge rating={analysis.rating} />
        <span className="text-xs text-muted">
          {(analysis.confidence * 100).toFixed(0)}% confidence · {analysis.catalyst_window} catalyst
        </span>
      </div>
      {analysis.summary && (
        <p className="text-lg font-semibold leading-snug text-foreground/90">{analysis.summary}</p>
      )}
      {analysis.checklist && <RatingChecklistView checklist={analysis.checklist} />}
      {analysis.thesis_points.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Thesis</h3>
          <div className="space-y-3">
            {analysis.thesis_points.map((p, i) => (
              <p key={i} className="text-sm text-foreground/90 leading-relaxed">{p}</p>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-8">
        <EvidenceTable points={analysis.evidence_for} title="Why this is interesting" tone="for" />
        <EvidenceTable points={analysis.evidence_against} title="Why it might not be" tone="against" />
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

function UsDetailPosition({ dealing }: { dealing: MarketDealing<UsRowGroup> }) {
  const group = dealing.raw;
  const ticker = group.primary.ticker;
  const tradeDate = group.primary.trade_date.slice(0, 10);
  const entryPrice = useMemo<number | undefined>(() => {
    if (group.total_value != null && group.total_shares > 0) {
      return group.total_value / group.total_shares;
    }
    return group.primary.price ?? undefined;
  }, [group]);

  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    api
      .latestPrices([ticker])
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((r) => r.ticker.toUpperCase() === ticker.toUpperCase());
        setCurrentPrice(match?.price_pence ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentPrice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (entryPrice == null) return null;

  return (
    <div className="mb-4 space-y-4">
      {currentPrice != null && group.total_value != null && (
        <PositionCard
          entry={entryPrice}
          current={currentPrice / 100}
          shares={group.total_shares}
          originalValue={group.total_value}
          fmt={USD_FORMAT}
        />
      )}
      <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4 h-72">
        <MiniPriceChart
          tickerForApi={ticker}
          tickerForDisplay={ticker}
          tradeDate={tradeDate}
          entryPrice={entryPrice}
          fmt={USD_FORMAT}
          normalizeClose={(n) => n / 100}
        />
      </div>
    </div>
  );
}

function UsDetailBody({ dealing }: { dealing: MarketDealing<UsRowGroup> }) {
  const group = dealing.raw;
  const row = group.primary;
  return (
    <div className="space-y-3">
      {group.analysis && <UsAnalysisSection analysis={group.analysis} />}
      {group.triage_verdict && (
        <div className="mb-3 flex items-start gap-3 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
          <VerdictChip verdict={group.triage_verdict} />
          <div className="text-sm text-foreground/80 leading-snug">
            {group.triage_reason || <span className="italic text-muted">(no reason recorded)</span>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        <Field label="Code" value={`${row.transaction_code} — ${CODE_LABELS[row.transaction_code] ?? "?"}`} />
        <Field label="Direction" value={row.acquired_disposed === "A" ? "Acquired (A)" : "Disposed (D)"} />
        <Field
          label="Ownership"
          value={
            row.direct_indirect === "D"
              ? "Direct"
              : `Indirect${row.nature_of_ownership ? ` — ${row.nature_of_ownership}` : ""}`
          }
        />
        <Field label="10b5-1 plan" value={row.aff_10b5_one ? "Yes" : "No"} />
        <Field label="Security" value={row.security_title} />
        <Field label="Shares after" value={row.shares_after?.toLocaleString() ?? "—"} />
        <Field label="Price" value={row.price == null ? "—" : row.price === 0 ? "$0" : `$${row.price}`} />
        <Field label="Filing" value={row.filing_id} mono />
        <Field label="Issuer CIK" value={row.issuer_cik} mono />
        <Field label="Reporter CIK" value={row.reporter.cik} mono />
        <Field label="Roles" value={row.reporter.roles.join(", ") || "—"} />
        {row.reporter.officer_title && <Field label="Officer title" value={row.reporter.officer_title} />}
      </div>

      {row.is_derivative && (
        <div className="mt-3 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">Derivative</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
            <Field label="Underlying" value={row.underlying_security_title ?? "—"} />
            <Field label="Underlying shares" value={row.underlying_security_shares?.toLocaleString() ?? "—"} />
            <Field
              label="Strike"
              value={row.conversion_or_exercise_price == null ? "—" : `$${row.conversion_or_exercise_price}`}
            />
            <Field label="Exercise date" value={row.exercise_date ?? "—"} />
            <Field label="Expiration" value={row.expiration_date ?? "—"} />
          </div>
        </div>
      )}

      {row.co_reporters && row.co_reporters.length > 0 && (
        <div className="mt-3 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">
            Co-reporters ({row.co_reporters.length})
          </div>
          <ul className="space-y-1 text-sm">
            {row.co_reporters.map((c) => (
              <li key={c.cik}>
                <span className="font-mono text-xs">{c.cik}</span> {c.name}{" "}
                <span className="text-muted">
                  — {c.roles.join(", ") || "no roles"}
                  {c.officer_title ? ` · ${c.officer_title}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.footnotes && Object.keys(row.footnotes).length > 0 && (
        <div className="mt-3 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">Footnotes</div>
          <dl className="space-y-1 text-sm">
            {Object.entries(row.footnotes).map(([id, text]) => (
              <div key={id}>
                <dt className="inline font-mono font-medium">{id}</dt>
                <dd className="inline text-foreground/70"> — {text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {group.leg_count > 1 && (
        <div className="mt-3 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">
            Fills ({group.leg_count})
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left font-normal pb-1">Shares</th>
                <th className="text-right font-normal pb-1">Price</th>
                <th className="text-right font-normal pb-1">Value</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {group.legs.map((leg) => (
                <tr key={leg.id} className="border-t border-black/[0.04] dark:border-white/[0.06]">
                  <td className="py-1">{leg.shares.toLocaleString()}</td>
                  <td className="py-1 text-right">{leg.price == null ? "—" : `$${leg.price}`}</td>
                  <td className="py-1 text-right">{fmtUsd(leg.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-foreground transition-colors">
          Raw JSON ({group.leg_count} leg{group.leg_count === 1 ? "" : "s"})
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-black/85 dark:bg-black/60 p-3 text-[11px] text-slate-100 leading-snug">
          {JSON.stringify(group.legs, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-muted">{label}:</span>{" "}
      <span className={mono ? "font-mono" : undefined}>{value}</span>
    </div>
  );
}

/* ─── MarketConfig ───────────────────────────────────────────────────── */

export const UsMarket: MarketConfig<UsRowGroup> = {
  id: "us",
  title: "US Form 4 (preview)",
  description: (
    <>
      SEC EDGAR Form 4 ingest — half-hourly cron writes into D1, then a Claude
      Haiku triage pass classifies each filing.{" "}
      <strong className="text-foreground/75">Signal</strong> = the curated
      shortlist (open-market buy + Haiku verdict of <em>maybe</em> or{" "}
      <em>promising</em>).{" "}
      <strong className="text-foreground/75">Interesting</strong> = the
      mechanical filter only — open-market direct buys ≥ $50k, outside any
      10b5-1 plan. <strong className="text-foreground/75">All filings</strong>{" "}
      shows everything for spot-checking the noise.
    </>
  ),
  heroHeading: "Find value in insider deals.",
  heroTaglines: [
    "Every US Form 4 insider filing, automatically screened",
    "Haiku triage scores each disclosure by signal strength",
    "Returns measured against the S&P 500 from trade date",
  ],
  priceFormat: USD_FORMAT,
  // Yahoo USD bars are observed stored as USD-cents in close_pence (e.g.
  // AAPL at $222 stored as 22251). /100 brings them into the major unit
  // that matches Form 4's `price` field.
  normalizeLivePrice: (close_pence) => close_pence / 100,
  benchmarkTicker: SPY_TICKER,
  benchmarkLabel: SPY_LABEL,
  views: [
    { id: "signal", label: "Signal" },
    { id: "interesting", label: "Interesting" },
    { id: "all", label: "All filings" },
  ],
  defaultView: "signal",
  pollIntervalMs: 30_000,
  // Right-hand drawer news strip. Aggregates CNBC / MarketWatch /
  // Yahoo Finance / Seeking Alpha RSS via /api/news/us (worker side
  // refreshes on the US ingest cron + on-read when stale).
  fetchNews: () => api.usNews(),
  newsHeading: "US market news",
  newsFooterNote:
    "Third-party headlines (CNBC, MarketWatch, Yahoo Finance, Seeking Alpha); opens in a new tab.",
  async fetchDealings({ view }) {
    const r = await api.usDealings({ limit: 200, view: view as "signal" | "interesting" | "all" });
    const groups = groupRows(r.dealings);
    const stats: MarketStats = {
      total: r.stats.total,
      viewCounts: {
        signal: r.stats.signal,
        interesting: r.stats.interesting,
        all: r.stats.total,
      },
      latestDisclosedLabel: r.stats.latest_disclosed_date
        ? `Latest disclosure ${r.stats.latest_disclosed_date}`
        : undefined,
      debugBreakdown:
        view === "all" && r.stats.by_code.length > 0
          ? `By code: ${r.stats.by_code.map((c) => `${c.code}=${c.n}`).join(" · ")}`
          : undefined,
    };
    return { dealings: groups.map(toMarketDealing), stats };
  },
  ingest: {
    label: "Fetch latest",
    run: () => api.usIngest(50),
  },
  RowActionCell: UsRowActionCell,
  DetailBody: UsDetailBody,
  DetailPosition: UsDetailPosition,
  renderEmptyState: ({ view, stats, setView }) => {
    const total = stats?.total ?? 0;
    const interesting = stats?.viewCounts.interesting ?? 0;
    if (view === "signal") {
      return (
        <>
          No signal-grade trades yet — Haiku triage hasn&apos;t surfaced anything{" "}
          <em>maybe</em> or <em>promising</em>.{" "}
          <button
            onClick={() => setView("interesting")}
            className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
          >
            Show interesting ({interesting})
          </button>
        </>
      );
    }
    if (view === "interesting") {
      return (
        <>
          No open-market insider buys in the latest scan.{" "}
          <button
            onClick={() => setView("all")}
            className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
          >
            Show all {total} filings
          </button>
        </>
      );
    }
    return (
      <>
        No US dealings stored yet. Click{" "}
        <span className="font-medium text-foreground/70">Fetch latest</span> to run the first ingest,
        or wait for the next half-hourly cron.
      </>
    );
  },
};
