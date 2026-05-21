import { Skeleton } from "@/components/skeleton";

/** Market-agnostic price formatting bundle. Each market supplies one of these
 *  so the component can render quote prices, domestic-currency values, and
 *  multiply quote units → domestic units (pence → GBP = 0.01, USD → USD = 1). */
export interface PriceFormat {
  formatPrice: (n: number) => string;
  formatValue: (n: number) => string;
  quoteToValue: number;
  /** Optional Tailwind width class for the Value column in market row tables.
   *  Defaults to `w-24` when omitted; SEK widens it to fit the currency prefix
   *  + larger digit counts. */
  valueColumnClass?: string;
}

export interface BenchmarkProps {
  /** Quote-unit price on the trade date. */
  entry: number | null;
  /** Quote-unit price now. */
  current: number | null;
  label: string;
}

/** Position card: Entry / Now / Return, plus optional benchmark cell.
 *  Generalised from the UK pence/GBP-flavoured component — both markets
 *  feed it through a PriceFormat bundle. Internal consistency heuristic
 *  (shares × entry vs originalValue) preserved from UK.
 */
export function PositionCard({
  entry,
  current,
  shares,
  originalValue,
  fmt,
  benchmark,
}: {
  entry: number;
  current: number;
  shares: number;
  originalValue: number;
  fmt: PriceFormat;
  /** When provided, renders a 4th tile. Pass `{ entry: null, current: null }`
   *  to show a loading skeleton; omit the prop entirely to hide the tile. */
  benchmark?: BenchmarkProps;
}) {
  const stockPct = (current - entry) / entry;
  const up = stockPct >= 0;
  // When shares × entry disagrees with originalValue the row is internally
  // inconsistent — either shares is wrong or value is. Without an independent
  // signal, pick whichever side produces a plausible director-disclosure trade
  // size in the security's domestic currency (5k–10M majors). Otherwise fall
  // back to the reported share count rather than guess. The same band works
  // for both UK (GBP, post the 5k disclosure floor) and US (USD).
  const computedFromShares = shares * entry * fmt.quoteToValue;
  const sharesRatio =
    computedFromShares > 0 && originalValue > 0
      ? Math.max(computedFromShares, originalValue) /
        Math.min(computedFromShares, originalValue)
      : 1;
  const plausible = (v: number) => v >= 5_000 && v <= 10_000_000;
  const effectiveShares =
    sharesRatio < 1.05 || entry <= 0 || originalValue <= 0
      ? shares
      : plausible(originalValue) && !plausible(computedFromShares)
        ? originalValue / (entry * fmt.quoteToValue)
        : shares;
  const currentValue = effectiveShares * current * fmt.quoteToValue;
  const gainLoss = currentValue - originalValue;
  const gainSign = gainLoss >= 0 ? "+" : "";

  const benchmarkPct =
    benchmark?.entry != null && benchmark?.current != null
      ? (benchmark.current - benchmark.entry) / benchmark.entry
      : null;
  const alphaPct = benchmarkPct != null ? stockPct - benchmarkPct : null;
  const ahead = alphaPct != null && alphaPct >= 0;

  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
  const fmtPp = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pp`;

  const upText = "text-[#1e6b18] dark:text-[#5cd84a]";
  const downText = "text-[#8b2020] dark:text-[#e84d4d]";
  const upBg = "bg-[#1e6b18]/[0.12] dark:bg-[#5cd84a]/[0.12]";
  const downBg = "bg-[#8b2020]/[0.12] dark:bg-[#e84d4d]/[0.12]";

  const cols = benchmark ? "sm:grid-cols-4" : "sm:grid-cols-3";

  return (
    <div className={`grid gap-3 grid-cols-2 ${cols}`}>
      <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">
          Entry
        </div>
        <div className="text-2xl font-bold tabular-nums">
          {fmt.formatPrice(entry)}
        </div>
        <div className="text-xs text-muted mt-1">
          {fmt.formatValue(originalValue)}
        </div>
      </div>

      <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">
          Now
        </div>
        <div
          className={`text-2xl font-bold tabular-nums ${up ? upText : downText}`}
        >
          {fmt.formatPrice(current)}
        </div>
        <div className="text-xs text-muted mt-1">
          {fmt.formatValue(currentValue)}
        </div>
      </div>

      <div className={`rounded-xl px-4 py-4 ${up ? upBg : downBg}`}>
        <div className="text-[10px] text-muted uppercase tracking-wider mb-2">
          Return
        </div>
        <div
          className={`text-2xl font-bold tabular-nums ${up ? upText : downText}`}
        >
          {fmtPct(stockPct)}
        </div>
        <div
          className={`text-xs font-medium mt-1 opacity-70 ${up ? upText : downText}`}
        >
          {gainSign}
          {fmt.formatValue(gainLoss)}
        </div>
      </div>

      {benchmark &&
        (benchmarkPct != null ? (
          <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-2">
              vs {benchmark.label}
            </div>
            <div className="text-2xl font-bold tabular-nums text-foreground/50">
              {fmtPct(benchmarkPct)}
            </div>
            {alphaPct != null && (
              <div
                className={`text-xs font-semibold mt-1 ${ahead ? upText : downText}`}
              >
                {fmtPp(alphaPct)} alpha
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-4 py-4">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-2">
              vs {benchmark.label}
            </div>
            <Skeleton className="h-8 w-20 mt-1" />
            <Skeleton className="h-3 w-16 mt-2" />
          </div>
        ))}
    </div>
  );
}
