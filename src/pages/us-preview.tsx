// Internal viewer for the US Form 4 ingest pipeline (multi-market spike).
// Reads persisted rows from GET /api/us-dealings (populated by the half-hourly
// cron in ddbx-data) and renders them in the dashboard's row visual language
// so we can eyeball signal quality alongside what the UK list looks like.
//
// Defaults to view=interesting — the rough open-market-buy-by-real-insider
// slice — because Form 4 is structurally noisy: most rows are routine grants,
// option exercises, or 10b5-1 plan trades. The toggle exposes everything for
// spot-checking the parser.
//
// Not linked from any nav. The companion /us route maps to this same page —
// see src/App.tsx. Background:
// ~/ddbx-ios-app/investigations/multi-market/us-preview-handoff.md
// ~/ddbx-ios-app/investigations/multi-market/form4-mapping.md
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DefaultLayout from "@/layouts/default";
import { CompanyLogo } from "@/components/company-logo";
import { RatingBadge } from "@/components/rating-badge";
import { EvidenceTable } from "@/components/evidence-table";
import { RatingChecklistView } from "@/components/rating-checklist-view";
import { PositionCard, type PriceFormat } from "@/components/position-card";
import { MiniPriceChart } from "@/components/mini-price-chart";
import { api, type IngestResult, type UsDealing, type UsDealingsStats } from "@/lib/api";
import type { Analysis, UsReporter, UsTransactionCode, UsTriageVerdict } from "@/types/ddbx";

// USD quote unit is also the domestic currency, so quoteToValue is 1. /api/prices
// caches the numeric close in close_pence regardless of source — for US tickers
// the number is dollars-major; the column name is just misleading.
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

type Tone = "buy" | "sell" | "plan" | "grant" | "exercise" | "neutral";
type View = "signal" | "interesting" | "all";

// One logical filing after collapsing tranche-split rows. A Form 4 that filled
// at N prices yields N raw UsDealing rows but one purchase event; this is the
// card-rendering unit. Mirrors UsDealingGroup in worker/db/types.ts but built
// client-side from the unrolled rows so we don't need a second endpoint.
interface RowGroup {
  key: string;                  // filing_id|transaction_code|reporter_cik
  legs: UsDealing[];
  primary: UsDealing;           // first leg, used for date/reporter/ticker/code
  total_shares: number;
  total_value: number | null;   // null if every leg was footnote-priced
  leg_count: number;
  triage_verdict?: UsTriageVerdict;
  triage_reason?: string;
  // Deep analysis result for the group, when one exists. Same Analysis shape
  // UK dealings carry — lets us reuse RatingBadge / EvidenceTable /
  // RatingChecklistView verbatim instead of fork-rendering by market.
  analysis?: Analysis | null;
}

function groupRows(rows: UsDealing[]): RowGroup[] {
  const map = new Map<string, RowGroup>();
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
    if (r.value != null) {
      g.total_value = (g.total_value ?? 0) + r.value;
    }
  }
  // Preserve API order (disclosed_date DESC).
  return Array.from(map.values());
}

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

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

