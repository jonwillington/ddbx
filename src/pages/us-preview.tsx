// Private preview page for the US Form 4 scraper (multi-market spike).
// Calls POST /__us-scrape on the worker, renders the parsed rows so we can
// eyeball what real EDGAR data looks like before committing to schema +
// persistence. Not linked from any nav.
//
// See ~/ddbx-ios-app/investigations/multi-market/form4-mapping.md.
import { useState } from "react";
import type { UsDealing, UsTransactionCode } from "@/types/ddbx";

const WORKER_BASE = (() => {
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
  return apiBase.endsWith("/api") ? apiBase.slice(0, -4) : apiBase;
})();

interface ScrapeResponse {
  scanned: number;
  parsed: number;
  rows: UsDealing[];
  errors: Array<{ accession: string; message: string }>;
}

const CODE_LABELS: Record<UsTransactionCode, string> = {
  P: "open-market buy",
  S: "open-market sale",
  A: "grant/award",
  M: "exercise of derivative",
  F: "tax/exercise via shares",
  G: "gift",
  C: "conversion",
  D: "disposition (tender/16b-3)",
  J: "other (footnoted)",
  V: "voluntary",
  K: "equity swap",
  X: "exercise (in/at-money)",
  U: "tender disposition",
  W: "will/descent",
  Z: "voting trust",
  L: "small",
  H: "expiration",
  I: "discretionary",
  E: "short expiration",
};

export default function UsPreviewPage() {
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<ScrapeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${WORKER_BASE}/__us-scrape?limit=${limit}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`worker ${res.status}`);
      const body = (await res.json()) as ScrapeResponse;
      setData(body);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Header />
        <Controls limit={limit} setLimit={setLimit} run={run} loading={loading} />
        {err && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {err}
          </div>
        )}
        {data && (
          <>
            <Summary data={data} />
            <Table rows={data.rows} expanded={expanded} toggle={toggle} />
            {data.errors.length > 0 && <ErrorList errors={data.errors} />}
          </>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        US Form 4 preview
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Live EDGAR scrape, dry-run. Pulls the most recent Form 4 filings,
        parses to <code className="rounded bg-slate-200 px-1 py-0.5">UsDealing</code>{" "}
        rows, no D1 writes. Multi-market spike — not part of the public product.
      </p>
    </div>
  );
}

function Controls({
  limit,
  setLimit,
  run,
  loading,
}: {
  limit: number;
  setLimit: (n: number) => void;
  run: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-white p-4 shadow-sm">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-600">Filings:</span>
        <input
          type="number"
          min={1}
          max={50}
          value={limit}
          onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          className="w-20 rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <button
        onClick={run}
        disabled={loading}
        className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Scraping…" : "Fetch"}
      </button>
      <span className="text-xs text-slate-500">
        ~{(limit * 0.6).toFixed(0)}-{limit}s; SEC rate-limit + 2 requests per filing.
      </span>
    </div>
  );
}

