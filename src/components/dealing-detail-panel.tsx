import { useEffect } from "react";
import { Link } from "react-router-dom";

import type { Dealing } from "@/lib/api";
import type { RatingChecklist } from "../../worker/db/types";
import { RatingBadge } from "@/components/rating-badge";
import { EvidenceTable } from "@/components/evidence-table";

const CHECKLIST_LABELS: { key: keyof RatingChecklist; label: string; tooltip: string }[] = [
  {
    key: "open_market_buy",
    label: "Open-market buy",
    tooltip: "Purchased on the open market — not via an options exercise, LTIP vesting, or employee share scheme. A stronger signal of deliberate investment.",
  },
  {
    key: "senior_insider",
    label: "Senior insider",
    tooltip: "The buyer is a CEO, CFO, Chairman, or board-level director with genuine operational insight into the business.",
  },
  {
    key: "meaningful_conviction",
    label: "Meaningful conviction",
    tooltip: "The purchase size is large relative to the director's likely compensation, suggesting real personal conviction rather than a token gesture.",
  },
  {
    key: "no_alternative_explanation",
    label: "No scheme or plan",
    tooltip: "The purchase doesn't appear to result from a pre-arranged trading plan, SAYE scheme, or required ownership policy — suggesting it's an active investment decision.",
  },
  {
    key: "supporting_context_found",
    label: "Supporting context found",
    tooltip: "External news, filings, or analyst commentary support a bullish view the director may be acting on.",
  },
  {
    key: "no_major_counter_signal",
    label: "No major counter-signal",
    tooltip: "No recent red flags — profit warnings, accounting irregularities, or heavy insider selling — that would undercut the signal.",
  },
];

