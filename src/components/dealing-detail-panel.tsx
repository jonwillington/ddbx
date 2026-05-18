import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Dealing } from "@/lib/api";
import { RatingBadge } from "@/components/rating-badge";
import { CompanyLogo } from "@/components/company-logo";
import { EvidenceTable } from "@/components/evidence-table";
import { InformationCircleIcon as InformationCircleOutlineIcon } from "@heroicons/react/24/outline";
import { useDiscretion } from "@/lib/discretion";
import { DUMMY_ANALYSIS } from "@/components/discretion/dummy-analysis";
import { BlurredAnalysisOverlay } from "@/components/discretion/blurred-analysis-overlay";
import { RatingChecklistView } from "@/components/rating-checklist-view";
import { PositionCard, type PriceFormat } from "@/components/position-card";
import { MiniPriceChart } from "@/components/mini-price-chart";

// Pence (LSE quote unit) → GBP. Used for both the position card and price
// chart; values from /api/prices/history come back as `close_pence` for UK
// tickers so the quote unit IS pence.
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

function fmtGbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Shown in the detail drawer when we have no Opus analysis — triage only. */
function TriageOnlyAnalysisNotice({
  triage,
}: {
  triage: Dealing["triage"];
}) {
  const verdictLabel =
    triage?.verdict === "skip"
      ? "Skipped"
      : triage?.verdict === "maybe"
        ? "Maybe"
        : triage?.verdict === "promising"
          ? "Promising"
          : "Screened";

  return (
    <div
      role="note"
      className="flex gap-3 rounded-lg border border-amber-200/90 bg-amber-50/95 px-3.5 py-3.5 text-left shadow-sm dark:border-amber-900/55 dark:bg-amber-950/35"
    >
      <InformationCircleOutlineIcon
        className="w-5 h-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5"
        aria-hidden
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const open = !!dealing;
  const a = dealing?.analysis;
  const t = dealing?.triage;
  const company = dealing?.company.replace(/\s*\([^)]*\)\s*$/, "") ?? "";
  const ticker = dealing?.ticker.replace(/\.L$/, "") ?? "";

  const discretion = useDiscretion();
  const gated =
    discretion.enabled && dealing != null && !discretion.hasFullAccess(dealing.id);
  const display = gated ? DUMMY_ANALYSIS : a;

  // Record this drawer-open against today's quota so the freebie locks in
  // on the first deal opened — whether reached by click or by deep link.
  useEffect(() => {
    if (!dealing || !discretion.enabled) return;
    discretion.recordView(dealing.id);
  }, [dealing?.id, discretion.enabled, discretion.recordView]);

  // Escape key
  useEffect(() => {
    if (!dealing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealing, onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Track scroll position for header shadow + bottom fade
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 56);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 24);
  }, []);

  // Reset scroll position when a different dealing is opened
  useEffect(() => {
    setScrolled(false);
    setAtBottom(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [dealing?.id]);


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
          shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-200
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {dealing && (
          <>
            {/* Fixed header — always accessible; company name fades in once scrolled */}
            <div
              className={`shrink-0 flex items-center gap-3 px-5 md:px-8 py-4 border-b transition-all duration-200
                ${scrolled
                  ? "border-black/10 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                  : "border-transparent"
                }`}
            >
              <CompanyLogo ticker={dealing.ticker} size={32} />
              <span className="font-mono text-xs bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                {ticker}
              </span>
              {a && <RatingBadge rating={a.rating} className="shrink-0" />}
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

            {/* Scrollable content area */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto"
            >
              <div className="p-5 md:p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <CompanyLogo ticker={dealing.ticker} size={56} />
                  <h1 className="text-3xl font-bold leading-tight tracking-tight flex-1 min-w-0">{company}</h1>
                </div>

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
                </dl>

                {/* Performance — always visible, even when the analysis below is gated. */}
                {currentPricePence != null && (
                  <PositionCard
                    entry={dealing.price_pence}
                    current={currentPricePence}
                    shares={dealing.shares}
                    originalValue={dealing.value_gbp}
                    fmt={GBP_FORMAT}
                    benchmark={{
                      entry: ftseEntryPence ?? null,
                      current: ftseCurrentPence ?? null,
                      label: "FTSE",
                    }}
                  />
                )}

                <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4 h-72">
                  <MiniPriceChart
                    tickerForApi={dealing.ticker}
                    tickerForDisplay={dealing.ticker.replace(/\.L$/, "")}
                    tradeDate={dealing.trade_date.slice(0, 10)}
                    entryPrice={dealing.price_pence}
                    fmt={GBP_FORMAT}
                  />
                </div>

                {/* Analysis — gated when the user has spent today's free drawer. */}
                {!display ? (
                  <TriageOnlyAnalysisNotice triage={t} />
                ) : (
                  <div className={gated ? "relative" : ""}>
                    <div
                      className={
                        gated
                          ? "space-y-6 blur-md select-none pointer-events-none"
                          : "space-y-6"
                      }
                      aria-hidden={gated || undefined}
                    >
                      {display.summary && (
                        <p className="text-xl font-semibold leading-snug text-foreground/90">
                          {display.summary}
                        </p>
                      )}

                      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
                        <div>
                          <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Confidence</dt>
                          <dd className="text-sm font-medium">{(display.confidence * 100).toFixed(0)}%</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Catalyst</dt>
                          <dd className="text-sm font-medium">{display.catalyst_window}</dd>
                        </div>
                      </dl>

                      {display.checklist && (
                        <RatingChecklistView checklist={display.checklist} />
                      )}

                      {display.thesis_points.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold mb-2">Thesis</h3>
                          <div className="space-y-3">
                            {display.thesis_points.map((p, i) => (
                              <p key={i} className="text-sm text-foreground/90 leading-relaxed">
                                {p}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-8">
                        <EvidenceTable
                          points={display.evidence_for}
                          title="Why this is interesting"
                          tone="for"
                        />
                        <EvidenceTable
                          points={display.evidence_against}
                          title="Why it might not be"
                          tone="against"
                        />
                      </div>

                      {display.key_risks.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Key risks</h4>
                          <ul className="text-sm list-disc pl-5 text-foreground/90 space-y-1">
                            {display.key_risks.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="text-xs pb-6">
                        <Link
                          className="text-[#6b5038] hover:underline"
                          to={`/directors/${dealing.director.id}`}
                        >
                          View {dealing.director.name}'s track record →
                        </Link>
                      </div>
                    </div>
                    {gated && <BlurredAnalysisOverlay />}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom fade — fades out when scrolled to bottom */}
            <div
              className={`pointer-events-none absolute bottom-0 left-0 right-0 h-16
                bg-gradient-to-t from-background to-transparent transition-opacity duration-300
                ${atBottom ? "opacity-0" : "opacity-100"}`}
            />
          </>
        )}
      </aside>
    </>
  );
}
