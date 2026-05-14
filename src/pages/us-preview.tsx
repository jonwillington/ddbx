// Internal viewer for the US Form 4 ingest pipeline (multi-market spike).
// Reads persisted rows from GET /api/us-dealings (populated by the half-hourly
// cron in ddbx-data) and renders them in the dashboard's row visual language
// so we can eyeball signal quality alongside what the UK list looks like.
//
// Not linked from any nav. The companion /us route maps to this same page —
// see src/App.tsx. Background context:
// ~/ddbx-ios-app/investigations/multi-market/us-preview-handoff.md
import { useEffect, useMemo, useState } from "react";

import DefaultLayout from "@/layouts/default";
import { CompanyLogo } from "@/components/company-logo";
import { api, type IngestResult, type UsDealing, type UsDealingsStats } from "@/lib/api";
import type { UsTransactionCode } from "@/types/ddbx";

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

// Filter presets surfaced in the toolbar. Empty string = no filter.
const CODE_FILTERS: Array<{ code: string; label: string }> = [
  { code: "", label: "All" },
  { code: "P", label: "P · Buys" },
  { code: "S", label: "S · Sales" },
  { code: "A", label: "A · Grants" },
  { code: "M", label: "M · Exercise" },
  { code: "F", label: "F · Tax" },
];

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
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function CodeBadge({ code }: { code: UsTransactionCode }) {
  const tone =
    code === "P"
      ? "bg-emerald-700/15 text-emerald-800 border-emerald-700/35 dark:text-emerald-300 dark:border-emerald-300/30"
      : code === "S"
        ? "bg-rose-700/12 text-rose-800 border-rose-700/30 dark:text-rose-300 dark:border-rose-300/30"
        : "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border px-2.5 py-1 text-sm font-semibold font-mono ${tone}`}
      title={CODE_LABELS[code] ?? code}
    >
      {code}
    </span>
  );
}

function FlagChip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "warn" | "info";
}) {
  const styles =
    tone === "warn"
      ? "bg-amber-200/30 text-amber-900 border-amber-400/40 dark:text-amber-200 dark:border-amber-300/30"
      : tone === "info"
        ? "bg-blue-200/30 text-blue-900 border-blue-400/40 dark:text-blue-200 dark:border-blue-300/30"
        : "bg-black/[0.04] text-foreground/55 border-black/[0.08] dark:bg-white/5 dark:text-foreground/70 dark:border-white/10";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles}`}
    >
      {children}
    </span>
  );
}

function UsRowHeader() {
  return (
    <div className="hidden md:flex items-center text-xs text-muted font-medium select-none border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05]">
      <div className="w-40 shrink-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
        Disclosed
      </div>
      <div className="w-[4.5rem] shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
        Ticker
      </div>
      <div className="flex-1 min-w-0 px-4 py-2.5 border-r border-black/[0.06] dark:border-white/[0.06]">
        Company / Reporter
      </div>
      <div className="w-36 shrink-0 px-4 py-2.5 text-right border-r border-black/[0.06] dark:border-white/[0.06]">
        Value (USD)
      </div>
      <div className="w-20 shrink-0 px-3 py-2.5 text-center border-r border-black/[0.06] dark:border-white/[0.06]">
        Code
      </div>
      <div className="w-48 shrink-0 px-4 py-2.5 text-center">Flags</div>
    </div>
  );
}

function UsDealingRow({
  row,
  expanded,
  onToggle,
}: {
  row: UsDealing;
  expanded: boolean;
  onToggle: () => void;
}) {
  // 10b5-1 trades are pre-arranged plans — close to no current-view signal.
  // Mirror the UK row's "muted when no analysis" pattern.
  const muted = row.aff_10b5_one;
  const ticker = row.ticker || "—";
  const company = row.company || "—";
  const role =
    row.reporter.officer_title ?? (row.reporter.roles.join(", ") || "reporter");

  return (
    <>
      <button
        className={`w-full text-left transition-colors
          ${muted ? "opacity-60" : ""}
          ${expanded ? "bg-[#6b5038]/[0.07] dark:bg-[#6b5038]/[0.20]" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}
        onClick={onToggle}
      >
        {/* ── Mobile (<md) ── */}
        <div className="md:hidden px-4 py-3.5">
          <div className="mb-2">
            <span className="text-xs text-foreground/50 font-medium">
              {shortDate(row.disclosed_date)}
            </span>
            {row.trade_date !== row.disclosed_date && (
              <span className="block text-[10px] text-muted/70 mt-0.5">
                Trade · {shortDate(row.trade_date)}
              </span>
            )}
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
                {row.reporter.name} · {role}
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span className="text-base font-medium tabular-nums leading-tight">
                {fmtUsd(row.value)}
              </span>
              <CodeBadge code={row.transaction_code} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            <FlagChip>{row.acquired_disposed === "A" ? "Acquired" : "Disposed"}</FlagChip>
            <FlagChip>{row.direct_indirect === "D" ? "Direct" : "Indirect"}</FlagChip>
            {row.aff_10b5_one && <FlagChip tone="warn">10b5-1</FlagChip>}
            {row.is_derivative && <FlagChip tone="info">Derivative</FlagChip>}
            {row.is_amendment && <FlagChip tone="info">4/A</FlagChip>}
            {row.is_late && <FlagChip tone="warn">Late</FlagChip>}
          </div>
        </div>

        {/* ── Desktop (md+) — column widths mirror DealingRow ── */}
        <div className="hidden md:flex items-stretch">
          <div className="w-40 shrink-0 px-4 py-4 flex flex-col justify-center border-r border-black/[0.06] dark:border-white/[0.06] min-h-[3.5rem]">
            <div className="text-sm text-foreground/90 font-medium leading-tight">
              {shortDate(row.disclosed_date)}
            </div>
            {row.trade_date !== row.disclosed_date && (
              <div className="text-[10px] text-muted/75 mt-1">
                Trade · {shortDate(row.trade_date)}
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
              <div className="text-sm text-muted truncate mt-0.5">
                {row.reporter.name} · {role}
              </div>
            </div>
          </div>
          <div className="w-36 shrink-0 px-4 py-4 flex flex-col items-end justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <div className="text-xl font-medium tabular-nums">{fmtUsd(row.value)}</div>
            <div className="text-xs text-muted tabular-nums mt-0.5">
              {row.shares.toLocaleString()} sh
            </div>
          </div>
          <div className="w-20 shrink-0 px-3 py-4 flex items-center justify-center border-r border-black/[0.06] dark:border-white/[0.06]">
            <CodeBadge code={row.transaction_code} />
          </div>
          <div className="w-48 shrink-0 px-3 py-4 flex flex-wrap items-center justify-center gap-1">
            <FlagChip>{row.acquired_disposed === "A" ? "A" : "D"}</FlagChip>
            <FlagChip>{row.direct_indirect === "D" ? "Direct" : "Indirect"}</FlagChip>
            {row.aff_10b5_one && <FlagChip tone="warn">10b5-1</FlagChip>}
            {row.is_derivative && <FlagChip tone="info">Deriv</FlagChip>}
            {row.is_amendment && <FlagChip tone="info">4/A</FlagChip>}
            {row.is_late && <FlagChip tone="warn">Late</FlagChip>}
          </div>
        </div>
      </button>
      {expanded && <UsRowDetail row={row} />}
    </>
  );
}