function Summary({ data }: { data: ScrapeResponse }) {
  const rows = data.rows;
  const codeCounts: Record<string, number> = {};
  rows.forEach((r) => {
    codeCounts[r.transaction_code] = (codeCounts[r.transaction_code] ?? 0) + 1;
  });
  const sortedCodes = Object.entries(codeCounts).sort((a, b) => b[1] - a[1]);

  const pBuys = rows.filter((r) => r.transaction_code === "P").length;
  const aff10b51 = rows.filter((r) => r.aff_10b5_one).length;
  const indirect = rows.filter((r) => r.direct_indirect === "I").length;
  const derivative = rows.filter((r) => r.is_derivative).length;
  const amendments = rows.filter((r) => r.is_amendment).length;
  const joint = rows.filter((r) => r.co_reporters && r.co_reporters.length > 0).length;

  return (
    <div className="mt-4 rounded border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Stat label="Filings scanned" value={data.scanned} />
        <Stat label="Parsed" value={data.parsed} />
        <Stat label="Transaction rows" value={rows.length} />
        <Stat label="Errors" value={data.errors.length} dim={data.errors.length === 0} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <Stat label="Open-market buys (P)" value={pBuys} accent={pBuys > 0} />
        <Stat label="10b5-1 plan trades" value={aff10b51} />
        <Stat label="Indirect ownership" value={indirect} />
        <Stat label="Derivative (Table II)" value={derivative} />
        <Stat label="Amendments (4/A)" value={amendments} />
        <Stat label="Joint filers" value={joint} />
      </div>
      <div className="mt-3 text-xs text-slate-600">
        <span className="font-medium">Codes:</span>{" "}
        {sortedCodes.map(([code, n]) => (
          <span key={code} className="mr-3 inline-block">
            {code}={n}{" "}
            <span className="text-slate-400">
              ({CODE_LABELS[code as UsTransactionCode] ?? "?"})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  dim,
}: {
  label: string;
  value: number;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <span className={dim ? "text-slate-400" : undefined}>
      <span className="text-slate-500">{label}:</span>{" "}
      <span className={accent ? "font-semibold text-emerald-700" : "font-medium"}>
        {value}
      </span>
    </span>
  );
}

function Table({
  rows,
  expanded,
  toggle,
}: {
  rows: UsDealing[];
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  // Sort: P (buys) first, then by trade date desc.
  const sorted = [...rows].sort((a, b) => {
    if (a.transaction_code === "P" && b.transaction_code !== "P") return -1;
    if (b.transaction_code === "P" && a.transaction_code !== "P") return 1;
    return b.trade_date.localeCompare(a.trade_date);
  });

  return (
    <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <Th>Code</Th>
            <Th>A/D</Th>
            <Th>D/I</Th>
            <Th>Ticker</Th>
            <Th>Company</Th>
            <Th>Reporter</Th>
            <Th>Roles</Th>
            <Th className="text-right">Shares</Th>
            <Th className="text-right">Price</Th>
            <Th>10b5-1</Th>
            <Th>Trade</Th>
            <Th>Filed</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((r) => (
            <Row
              key={r.id}
              row={r}
              expanded={expanded.has(r.id)}
              onToggle={() => toggle(r.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-3 py-2 font-medium ${className ?? ""}`}>{children}</th>;
}

function Row({
  row,
  expanded,
  onToggle,
}: {
  row: UsDealing;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isBuy = row.transaction_code === "P";
  const muted = row.aff_10b5_one;
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer hover:bg-slate-50 ${
          isBuy ? "bg-emerald-50 hover:bg-emerald-100" : ""
        } ${muted ? "text-slate-500" : ""}`}
      >
        <td className="px-3 py-2 font-mono font-semibold">{row.transaction_code}</td>
        <td className="px-3 py-2 font-mono">{row.acquired_disposed}</td>
        <td className="px-3 py-2 font-mono">{row.direct_indirect}</td>
        <td className="px-3 py-2 font-mono font-medium">{row.ticker || "—"}</td>
        <td className="px-3 py-2">{row.company || "—"}</td>
        <td className="px-3 py-2">{row.reporter.name}</td>
        <td className="px-3 py-2 text-xs text-slate-600">
          {row.reporter.roles.join(", ") || "—"}
        </td>
        <td className="px-3 py-2 text-right font-mono">
          {row.shares.toLocaleString()}
        </td>
        <td className="px-3 py-2 text-right font-mono">
          {row.price === null ? "—" : row.price === 0 ? "0" : `$${row.price}`}
        </td>
        <td className="px-3 py-2 text-xs">{row.aff_10b5_one ? "yes" : ""}</td>
        <td className="px-3 py-2 font-mono text-xs">{row.trade_date}</td>
        <td className="px-3 py-2 font-mono text-xs">{row.disclosed_date}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} className="bg-slate-50 px-3 py-3">
            <RowDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function RowDetail({ row }: { row: UsDealing }) {
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="id" value={row.id} mono />
        <Field label="filing_id" value={row.filing_id} mono />
        <Field
          label="code"
          value={`${row.transaction_code} — ${CODE_LABELS[row.transaction_code] ?? "?"}`}
        />
        <Field label="security_title" value={row.security_title} />
        <Field label="issuer_cik" value={row.issuer_cik} mono />
        <Field label="reporter cik" value={row.reporter.cik} mono />
        <Field
          label="value"
          value={row.value === null ? "null" : `$${row.value.toLocaleString()}`}
        />
        <Field
          label="shares_after"
          value={row.shares_after?.toLocaleString() ?? "—"}
        />
        <Field
          label="nature_of_ownership"
          value={row.nature_of_ownership ?? "—"}
        />
        <Field
          label="is_amendment"
          value={row.is_amendment ? `yes (orig ${row.original_filing_date ?? "?"})` : "no"}
        />
        <Field
          label="is_late"
          value={row.is_late ? "yes" : "no"}
        />
        <Field
          label="not_subject_to_section16"
          value={row.not_subject_to_section16 ? "yes" : "no"}
        />
      </div>
      {row.is_derivative && (
        <div className="rounded border border-slate-200 bg-white p-2">
          <div className="mb-1 font-medium text-slate-700">Derivative (Table II)</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="underlying_security_title"
              value={row.underlying_security_title ?? "—"}
            />
            <Field
              label="underlying_security_shares"
              value={row.underlying_security_shares?.toLocaleString() ?? "—"}
            />
            <Field
              label="conversion_or_exercise_price"
              value={
                row.conversion_or_exercise_price === null ||
                row.conversion_or_exercise_price === undefined
                  ? "—"
                  : `$${row.conversion_or_exercise_price}`
              }
            />
            <Field label="exercise_date" value={row.exercise_date ?? "—"} />
            <Field label="expiration_date" value={row.expiration_date ?? "—"} />
          </div>
        </div>
      )}
      {row.co_reporters && row.co_reporters.length > 0 && (
        <div className="rounded border border-slate-200 bg-white p-2">
          <div className="mb-1 font-medium text-slate-700">
            Co-reporters ({row.co_reporters.length})
          </div>
          <ul className="space-y-1">
            {row.co_reporters.map((c) => (
              <li key={c.cik}>
                <span className="font-mono">{c.cik}</span> {c.name} —{" "}
                <span className="text-slate-500">{c.roles.join(", ") || "no roles"}</span>
                {c.officer_title && (
                  <span className="text-slate-500"> · {c.officer_title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {row.footnotes && Object.keys(row.footnotes).length > 0 && (
        <div className="rounded border border-slate-200 bg-white p-2">
          <div className="mb-1 font-medium text-slate-700">Footnotes</div>
          <dl className="space-y-1">
            {Object.entries(row.footnotes).map(([id, text]) => (
              <div key={id}>
                <dt className="inline font-mono font-medium">{id}</dt>{" "}
                <dd className="inline text-slate-600">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-slate-500">Raw JSON</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
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
      <span className="text-slate-500">{label}:</span>{" "}
      <span className={mono ? "font-mono" : undefined}>{value}</span>
    </div>
  );
}

function ErrorList({
  errors,
}: {
  errors: Array<{ accession: string; message: string }>;
}) {
  return (
    <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="mb-1 font-medium">Parser errors</div>
      <ul className="space-y-1 text-xs">
        {errors.map((e) => (
          <li key={e.accession}>
            <span className="font-mono">{e.accession}</span>: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