function RatingChecklistView({ checklist }: { checklist: RatingChecklist }) {
  const passed = CHECKLIST_LABELS.filter((c) => checklist[c.key]).length;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold">Rating checklist</h3>
        <span className="text-xs text-muted">{passed} of {CHECKLIST_LABELS.length} criteria met</span>
      </div>
      <ul className="divide-y divide-black/10 dark:divide-white/10 border-y border-black/10 dark:border-white/10">
        {CHECKLIST_LABELS.map(({ key, label, tooltip }) => {
          const ok = checklist[key];
          return (
            <li key={key} className="flex items-center gap-3 py-2.5">
              <span
                aria-label={ok ? "passed" : "failed"}
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0
                  ${ok
                    ? "bg-[#3a5c30]/15 text-[#3a5c30] dark:text-[#7ab870]"
                    : "bg-[#7a3030]/15 text-[#7a3030] dark:text-[#c47070]"
                  }`}
              >
                {ok ? "✓" : "✗"}
              </span>
              <span className={`text-sm ${ok ? "text-foreground" : "text-foreground/60"} relative group/tip inline-flex items-center gap-1.5 cursor-default`}>
                {label}
                <span className="text-[11px] text-muted/50 group-hover/tip:text-muted transition-colors">ⓘ</span>
                <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-50
                  opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150
                  w-64 rounded-lg bg-[#1e1a16] dark:bg-[#eae4dc]
                  text-[#e8e2da] dark:text-[#1e1a16]
                  text-xs px-3 py-2.5 leading-relaxed shadow-2xl">
                  {tooltip}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function fmtGbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function PositionCard({
  entry,
  current,
  shares,
  originalValue,
  ftseEntry,
  ftseCurrent,
}: {
  entry: number;
  current: number;
  shares: number;
  originalValue: number;
  ftseEntry?: number;
  ftseCurrent?: number;
}) {
  const stockPct = (current - entry) / entry;
  const up = stockPct >= 0;
  const currentValue = (shares * current) / 100;
  const gainLoss = currentValue - originalValue;
  const gainSign = gainLoss >= 0 ? "+" : "";

  const ftsePct = ftseEntry != null && ftseCurrent != null
    ? (ftseCurrent - ftseEntry) / ftseEntry
    : null;
  const alphaPct = ftsePct != null ? stockPct - ftsePct : null;
  const ahead = alphaPct != null && alphaPct >= 0;

  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
  const fmtPp = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pp`;

  const upText = "text-[#3a5c30] dark:text-[#7ab870]";
  const downText = "text-[#7a3030] dark:text-[#c47070]";
  const upBg = "bg-[#3a5c30]/[0.09]";
  const downBg = "bg-[#7a3030]/[0.09]";

  return (
    <div className={`grid gap-3 ${ftsePct != null ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
      {/* Entry */}
      <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.05] px-4 py-4">
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Entry</div>
        <div className="text-2xl font-bold tabular-nums">{entry.toFixed(0)}p</div>
        <div className="text-xs text-muted mt-1">{fmtGbp(originalValue)}</div>
      </div>

      {/* Now */}
      <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.05] px-4 py-4">
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Now</div>
        <div className={`text-2xl font-bold tabular-nums ${up ? upText : downText}`}>
          {current.toFixed(0)}p
        </div>
        <div className="text-xs text-muted mt-1">{fmtGbp(currentValue)}</div>
      </div>

      {/* Stock return */}
      <div className={`rounded-xl px-4 py-4 ${up ? upBg : downBg}`}>
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Return</div>
        <div className={`text-2xl font-bold tabular-nums ${up ? upText : downText}`}>
          {fmt(stockPct)}
        </div>
        <div className={`text-xs font-medium mt-1 ${up ? upText : downText} opacity-70`}>
          {gainSign}{fmtGbp(gainLoss)}
        </div>
      </div>

      {/* FTSE benchmark (only when data is available) */}
      {ftsePct != null && (
        <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.05] px-4 py-4">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-2">vs FTSE</div>
          <div className="text-2xl font-bold tabular-nums text-muted">
            {fmt(ftsePct)}
          </div>
          {alphaPct != null && (
            <div className={`text-xs font-semibold mt-1 ${ahead ? upText : downText}`}>
              {fmtPp(alphaPct)} alpha
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DealingDetailPanel({
  dealing,
  currentPricePence,
  ftseEntryPence,
  ftseCurrentPence,
  onClose,
}: {
  dealing: Dealing | null;
  currentPricePence?: number;
  ftseEntryPence?: number;
  ftseCurrentPence?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!dealing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealing, onClose]);

  const open = !!dealing;
  const a = dealing?.analysis;
  const t = dealing?.triage;
  const company = dealing?.company.replace(/\s*\([^)]*\)\s*$/, "") ?? "";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-background border-l border-black/10 dark:border-white/10 z-50
          shadow-2xl overflow-y-auto transform transition-transform duration-200
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {dealing && (
          <div className="p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-xs bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                    {dealing.ticker.replace(/\.L$/, "")}
                  </span>
                  {a && <RatingBadge rating={a.rating} />}
                </div>
                <h1 className="text-3xl font-bold leading-tight tracking-tight">{company}</h1>
              </div>
              <button
                aria-label="Close"
                className="text-muted hover:text-foreground text-2xl leading-none px-2"
                onClick={onClose}
              >
                ×
              </button>
            </div>

            {a?.summary && (
              <p className="text-xl font-semibold leading-snug text-foreground/90">
                {a.summary}
              </p>
            )}

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
              <div>
                <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Buyer</dt>
                <dd className="text-sm font-medium truncate">{dealing.director.name}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Role</dt>
                <dd className="text-sm font-medium truncate">{dealing.director.role}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Amount</dt>
                <dd className="text-sm font-medium">{fmtGbp(dealing.value_gbp)}</dd>
              </div>
              {a && (
                <>
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Confidence</dt>
                    <dd className="text-sm font-medium">{(a.confidence * 100).toFixed(0)}%</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Catalyst</dt>
                    <dd className="text-sm font-medium">{a.catalyst_window}</dd>
                  </div>
                </>
              )}
            </dl>

            {currentPricePence != null && (
              <PositionCard
                entry={dealing.price_pence}
                current={currentPricePence}
                shares={dealing.shares}
                originalValue={dealing.value_gbp}
                ftseEntry={ftseEntryPence}
                ftseCurrent={ftseCurrentPence}
              />
            )}

            {!a && t && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Triage note</h4>
                <p className="text-sm text-foreground/80">{t.reason}</p>
                <p className="text-xs text-muted mt-2 italic">
                  This dealing did not pass triage, so no deep analysis was run.
                </p>
              </div>
            )}

            {a && (
              <>
                {a.checklist && <RatingChecklistView checklist={a.checklist} />}

                {a.thesis_points.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Thesis</h3>
                    <div className="space-y-3">
                      {a.thesis_points.map((p, i) => (
                        <p
                          key={i}
                          className="text-sm text-foreground/90 leading-relaxed"
                        >
                          {p}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-8">
                  <EvidenceTable
                    points={a.evidence_for}
                    title="Why this is interesting"
                    tone="for"
                  />
                  <EvidenceTable
                    points={a.evidence_against}
                    title="Why it might not be"
                    tone="against"
                  />
                </div>

                {a.key_risks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-1">Key risks</h4>
                    <ul className="text-sm list-disc pl-5 text-foreground/90 space-y-1">
                      {a.key_risks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="text-xs">
                  <Link
                    className="text-[#7a6552] hover:underline"
                    to={`/directors/${dealing.director.id}`}
                  >
                    View {dealing.director.name}'s track record →
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