function UsRowDetail({ row }: { row: UsDealing }) {
  return (
    <div className="px-4 md:px-6 py-4 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/[0.06] dark:border-white/[0.06]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        <Field label="Filing" value={row.filing_id} mono />
        <Field label="Issuer CIK" value={row.issuer_cik} mono />
        <Field label="Reporter CIK" value={row.reporter.cik} mono />
        <Field label="Security" value={row.security_title} />
        <Field
          label="Shares after"
          value={row.shares_after?.toLocaleString() ?? "—"}
        />
        <Field label="Nature" value={row.nature_of_ownership ?? "—"} />
        <Field
          label="Code"
          value={`${row.transaction_code} — ${CODE_LABELS[row.transaction_code] ?? "?"}`}
        />
        <Field
          label="Price"
          value={
            row.price == null ? "—" : row.price === 0 ? "$0" : `$${row.price}`
          }
        />
        <Field label="Currency" value={row.currency} />
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

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-foreground transition-colors">
          Raw JSON
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-black/85 dark:bg-black/60 p-3 text-[11px] text-slate-100 leading-snug">
          {JSON.stringify(row, null, 2)}
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

export default function UsPreviewPage() {
  const [rows, setRows] = useState<UsDealing[]>([]);
  const [stats, setStats] = useState<UsDealingsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastIngest, setLastIngest] = useState<IngestResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [codeFilter, setCodeFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.usDealings({
        limit: 200,
        code: codeFilter || undefined,
      });
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
  }, [codeFilter]);

  const buyCount = useMemo(
    () => rows.filter((r) => r.transaction_code === "P").length,
    [rows],
  );
  const planCount = useMemo(
    () => rows.filter((r) => r.aff_10b5_one).length,
    [rows],
  );

  return (
    <DefaultLayout>
      <div className="mb-5">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          US Form 4 (preview)
        </h1>
        <p className="mt-2 text-sm text-foreground/55 max-w-2xl">
          Live SEC EDGAR Form 4 ingest — half-hourly cron writes into D1, this
          page reads from <code>/api/us-dealings</code>. Internal multi-market
          spike, not part of the public product.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {CODE_FILTERS.map(({ code, label }) => (
            <button
              key={code || "all"}
              onClick={() => setCodeFilter(code)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                codeFilter === code
                  ? "border-[#6b5038]/60 bg-[#6b5038]/10 text-[#4a3520] dark:text-[#c4a882] font-semibold"
                  : "border-separator text-muted hover:bg-black/[0.03] dark:hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {stats && (
            <span className="text-muted hidden sm:inline">
              {stats.total.toLocaleString()} stored · latest{" "}
              {stats.latest_disclosed_date ?? "—"}
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
          {loading && rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              No US dealings stored yet. Click{" "}
              <span className="font-medium text-foreground/70">Fetch latest</span>{" "}
              to run the first ingest, or wait for the next half-hourly cron.
            </div>
          ) : (
            rows.map((r) => (
              <UsDealingRow
                key={r.id}
                row={r}
                expanded={expanded === r.id}
                onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-3 mb-8 text-xs text-muted text-center">
        Showing {rows.length} of {stats?.total.toLocaleString() ?? "?"} ·
        Open-market buys: {buyCount} · 10b5-1: {planCount}
      </div>
    </DefaultLayout>
  );
}
