import type { PriceFormat } from "@/components/position-card";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

type Period = "since" | "ytd" | "max";

const PERIODS: { key: Period; label: string }[] = [
  { key: "since", label: "Since entry" },
  { key: "ytd", label: "YTD" },
  { key: "max", label: "Max" },
];

/** Inline price chart for one dealing. Generalised from the UK pence-flavoured
 *  component — fetches via /api/prices/history (which Yahoo backs for both
 *  LSE pence and US dollars), then renders period-toggled SVG.
 *
 *  The API returns numbers as `close_pence` regardless of the security's quote
 *  currency; this component reads them as quote-unit numbers and lets the
 *  PriceFormat bundle decide how to render them. Caller passes `tickerForApi`
 *  (what to send to /api/prices/history — e.g. "TSCO.L" or "AAPL") and
 *  `tickerForDisplay` (what to show in the header — e.g. "TSCO" or "AAPL").
 */
export function MiniPriceChart({
  tickerForApi,
  tickerForDisplay,
  tradeDate,
  entryPrice,
  fmt,
  normalizeClose,
}: {
  tickerForApi: string;
  tickerForDisplay: string;
  tradeDate: string;
  /** Per-share quote price on the trade date — must be in the same unit
   *  the chart will render closes in (after `normalizeClose`). */
  entryPrice: number;
  fmt: PriceFormat;
  /** Map a raw `close_pence` API value to the rendered quote unit. UK
   *  defaults to identity (prices are already pence and match the dealing's
   *  `price_pence`). US passes `(n) => n / 100` because Yahoo's USD bars
   *  land as cents in the prices table while Form 4's `price` is in
   *  major-dollars. Mismatched units make the chart squish the line
   *  against the top of the y-axis. */
  normalizeClose?: (closePence: number, date: string) => number | null;
}) {
  const [period, setPeriod] = useState<Period>("since");
  const [allBars, setAllBars] = useState<{ date: string; close: number }[]>([]);
  const normalize = normalizeClose ?? ((n: number) => n);

  useEffect(() => {
    if (!tickerForApi) {
      setAllBars([]);

      return;
    }
    setAllBars([]);
    api
      .priceHistory(tickerForApi, 365)
      .then((bars) =>
        setAllBars(
          bars
            .map((b) => ({
              date: b.date,
              close: normalize(b.close_pence, b.date),
            }))
            .filter(
              (b): b is { date: string; close: number } => b.close != null,
            ),
        ),
      )
      .catch(() => {});
    // normalize is intentionally not in deps — it's a stable per-market
    // function and changing it would trigger a refetch unnecessarily.
  }, [tickerForApi]);

  const bars = useMemo(() => {
    if (period === "since") return allBars.filter((b) => b.date >= tradeDate);
    if (period === "ytd")
      return allBars.filter(
        (b) => b.date >= `${new Date().getFullYear()}-01-01`,
      );

    return allBars;
  }, [allBars, period, tradeDate]);

  const lastBar = allBars[allBars.length - 1];
  const up = lastBar ? lastBar.close >= entryPrice : true;
  const returnPct = lastBar
    ? ((lastBar.close - entryPrice) / entryPrice) * 100
    : 0;

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const lineColor = up
    ? isDark
      ? "#5cd84a"
      : "#1e6b18"
    : isDark
      ? "#e84d4d"
      : "#8b2020";
  const upCls = "text-[#1e6b18] dark:text-[#5cd84a]";
  const downCls = "text-[#8b2020] dark:text-[#e84d4d]";

  const W = 240,
    H = 160;
  const pL = 2,
    pR = 2,
    pT = 8,
    pB = 18;

  let svgContent: React.ReactNode = null;

  if (bars.length >= 2) {
    const prices = bars.map((b) => b.close);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    // On "since entry", fold the entry price into the Y-bounds so the line's
    // slope reads as gain/loss against the buy, not just the period's local
    // low→high. Matches the iOS MiniPriceChart.
    const minP = period === "since" ? Math.min(rawMin, entryPrice) : rawMin;
    const maxP = period === "since" ? Math.max(rawMax, entryPrice) : rawMax;
    const yPad = (maxP - minP) * 0.06 || 5;
    const yMin = minP - yPad;
    const yMax = maxP + yPad;
    const yRange = yMax - yMin;
    const n = bars.length;

    const xS = (i: number) => pL + (i / (n - 1)) * (W - pL - pR);
    const yS = (v: number) => pT + (1 - (v - yMin) / yRange) * (H - pT - pB);

    const entryIdx =
      period === "since" ? 0 : bars.findIndex((b) => b.date >= tradeDate);
    const entryY = yS(entryPrice);
    const path = bars
      .map(
        (b, i) =>
          `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(b.close).toFixed(1)}`,
      )
      .join(" ");

    svgContent = (
      <svg
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block" }}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
      >
        <line
          opacity={0.35}
          stroke="#888"
          strokeDasharray="3,3"
          strokeWidth={0.75}
          x1={pL}
          x2={W - pR}
          y1={entryY}
          y2={entryY}
        />
        {entryIdx > 0 && (
          <line
            opacity={0.35}
            stroke="#888"
            strokeDasharray="3,3"
            strokeWidth={0.75}
            x1={xS(entryIdx)}
            x2={xS(entryIdx)}
            y1={pT}
            y2={H - pB}
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
        {entryIdx >= 0 && entryIdx < n && (
          <circle
            cx={xS(entryIdx)}
            cy={yS(bars[entryIdx].close)}
            fill={lineColor}
            opacity={0.55}
            r={2.5}
          />
        )}
        <circle
          cx={xS(n - 1)}
          cy={yS(bars[n - 1].close)}
          fill={lineColor}
          r={2.5}
        />
        <text fill="#999" fontSize={8} x={pL} y={H - 4}>
          {bars[0].date.slice(5)}
        </text>
        <text fill="#999" fontSize={8} textAnchor="end" x={W - pR} y={H - 4}>
          {bars[n - 1].date.slice(5)}
        </text>
      </svg>
    );
  }

  const visiblePrices = bars.map((b) => b.close);
  const periodHigh = visiblePrices.length ? Math.max(...visiblePrices) : null;
  const periodLow = visiblePrices.length ? Math.min(...visiblePrices) : null;
  const nowPrice = lastBar?.close ?? null;

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] text-muted uppercase tracking-wider font-medium">
          {tickerForDisplay}
        </span>
        {lastBar && (
          <span
            className={`text-[10px] font-semibold tabular-nums ${up ? upCls : downCls}`}
          >
            {returnPct >= 0 ? "+" : ""}
            {returnPct.toFixed(1)}% since buy
          </span>
        )}
      </div>

      <div className="flex gap-1 shrink-0">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
              period === key
                ? "border-[#6b5038]/50 bg-[#6b5038]/10 text-[#6b5038] dark:text-[#a8804e]"
                : "border-black/10 dark:border-white/10 text-muted hover:border-[#6b5038]/30"
            }`}
            onClick={() => setPeriod(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {nowPrice !== null && (
        <div className="flex items-center gap-3 shrink-0 border-t border-black/[0.07] dark:border-white/[0.07] pt-2">
          <span className="text-[10px] text-muted">
            Entry{" "}
            <span className="font-mono tabular-nums text-foreground/70">
              {fmt.formatPrice(entryPrice)}
            </span>
          </span>
          <span className="text-[10px] text-muted">
            Now{" "}
            <span
              className={`font-mono tabular-nums font-semibold ${up ? upCls : downCls}`}
            >
              {fmt.formatPrice(nowPrice)}
            </span>
          </span>
          {periodHigh !== null && periodLow !== null && (
            <span className="text-[10px] text-muted ml-auto">
              <span className="font-mono tabular-nums">
                {fmt.formatPrice(periodLow)}
              </span>
              <span className="opacity-40 mx-0.5">–</span>
              <span className="font-mono tabular-nums">
                {fmt.formatPrice(periodHigh)}
              </span>
            </span>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {bars.length >= 2 ? (
          svgContent
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-muted/50">
              {allBars.length === 0
                ? "Loading chart…"
                : "No data for this period"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
