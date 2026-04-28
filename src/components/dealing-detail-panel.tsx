import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Dealing } from "@/lib/api";
import type { RatingChecklist } from "../../worker/db/types";
import { RatingBadge } from "@/components/rating-badge";
import { EvidenceTable } from "@/components/evidence-table";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { InformationCircleIcon as InformationCircleOutlineIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import { useDiscretion } from "@/lib/discretion";
import { DUMMY_ANALYSIS } from "@/components/discretion/dummy-analysis";
import { BlurredAnalysisOverlay } from "@/components/discretion/blurred-analysis-overlay";

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

function InfoIcon() {
  return (
    <InformationCircleIcon
      className="w-3.5 h-3.5 shrink-0 text-muted/50 group-hover/tip:text-muted/80 transition-colors"
    />
  );
}

type PriceBar = { date: string; close_pence: number };
type Period = "since" | "ytd" | "max";

const PERIODS: { key: Period; label: string }[] = [
  { key: "since", label: "Since entry" },
  { key: "ytd", label: "YTD" },
  { key: "max", label: "Max" },
];

function MiniPriceChart({
  ticker,
  tradeDate,
  entryPricePence,
}: {
  ticker: string;       // full ticker e.g. "TSCO.L"
  tradeDate: string;    // YYYY-MM-DD
  entryPricePence: number;
}) {
  const [period, setPeriod] = useState<Period>("since");
  const [allBars, setAllBars] = useState<PriceBar[]>([]);

  const displayTicker = ticker.replace(/\.L$/, "");

  useEffect(() => {
    if (!ticker) { setAllBars([]); return; }
    setAllBars([]);
    api.priceHistory(ticker, 365).then(setAllBars).catch(() => {});
  }, [ticker]);

  const bars = useMemo(() => {
    if (period === "since") return allBars.filter((b) => b.date >= tradeDate);
    if (period === "ytd") return allBars.filter((b) => b.date >= `${new Date().getFullYear()}-01-01`);
    return allBars;
  }, [allBars, period, tradeDate]);

  const lastBar = allBars[allBars.length - 1];
  const up = lastBar ? lastBar.close_pence >= entryPricePence : true;
  const returnPct = lastBar ? ((lastBar.close_pence - entryPricePence) / entryPricePence) * 100 : 0;

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const lineColor = up ? (isDark ? "#5cd84a" : "#1e6b18") : (isDark ? "#e84d4d" : "#8b2020");
  const upCls = "text-[#1e6b18] dark:text-[#5cd84a]";
  const downCls = "text-[#8b2020] dark:text-[#e84d4d]";

  const W = 240, H = 160;
  const pL = 2, pR = 2, pT = 8, pB = 18;

  let svgContent: React.ReactNode = null;

  if (bars.length >= 2) {
    const prices = bars.map((b) => b.close_pence);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const yPad = (rawMax - rawMin) * 0.06 || 5;
    const yMin = rawMin - yPad;
    const yMax = rawMax + yPad;
    const yRange = yMax - yMin;
    const n = bars.length;

    const xS = (i: number) => pL + (i / (n - 1)) * (W - pL - pR);
    const yS = (v: number) => pT + (1 - (v - yMin) / yRange) * (H - pT - pB);

    const entryIdx = period === "since" ? 0 : bars.findIndex((b) => b.date >= tradeDate);
    const entryY = yS(entryPricePence);
    const path = bars
      .map((b, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(b.close_pence).toFixed(1)}`)
      .join(" ");

    svgContent = (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <line x1={pL} y1={entryY} x2={W - pR} y2={entryY}
          stroke="#888" strokeWidth={0.75} strokeDasharray="3,3" opacity={0.35} />
        {entryIdx > 0 && (
          <line x1={xS(entryIdx)} y1={pT} x2={xS(entryIdx)} y2={H - pB}
            stroke="#888" strokeWidth={0.75} strokeDasharray="3,3" opacity={0.35} />
        )}
        <path d={path} fill="none" stroke={lineColor} strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round" />
        {entryIdx >= 0 && entryIdx < n && (
          <circle cx={xS(entryIdx)} cy={yS(bars[entryIdx].close_pence)}
            r={2.5} fill={lineColor} opacity={0.55} />
        )}
        <circle cx={xS(n - 1)} cy={yS(bars[n - 1].close_pence)} r={2.5} fill={lineColor} />
        <text x={pL} y={H - 4} fontSize={8} fill="#999">{bars[0].date.slice(5)}</text>
        <text x={W - pR} y={H - 4} fontSize={8} textAnchor="end" fill="#999">{bars[n - 1].date.slice(5)}</text>
      </svg>
    );
  }

  // Price legend values derived from the currently-visible bars
  const visiblePrices = bars.map((b) => b.close_pence);
  const periodHigh = visiblePrices.length ? Math.max(...visiblePrices) : null;
  const periodLow  = visiblePrices.length ? Math.min(...visiblePrices) : null;
  const nowPrice   = lastBar?.close_pence ?? null;
  const fmtP = (p: number) => `${p.toFixed(0)}p`;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header row */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] text-muted uppercase tracking-wider font-medium">
          {displayTicker}
        </span>
        {lastBar && (
          <span className={`text-[10px] font-semibold tabular-nums ${up ? upCls : downCls}`}>
            {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(1)}% since buy
          </span>
        )}
      </div>

      {/* Period toggles */}
      <div className="flex gap-1 shrink-0">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
              period === key
                ? "border-[#6b5038]/50 bg-[#6b5038]/10 text-[#6b5038] dark:text-[#a8804e]"
                : "border-black/10 dark:border-white/10 text-muted hover:border-[#6b5038]/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Price legend */}
      {nowPrice !== null && (
        <div className="flex items-center gap-3 shrink-0 border-t border-black/[0.07] dark:border-white/[0.07] pt-2">
          <span className="text-[10px] text-muted">
            Entry <span className="font-mono tabular-nums text-foreground/70">{fmtP(entryPricePence)}</span>
          </span>
          <span className="text-[10px] text-muted">
            Now <span className={`font-mono tabular-nums font-semibold ${up ? upCls : downCls}`}>{fmtP(nowPrice)}</span>
          </span>
          {periodHigh !== null && periodLow !== null && (
            <span className="text-[10px] text-muted ml-auto">
              <span className="font-mono tabular-nums">{fmtP(periodLow)}</span>
              <span className="opacity-40 mx-0.5">–</span>
              <span className="font-mono tabular-nums">{fmtP(periodHigh)}</span>
            </span>
          )}
        </div>
      )}

      {/* Chart fills remaining height */}
      <div className="flex-1 min-h-0">
        {bars.length >= 2 ? svgContent : (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-muted/50">
              {allBars.length === 0 ? "Loading chart…" : "No data for this period"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

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
                    ? "bg-[#1e6b18]/[0.12] text-[#1e6b18] dark:bg-[#5cd84a]/[0.15] dark:text-[#5cd84a]"
                    : "bg-[#8b2020]/[0.12] text-[#8b2020] dark:bg-[#e84d4d]/[0.15] dark:text-[#e84d4d]"
                  }`}
              >
                {ok ? "✓" : "✗"}
              </span>
              <span className={`text-sm ${ok ? "text-foreground" : "text-foreground/60"} relative group/tip inline-flex items-center gap-1.5 cursor-default`}>
                {label}
                <InfoIcon />
                <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-50
                  opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150
                  w-64 rounded-lg bg-[#1e1a16] dark:bg-[#e8e2da]
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

  const ftsePct =
    ftseEntry != null && ftseCurrent != null
      ? (ftseCurrent - ftseEntry) / ftseEntry
      : null;
  const alphaPct = ftsePct != null ? stockPct - ftsePct : null;
  const ahead = alphaPct != null && alphaPct >= 0;

  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
  const fmtPp = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pp`;

  const upText = "text-[#1e6b18] dark:text-[#5cd84a]";
  const downText = "text-[#8b2020] dark:text-[#e84d4d]";
  const upBg = "bg-[#1e6b18]/[0.12] dark:bg-[#5cd84a]/[0.12]";
  const downBg = "bg-[#8b2020]/[0.12] dark:bg-[#e84d4d]/[0.12]";

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Entry</div>
        <div className="text-2xl font-bold tabular-nums">{entry.toFixed(0)}p</div>
        <div className="text-xs text-muted mt-1">{fmtGbp(originalValue)}</div>
      </div>

      <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Now</div>
        <div className={`text-2xl font-bold tabular-nums ${up ? upText : downText}`}>
          {current.toFixed(0)}p
        </div>
        <div className="text-xs text-muted mt-1">{fmtGbp(currentValue)}</div>
      </div>

      <div className={`rounded-xl px-4 py-4 ${up ? upBg : downBg}`}>
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Return</div>
        <div className={`text-2xl font-bold tabular-nums ${up ? upText : downText}`}>
          {fmt(stockPct)}
        </div>
        <div className={`text-xs font-medium mt-1 opacity-70 ${up ? upText : downText}`}>
          {gainSign}{fmtGbp(gainLoss)}
        </div>
      </div>

      {ftsePct != null ? (
        <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-2">vs FTSE</div>
          <div className="text-2xl font-bold tabular-nums text-foreground/50">
            {fmt(ftsePct)}
          </div>
          {alphaPct != null && (
            <div className={`text-xs font-semibold mt-1 ${ahead ? upText : downText}`}>
              {fmtPp(alphaPct)} alpha
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-2">vs FTSE</div>
          <Skeleton className="h-8 w-20 mt-1" />
          <Skeleton className="h-3 w-16 mt-2" />
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
                <h1 className="text-3xl font-bold leading-tight tracking-tight">{company}</h1>

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
                    ftseEntry={ftseEntryPence}
                    ftseCurrent={ftseCurrentPence}
                  />
                )}

                <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4 h-72">
                  <MiniPriceChart
                    ticker={dealing.ticker}
                    tradeDate={dealing.trade_date.slice(0, 10)}
                    entryPricePence={dealing.price_pence}
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
