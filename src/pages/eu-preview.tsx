// Internal viewer for the EU PDMR ingest. v1 source is Sweden's
// Finansinspektionen (FI) — the only EU NCA with a clean machine-readable
// feed of Article 19 transactions today. Reads persisted rows from
// /api/eu-dealings (populated by the hourly :20 cron in ddbx-data) so the
// page loads instantly without spending a SEC-equivalent network round-trip
// on every render.
//
// Not linked from any nav. /eu and /eu-preview both map here. Strategy
// background: ~/ddbx-ios-app/investigations/multi-market/strategy.md
import { useEffect, useMemo, useState } from "react";

import DefaultLayout from "@/layouts/default";
import { api, type EuDealing, type EuDealingsStats } from "@/lib/api";

type SortKey = "disclosed" | "trade" | "issuer" | "value";

function fmtMoney(n: number | null, ccy: string): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: ccy || "SEK",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${ccy} ${Math.round(n).toLocaleString("en-GB")}`;
  }
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function rowValue(d: EuDealing): number | null {
  if (d.price == null) return null;
  return d.price * d.volume;
}

function direction(nature: string): "buy" | "sell" | "grant" | "other" {
  const n = nature.toLowerCase();

  if (n.startsWith("förvärv") || n.startsWith("forvarv")) return "buy";
  if (n.startsWith("avyttring")) return "sell";
  if (n.startsWith("tilldelning") || n.startsWith("teckning")) return "grant";
  return "other";
}

function tally<T extends string>(rows: EuDealing[], pick: (r: EuDealing) => T): Array<{ k: T; n: number }> {
  const map = new Map<T, number>();

  for (const r of rows) {
    const k = pick(r);

    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([k, n]) => ({ k, n }))
    .sort((a, b) => b.n - a.n);
}

export default function EuPreviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EuDealing[]>([]);
  const [stats, setStats] = useState<EuDealingsStats | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("disclosed");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.euDealings({ limit: 500 });

      setRows(r.dealings);
      setStats(r.stats);
      setLastFetched(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];

    copy.sort((a, b) => {
      switch (sortKey) {
        case "disclosed":
          return b.disclosed_date.localeCompare(a.disclosed_date);
        case "trade":
          return b.trade_date.localeCompare(a.trade_date);
        case "issuer":
          return a.company.localeCompare(b.company);
        case "value": {
          const va = rowValue(a) ?? -1;
          const vb = rowValue(b) ?? -1;

          return vb - va;
        }
      }
    });
    return copy;
  }, [rows, sortKey]);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;

    const byDirection = {
      buy: 0,
      sell: 0,
      grant: 0,
      other: 0,
    } as Record<ReturnType<typeof direction>, number>;
    let pca = 0;
    let programme = 0;
    let amendment = 0;
    let firstTime = 0;

    for (const r of rows) {
      byDirection[direction(r.nature)]++;
      if (r.reporter.is_closely_associated) pca++;
      if (r.is_share_programme) programme++;
      if (r.is_amendment) amendment++;
      if (r.is_first_time_report) firstTime++;
    }
    const byInstrument = tally(rows, (r) => r.instrument_type || "—");
    const byCurrency = tally(rows, (r) => r.currency || "—");
    const topIssuers = tally(rows, (r) => r.company || "—").slice(0, 8);

    return {
      byDirection,
      pca,
      programme,
      amendment,
      firstTime,
      byInstrument,
      byCurrency,
      topIssuers,
    };
  }, [rows]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <DefaultLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
          <h1 className="text-2xl font-semibold">EU PDMR preview</h1>
          <button
            className="rounded border border-foreground/20 px-3 py-1 text-xs font-medium hover:bg-foreground/5 disabled:opacity-50"
            disabled={loading}
            type="button"
            onClick={load}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p className="text-sm text-foreground/60 mb-6">
          Sweden — Finansinspektionen Insynsregister (MAR Article 19).
          Persisted hourly at :20 UTC.
          {stats?.latest_disclosed_date && (
            <>
              {" "}
              Latest disclosed{" "}
              <span className="tabular-nums">{fmtDate(stats.latest_disclosed_date)}</span>.
            </>
          )}
          {lastFetched && (
            <>
              {" "}
              Loaded{" "}
              <span className="tabular-nums">
                {lastFetched.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
              .
            </>
          )}
        </p>

        {error && <p className="text-sm text-rose-500 mb-4">{error}</p>}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 text-sm">
            <Stat label="Persisted rows" value={stats.total.toLocaleString("en-GB")} />
            <Stat label="Loaded" value={rows.length.toLocaleString("en-GB")} />
            <Stat
              label="Markets"
              value={stats.by_market.map((m) => `${m.market} ${m.n}`).join(" · ") || "—"}
            />
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Panel title="Direction">
              <Row label="Acquisition (Förvärv)" value={summary.byDirection.buy} />
              <Row label="Disposal (Avyttring)" value={summary.byDirection.sell} />
              <Row label="Grant (Tilldelning)" value={summary.byDirection.grant} />
              <Row label="Other" value={summary.byDirection.other} />
            </Panel>
            <Panel title="Flags">
              <Row label="Closely-associated (PCA)" value={summary.pca} />
              <Row label="Linked to share programme" value={summary.programme} />
              <Row label="First-time report" value={summary.firstTime} />
              <Row label="Amendment / correction" value={summary.amendment} />
            </Panel>
            <Panel title="Currency">
              {summary.byCurrency.map((c) => (
                <Row key={c.k} label={c.k} value={c.n} />
              ))}
            </Panel>
            <Panel title="Instrument type">
              {summary.byInstrument.map((t) => (
                <Row key={t.k} label={t.k} value={t.n} />
              ))}
            </Panel>
            <Panel className="md:col-span-2" title="Top issuers">
              {summary.topIssuers.map((c) => (
                <Row key={c.k} label={c.k} value={c.n} />
              ))}
            </Panel>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="overflow-x-auto rounded border border-foreground/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-xs uppercase tracking-wide text-foreground/60">
                <tr>
                  <Th onClick={() => setSortKey("disclosed")} sorted={sortKey === "disclosed"}>
                    Disclosed
                  </Th>
                  <Th onClick={() => setSortKey("trade")} sorted={sortKey === "trade"}>
                    Trade
                  </Th>
                  <Th onClick={() => setSortKey("issuer")} sorted={sortKey === "issuer"}>
                    Issuer
                  </Th>
                  <Th>PDMR</Th>
                  <Th>Nature</Th>
                  <Th align="right">Volume</Th>
                  <Th align="right">Price</Th>
                  <Th align="right" onClick={() => setSortKey("value")} sorted={sortKey === "value"}>
                    Value
                  </Th>
                  <Th>Flags</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const dir = direction(row.nature);
                  const tone =
                    dir === "buy"
                      ? "text-emerald-500"
                      : dir === "sell"
                        ? "text-rose-500"
                        : "text-foreground/60";
                  const value = rowValue(row);
                  const isOpen = expanded.has(row.id);

                  return (
                    <RowFragment
                      key={row.id}
                      isOpen={isOpen}
                      row={row}
                      tone={tone}
                      value={value}
                      onToggle={() => toggle(row.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && sorted.length === 0 && !error && (
          <p className="text-sm text-foreground/60">
            No rows persisted yet. The cron runs hourly at :20 UTC; backfill via{" "}
            <code className="font-mono">POST /__eu-ingest?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</code>.
          </p>
        )}
      </div>
    </DefaultLayout>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-foreground/10 px-3 py-2">
      <div className="text-xs text-foreground/60">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded border border-foreground/10 p-3 ${className ?? ""}`}>
      <div className="text-xs uppercase tracking-wide text-foreground/60 mb-2">{title}</div>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="truncate text-foreground/80">{label}</span>
      <span className="tabular-nums text-foreground/60">{value}</span>
    </div>
  );
}

