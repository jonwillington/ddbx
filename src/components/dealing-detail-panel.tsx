import { useEffect } from "react";
import { Link } from "react-router-dom";

import type { Dealing } from "@/lib/api";
import type { RatingChecklist } from "../../worker/db/types";
import { RatingBadge } from "@/components/rating-badge";
import { EvidenceTable } from "@/components/evidence-table";

const CHECKLIST_LABELS: { key: keyof RatingChecklist; label: string }[] = [
  { key: "open_market_buy", label: "Open-market buy" },
  { key: "senior_insider", label: "Senior insider" },
  { key: "meaningful_conviction", label: "Meaningful conviction" },
  { key: "no_alternative_explanation", label: "No alternative explanation" },
  { key: "supporting_context_found", label: "Supporting context found" },
  { key: "no_major_counter_signal", label: "No major counter-signal" },
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
        {CHECKLIST_LABELS.map(({ key, label }) => {
          const ok = checklist[key];
          return (
            <li key={key} className="flex items-center gap-3 py-2.5">
              <span
                aria-label={ok ? "passed" : "failed"}
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0
                  ${ok ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}
              >
                {ok ? "✓" : "✗"}
              </span>
              <span className={`text-sm ${ok ? "text-foreground" : "text-foreground/60"}`}>{label}</span>
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
}: {
  entry: number;
  current: number;
  shares: number;
  originalValue: number;
}) {
  const delta = ((current - entry) / entry) * 100;
  const sign = delta >= 0 ? "+" : "";
  const up = delta >= 0;
  const currentValue = (shares * current) / 100;
  const gainLoss = currentValue - originalValue;
  const gainSign = gainLoss >= 0 ? "+" : "";

  return (
    <div className={`rounded-md px-4 py-3 flex flex-wrap gap-x-8 gap-y-1
      ${up ? "bg-green-500/8 border border-green-500/20" : "bg-red-500/8 border border-red-500/20"}`}>
      <div>
        <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Entry</div>
        <div className="text-sm font-medium">{entry.toFixed(0)}p</div>
        <div className="text-xs text-muted">{fmtGbp(originalValue)} · {shares.toLocaleString()} shares</div>
      </div>
      <div>
        <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Now</div>
        <div className={`text-sm font-semibold ${up ? "text-green-400" : "text-red-400"}`}>
          {current.toFixed(0)}p
        </div>
        <div className="text-xs text-muted">{fmtGbp(currentValue)}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Return</div>
        <div className={`text-sm font-semibold ${up ? "text-green-400" : "text-red-400"}`}>
          {sign}{delta.toFixed(1)}%
        </div>
        <div className={`text-xs font-medium ${up ? "text-green-400/70" : "text-red-400/70"}`}>
          {gainSign}{fmtGbp(gainLoss)}
        </div>
      </div>
    </div>
  );
}

export function DealingDetailPanel({
  dealing,
  currentPricePence,
  onClose,
}: {
  dealing: Dealing | null;
  currentPricePence?: number;
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