// Plain-English action description. The combination of code + acquired/disposed
// + 10b5-1 + direct/indirect determines both the human label and the visual
// tone — buys in green, sells in rose, everything else demoted so the rare
// signal doesn't drown in routine noise.
function describeAction(row: UsDealing): { label: string; tone: Tone } {
  const planned = row.aff_10b5_one;
  const indirect = row.direct_indirect === "I";
  switch (row.transaction_code) {
    case "P":
      if (planned) return { label: "10b5-1 plan purchase", tone: "plan" };
      return {
        label: indirect ? "Open-market buy (indirect)" : "Open-market buy",
        tone: "buy",
      };
    case "S":
      if (planned) return { label: "10b5-1 plan sale", tone: "plan" };
      return {
        label: indirect ? "Open-market sale (indirect)" : "Open-market sale",
        tone: "sell",
      };
    case "A":
      return {
        label: row.is_derivative ? "Options / RSU grant" : "Stock grant",
        tone: "grant",
      };
    case "M":
      return { label: "Derivative exercise", tone: "exercise" };
    case "C":
      return { label: "Derivative conversion", tone: "exercise" };
    case "F":
      return { label: "Tax withholding via shares", tone: "neutral" };
    case "G":
      return {
        label: row.acquired_disposed === "A" ? "Gift received" : "Gift made",
        tone: "neutral",
      };
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

// "Tim Cook (CEO)" / "John Smith (director)" / "Acme Capital LLC (10% holder)".
// Reads officer_title first because it's the most informative; falls back to
// the roles array in priority order (officer > director > 10% holder).
function describeReporter(r: UsReporter): string {
  if (r.officer_title) return `${r.name} (${r.officer_title})`;
  if (r.roles.includes("officer")) return `${r.name} (officer)`;
  if (r.roles.includes("director")) return `${r.name} (director)`;
  if (r.roles.includes("ten_percent_owner")) return `${r.name} (10% holder)`;
  return r.name;
}

const TONE_STYLES: Record<Tone, string> = {
  buy: "bg-emerald-700/15 text-emerald-800 border-emerald-700/35 dark:text-emerald-300 dark:border-emerald-300/30 font-semibold",
  sell: "bg-rose-700/12 text-rose-800 border-rose-700/30 dark:text-rose-300 dark:border-rose-300/30 font-semibold",
  plan: "bg-amber-200/15 text-amber-900/70 border-amber-400/25 dark:text-amber-200/60 dark:border-amber-300/20",
  grant: "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40 dark:text-foreground/55",
  exercise: "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40 dark:text-foreground/55",
  neutral: "bg-transparent text-[#b0a898] border-[#d8d0c6]/60 dark:text-foreground/45",
};

// Triage badge styling — `promising` should pop, `maybe` should sit one notch
// quieter, `skip` should fade. Kept distinct from the action-tone palette so
// the eye can read action and verdict independently.
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

function ActionChip({
  label,
  tone,
  size = "md",
}: {
  label: string;
  tone: Tone;
  size?: "md" | "sm";
}) {
  const sizing =
    size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1.5 text-sm";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border whitespace-nowrap ${sizing} ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}

function UsRowHeader() {
  return (
    <div className="hidden md:flex items-center text-xs text-muted font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05]">
      <div className="w-32 shrink-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
        Disclosed
      </div>
      <div className="w-[4.5rem] shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
        Ticker
      </div>
      <div className="flex-1 min-w-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
        Company / Insider
      </div>
      <div className="w-36 shrink-0 px-4 py-2.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]">
        Value (USD)
      </div>
      <div className="w-56 shrink-0 px-4 py-2.5 text-center">What happened</div>
    </div>
  );
}

function UsDealingRow({
  group,
  selected,
  onSelect,
}: {
  group: RowGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  const row = group.primary;
  const action = describeAction(row);
  const reporterLine = describeReporter(row.reporter);
  // Mute everything that isn't a real buy/sell so the eye lands on the
  // signal-bearing rows in "All filings" view.
  const muted = action.tone !== "buy" && action.tone !== "sell";
  const ticker = row.ticker || "—";
  const company = row.company || "—";
  const tradeDiffers = row.trade_date !== row.disclosed_date;

  // Suffix the action with structural badges that don't fold into the verb
  // itself (amendment, late-filing, tranche split, triage verdict).
  const suffixBadges: Array<{ label: string; tone: Tone }> = [];
  if (row.is_amendment) suffixBadges.push({ label: "Amendment", tone: "neutral" });
  if (row.is_late) suffixBadges.push({ label: "Late filing", tone: "neutral" });

  return (
    <button
      className={`w-full text-left transition-colors
        ${muted ? "opacity-65" : ""}
        ${selected ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}
      onClick={onSelect}
    >
        {/* ── Mobile (<md) ── */}
        <div className="md:hidden px-4 py-3.5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-xs text-foreground/50 font-medium">
              {shortDate(row.disclosed_date)}
              {tradeDiffers && (
                <span className="text-[10px] text-muted/70 ml-2">
                  · trade {shortDate(row.trade_date)}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {group.analysis ? (
                <RatingBadge rating={group.analysis.rating} />
              ) : (
                group.triage_verdict && <VerdictChip verdict={group.triage_verdict} size="sm" />
              )}
              <ActionChip label={action.label} tone={action.tone} size="sm" />
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CompanyLogo ticker={ticker} size={36} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary shrink-0">
                  {ticker}
                </span>
                <span className="text-sm font-medium truncate">{company}</span>
              </div>
              <div className="text-xs text-muted truncate mt-1">
                {reporterLine}
              </div>
            </div>
            <div className="shrink-0 text-base font-medium tabular-nums leading-tight text-right">
              {fmtUsd(group.total_value)}
              {group.leg_count > 1 && (
                <div className="text-[10px] text-muted/80 mt-0.5">
                  {group.leg_count} fills
                </div>
              )}
            </div>
          </div>
          {group.triage_reason && (
            <div className="mt-2 text-xs text-foreground/65 leading-snug">
              {group.triage_reason}
            </div>
          )}
          {suffixBadges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {suffixBadges.map((b) => (
                <ActionChip key={b.label} label={b.label} tone={b.tone} size="sm" />
              ))}
            </div>
          )}
        </div>

        {/* ── Desktop (md+) ── */}
        <div className="hidden md:flex items-stretch">
          <div className="w-32 shrink-0 px-4 py-4 flex flex-col justify-center border-r border-black/[0.06] dark:border-white/[0.06] min-h-[4rem]">
            <div className="text-sm text-foreground/90 font-medium leading-tight">
              {shortDate(row.disclosed_date)}
            </div>
            {tradeDiffers && (
              <div className="text-[10px] text-muted/75 mt-1">
                trade {shortDate(row.trade_date)}
              </div>
            )}
          </div>
          <div className="w-[4.5rem] shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <span className="font-mono text-sm font-semibold px-2 py-0.5 rounded bg-[#e8e0d5] dark:bg-surface-secondary">
              {ticker}
            </span>
          </div>
          <div className="flex-1 min-w-0 px-4 py-4 flex items-center gap-3 border-r border-black/[0.06] dark:border-white/[0.06]">
            <CompanyLogo ticker={ticker} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-base font-medium truncate leading-snug">{company}</div>
              <div className="text-sm text-muted truncate mt-0.5">{reporterLine}</div>
              {group.triage_reason && (
                <div className="text-xs text-foreground/65 mt-1.5 line-clamp-2 leading-snug">
                  {group.triage_reason}
                </div>
              )}
            </div>
          </div>
          <div className="w-36 shrink-0 px-4 py-4 flex flex-col items-end justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <div className="text-xl font-medium tabular-nums">{fmtUsd(group.total_value)}</div>
            <div className="text-xs text-muted tabular-nums mt-0.5">
              {group.total_shares.toLocaleString()} sh
              {group.leg_count > 1 && (
                <span className="ml-1 opacity-75">· {group.leg_count} fills</span>
              )}
            </div>
          </div>
          <div className="w-56 shrink-0 px-3 py-4 flex flex-col items-center justify-center gap-1">
            <ActionChip label={action.label} tone={action.tone} />
            {group.analysis ? (
              <RatingBadge rating={group.analysis.rating} />
            ) : (
              group.triage_verdict && (
                <VerdictChip verdict={group.triage_verdict} size="sm" />
              )
            )}
            {suffixBadges.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center">
                {suffixBadges.map((b) => (
                  <ActionChip key={b.label} label={b.label} tone={b.tone} size="sm" />
                ))}
              </div>
            )}
          </div>
        </div>
    </button>
  );
}

function VerdictChip({
  verdict,
  size = "md",
}: {
  verdict: UsTriageVerdict;
  size?: "md" | "sm";
}) {
  const sizing =
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border whitespace-nowrap uppercase tracking-wide ${sizing} ${VERDICT_STYLES[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function UsAnalysisSection({ analysis }: { analysis: Analysis }) {
  // Same composition as DealingDetailPanel's analysis block, minus the
  // GBP/pence-flavoured position card and price chart (US uses USD; equivalents
  // for the US side land later). Components are shape-agnostic and reused.
  return (
    <div className="mb-4 space-y-6 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-surface p-5">
      <div className="flex items-center gap-3">
        <RatingBadge rating={analysis.rating} />
        <span className="text-xs text-muted">
          {(analysis.confidence * 100).toFixed(0)}% confidence · {analysis.catalyst_window} catalyst
        </span>
      </div>

      {analysis.summary && (
        <p className="text-lg font-semibold leading-snug text-foreground/90">
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

function UsPositionSection({ group }: { group: RowGroup }) {
  const ticker = group.primary.ticker;
  const tradeDate = group.primary.trade_date.slice(0, 10);
  // Volume-weighted average across legs when the buy was filled at multiple
  // prices; falls back to the primary leg's price when total_value is null
  // (footnoted prices). undefined when we genuinely don't know.
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
    api.latestPrices([ticker])
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((r) => r.ticker.toUpperCase() === ticker.toUpperCase());
        setCurrentPrice(match?.price_pence ?? null);
      })
      .catch(() => { if (!cancelled) setCurrentPrice(null); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (entryPrice == null) return null;

  return (
    <div className="mb-4 space-y-4">
      {currentPrice != null && group.total_value != null && (
        <PositionCard
          entry={entryPrice}
          current={currentPrice}
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
        />
      </div>
    </div>
  );
}

function UsGroupDetail({ group }: { group: RowGroup }) {
  const row = group.primary;
  return (
    <div className="space-y-3">
      <UsPositionSection group={group} />
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
        <Field
          label="Code"
          value={`${row.transaction_code} — ${CODE_LABELS[row.transaction_code] ?? "?"}`}
        />
        <Field
          label="Direction"
          value={
            row.acquired_disposed === "A"
              ? "Acquired (A)"
              : "Disposed (D)"
          }
        />
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
        <Field
          label="Shares after"
          value={row.shares_after?.toLocaleString() ?? "—"}
        />
        <Field
          label="Price"
          value={
            row.price == null ? "—" : row.price === 0 ? "$0" : `$${row.price}`
          }
        />
        <Field label="Filing" value={row.filing_id} mono />
        <Field label="Issuer CIK" value={row.issuer_cik} mono />
        <Field label="Reporter CIK" value={row.reporter.cik} mono />
        <Field label="Roles" value={row.reporter.roles.join(", ") || "—"} />
        {row.reporter.officer_title && (
          <Field label="Officer title" value={row.reporter.officer_title} />
        )}
      </div>

      {row.is_derivative && (
        <div className="mt-3 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">
            Derivative
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
            <Field
              label="Underlying"
              value={row.underlying_security_title ?? "—"}
            />
            <Field
              label="Underlying shares"
              value={row.underlying_security_shares?.toLocaleString() ?? "—"}
            />
            <Field
              label="Strike"
              value={
                row.conversion_or_exercise_price == null
                  ? "—"
                  : `$${row.conversion_or_exercise_price}`
              }
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
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">
            Footnotes
          </div>
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
                  <td className="py-1 text-right">
                    {leg.price == null ? "—" : `$${leg.price}`}
                  </td>
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

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-muted">{label}:</span>{" "}
      <span className={mono ? "font-mono" : undefined}>{value}</span>
    </div>
  );
}

// Right-hand drawer mirroring the UK DealingDetailPanel. Same backdrop +
// translate-from-right + body-scroll-lock + escape-to-close pattern; the body
// just renders the US-specific UsGroupDetail. Page-level `selectedKey` state
// keeps it lookup-by-key so a list refresh that drops a row also closes the
// drawer for free (group resolves to null).
function UsDetailDrawer({
  group,
  onClose,
}: {
  group: RowGroup | null;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const open = !!group;

  useEffect(() => {
    if (!group) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 56);
  }, []);

  useEffect(() => {
    setScrolled(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [group?.key]);

  const row = group?.primary;
  const action = row ? describeAction(row) : null;
  const reporterLine = row ? describeReporter(row.reporter) : "";
  const ticker = row?.ticker || "—";
  const company = row?.company || "—";

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-background border-l border-black/10 dark:border-white/10 z-50
          shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-200
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {group && row && (
          <>
            <div
              className={`shrink-0 flex items-center gap-3 px-5 md:px-8 py-4 border-b transition-all duration-200
                ${scrolled
                  ? "border-black/10 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                  : "border-transparent"
                }`}
            >
              <CompanyLogo ticker={ticker} size={32} />
              <span className="font-mono text-xs bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                {ticker}
              </span>
              {group.analysis && (
                <RatingBadge rating={group.analysis.rating} className="shrink-0" />
              )}
              <span
                className={`font-semibold text-sm truncate flex-1 min-w-0 transition-opacity duration-200
                  ${scrolled ? "opacity-100" : "opacity-0"}`}
              >
                {company}
              </span>
              <button
                aria-label="Close"
                className="shrink-0 text-muted hover:text-foreground text-2xl leading-none px-1"
                onClick={onClose}
              >
                ×
              </button>
            </div>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto"
            >
              <div className="p-5 md:p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <CompanyLogo ticker={ticker} size={56} />
                  <h1 className="text-3xl font-bold leading-tight tracking-tight flex-1 min-w-0">
                    {company}
                  </h1>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Insider</dt>
                    <dd className="text-sm font-medium truncate">{reporterLine}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Action</dt>
                    <dd className="text-sm font-medium">{action?.label ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Amount</dt>
                    <dd className="text-sm font-medium">{fmtUsd(group.total_value)}</dd>
                  </div>
                </dl>

                <UsGroupDetail group={group} />
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

export default function UsPreviewPage() {
  const [view, setView] = useState<View>("signal");
  const [rows, setRows] = useState<UsDealing[]>([]);
  const [stats, setStats] = useState<UsDealingsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastIngest, setLastIngest] = useState<IngestResult | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.usDealings({ limit: 200, view });
      setRows(r.dealings);
      setStats(r.stats);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function ingest() {
    setIngesting(true);
    setErr(null);
    try {
      const r = await api.usIngest(50);
      setLastIngest(r);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setIngesting(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const interestingCount = stats?.interesting ?? 0;
  const signalCount = stats?.signal ?? 0;
  const totalCount = stats?.total ?? 0;
  const noiseCount = totalCount - interestingCount;

  // Collapse tranche-split rows into one card per (filing_id, code, reporter).
  // Stable: groupRows preserves API order, which is disclosed_date DESC.
  const groups = useMemo(() => groupRows(rows), [rows]);

  // Look up the selected group by key on each render — when the list refetches
  // and the selected row drops out (filter change, etc), the drawer closes
  // automatically because the lookup yields null.
  const selectedGroup = useMemo(
    () => (selectedKey ? groups.find((g) => g.key === selectedKey) ?? null : null),
    [groups, selectedKey],
  );

  // Footer breakdown — surfaces what's hiding behind the "Interesting" filter
  // so the user sees how much noise the curation is suppressing.
  const codeBreakdown = useMemo(() => {
    if (!stats) return "";
    return stats.by_code
      .map((c) => `${c.code}=${c.n}`)
      .join(" · ");
  }, [stats]);

  return (
    <DefaultLayout>
      <div className="mb-5">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          US Form 4 (preview)
        </h1>
        <p className="mt-2 text-sm text-foreground/55 max-w-2xl">
          SEC EDGAR Form 4 ingest — half-hourly cron writes into D1, then a
          Claude Haiku triage pass classifies each filing.{" "}
          <strong className="text-foreground/75">Signal</strong> = the curated
          shortlist (open-market buy + Haiku verdict of <em>maybe</em> or{" "}
          <em>promising</em>).{" "}
          <strong className="text-foreground/75">Interesting</strong> = the
          mechanical filter only — open-market direct buys ≥ $50k, outside any
          10b5-1 plan. <strong className="text-foreground/75">All filings</strong>{" "}
          shows everything for spot-checking the noise.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div
          role="tablist"
          className="inline-flex rounded-full border border-separator bg-surface/40 p-1"
        >
          <button
            role="tab"
            aria-selected={view === "signal"}
            onClick={() => setView("signal")}
            className={`text-sm px-4 py-1.5 rounded-full transition-colors font-medium ${
              view === "signal"
                ? "bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882]"
                : "text-muted hover:text-foreground"
            }`}
          >
            Signal{" "}
            <span className="ml-1 text-xs opacity-60 tabular-nums">
              {signalCount}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={view === "interesting"}
            onClick={() => setView("interesting")}
            className={`text-sm px-4 py-1.5 rounded-full transition-colors font-medium ${
              view === "interesting"
                ? "bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882]"
                : "text-muted hover:text-foreground"
            }`}
          >
            Interesting{" "}
            <span className="ml-1 text-xs opacity-60 tabular-nums">
              {interestingCount}
            </span>
          </button>
          <button
            role="tab"
            aria-selected={view === "all"}
            onClick={() => setView("all")}
            className={`text-sm px-4 py-1.5 rounded-full transition-colors font-medium ${
              view === "all"
                ? "bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882]"
                : "text-muted hover:text-foreground"
            }`}
          >
            All filings{" "}
            <span className="ml-1 text-xs opacity-60 tabular-nums">
              {totalCount}
            </span>
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {stats?.latest_disclosed_date && (
            <span className="text-muted hidden sm:inline">
              Latest disclosure {stats.latest_disclosed_date}
            </span>
          )}
          <button
            onClick={ingest}
            disabled={ingesting}
            className="rounded-full border border-separator bg-[#6b5038]/10 hover:bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882] px-3 py-1.5 font-medium disabled:opacity-50 transition-colors"
          >
            {ingesting ? "Fetching…" : "Fetch latest"}
          </button>
        </div>
      </div>

      {lastIngest && (
        <div className="mb-3 rounded-lg border border-separator bg-surface/40 px-4 py-2 text-xs text-foreground/65">
          Last manual ingest: scanned {lastIngest.scanned}, parsed{" "}
          {lastIngest.parsed}, {lastIngest.inserted} new ·{" "}
          {lastIngest.replaced} updated
          {lastIngest.errors.length > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {" "}
              · {lastIngest.errors.length} parse error
              {lastIngest.errors.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {err && (
        <div className="mb-3 rounded-lg border border-rose-300/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-2 text-sm text-rose-900 dark:text-rose-200">
          {err}
        </div>
      )}

      <div className="rounded-xl border border-separator overflow-hidden bg-surface/40">
        <UsRowHeader />
        <div className="divide-y divide-black/[0.06] dark:divide-separator">
          {loading && groups.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              Loading…
            </div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              {view === "signal" ? (
                <>
                  No signal-grade trades yet — Haiku triage hasn't surfaced
                  anything <em>maybe</em> or <em>promising</em>.{" "}
                  <button
                    onClick={() => setView("interesting")}
                    className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
                  >
                    Show interesting ({interestingCount})
                  </button>{" "}
                  to see what's pending triage.
                </>
              ) : view === "interesting" ? (
                <>
                  No open-market insider buys in the latest scan.{" "}
                  <button
                    onClick={() => setView("all")}
                    className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
                  >
                    Show all {totalCount} filings
                  </button>{" "}
                  to see the noise.
                </>
              ) : (
                <>
                  No US dealings stored yet. Click{" "}
                  <span className="font-medium text-foreground/70">Fetch latest</span>{" "}
                  to run the first ingest, or wait for the next half-hourly cron.
                </>
              )}
            </div>
          ) : (
            groups.map((g) => (
              <UsDealingRow
                key={g.key}
                group={g}
                selected={selectedKey === g.key}
                onSelect={() => setSelectedKey(g.key)}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-3 mb-8 text-xs text-muted text-center space-y-1">
        <div>
          Showing {groups.length} filing{groups.length === 1 ? "" : "s"}{" "}
          ({rows.length} leg{rows.length === 1 ? "" : "s"}){" "}
          {view === "signal"
            ? `of ${signalCount} signal-grade`
            : view === "interesting"
              ? `of ${interestingCount} interesting`
              : `of ${totalCount} total`}
          {view === "interesting" && noiseCount > 0 && (
            <> · {noiseCount} hidden as noise</>
          )}
        </div>
        {stats && view === "all" && (
          <div className="text-[10px] opacity-70">By code: {codeBreakdown}</div>
        )}
      </div>
      <UsDetailDrawer
        group={selectedGroup}
        onClose={() => setSelectedKey(null)}
      />
    </DefaultLayout>
  );
}