function Th({
  children,
  align,
  onClick,
  sorted,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  onClick?: () => void;
  sorted?: boolean;
}) {
  const base = `px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`;

  if (onClick) {
    return (
      <th className={base}>
        <button
          className={`hover:text-foreground ${sorted ? "text-foreground" : ""}`}
          type="button"
          onClick={onClick}
        >
          {children}
          {sorted ? " ↓" : ""}
        </button>
      </th>
    );
  }
  return <th className={base}>{children}</th>;
}

function RowFragment({
  row,
  tone,
  value,
  isOpen,
  onToggle,
}: {
  row: EuDealing;
  tone: string;
  value: number | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const flags: string[] = [];

  if (row.reporter.is_closely_associated) flags.push("PCA");
  if (row.is_share_programme) flags.push("Programme");
  if (row.is_amendment) flags.push("Amended");
  if (row.is_first_time_report) flags.push("First");

  return (
    <>
      <tr
        className={`border-t border-foreground/10 cursor-pointer hover:bg-foreground/5 ${
          row.is_share_programme ? "opacity-70" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-foreground/70">
          {fmtDate(row.disclosed_date)}
        </td>
        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDate(row.trade_date)}</td>
        <td className="px-3 py-2 max-w-[220px] truncate" title={row.company}>
          <div className="font-medium">{row.company}</div>
          <div className="text-xs text-foreground/50">{row.isin}</div>
        </td>
        <td className="px-3 py-2 max-w-[180px] truncate" title={row.reporter.name}>
          <div>{row.reporter.name}</div>
          <div className="text-xs text-foreground/50 truncate">{row.reporter.role}</div>
        </td>
        <td className={`px-3 py-2 ${tone}`}>{row.nature}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.volume)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {row.price != null ? `${fmtNumber(row.price)} ${row.currency}` : "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(value, row.currency)}</td>
        <td className="px-3 py-2 text-xs text-foreground/60">{flags.join(" · ")}</td>
      </tr>
      {isOpen && (
        <tr className="border-t border-foreground/10 bg-foreground/5">
          <td className="px-3 py-3" colSpan={9}>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(row, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}
