// Pure reconciler for the three numeric trade fields (shares, price_pence,
// value_gbp). The LLM extraction is mostly correct but occasionally returns
// values that are off by 10× (decimal shift, e.g. "40.5p" -> 405) or 100×
// (pence/pounds confusion). Earlier defenses lived inline in extract.ts and
// scrape.ts and could undo each other (extract divided price by 100 to match
// value/shares; scrape multiplied it back to match market) while never
// touching the shares field. This centralises the logic and adds 10× snaps.
//
// When the dealing is denominated in EUR or USD (Greek/Irish dual-listings
// like MTLN/KYGA, or US-listed names with an LSE listing like IPC), the LLM
// is told to leave price_pence and value_gbp at 0 and capture price_native +
// currency instead. We FX-convert to GBP here, before the snap pass, so the
// rest of the row (id hash, downstream display) operates on canonical GBP
// figures. The trade-date FX rate comes from fx_rates / fx_rates_eur via
// nearestPriorRate (Frankfurter is weekday-only, so weekend trade dates fall
// back to the most recent prior business day).

import type { DealingCurrency } from "./extract";

export interface ReconcileInput {
  shares: number;
  price_pence: number;
  value_gbp: number;
  /** Currency from the LLM; defaults to GBP for legacy / cached extractions. */
  currency?: DealingCurrency;
  /** Native-unit price per share (£, €, $). Required for non-GBP rows. */
  price_native?: number;
  /**
   * GBP-per-native-unit FX rate for the trade date. Resolved by the caller
   * from fx_rates (USD) or fx_rates_eur (EUR) with nearestPriorRate. Required
   * when currency != "GBP"; ignored otherwise. Caller logs the date fallback.
   */
  fx_gbp_per_native?: number;
  /** Market close on or before the trade date — independent ground truth. */
  market_price_pence?: number;
}

export interface ReconcileResult {
  shares: number;
  price_pence: number;
  value_gbp: number;
  /** Human-readable log of corrections, for pipeline observability. */
  changes: string[];
  /**
   * Set when, after FX + snap, price_pence is still >50× off the market
   * close on the trade date. Indicates the row is structurally wrong (a
   * placing at par value, a missed FX rate, an extraction error nothing
   * else caught) and should be hidden from default API responses. Caller
   * persists this into dealings.quarantine_reason; getDealings filters
   * `WHERE quarantine_reason IS NULL` by default.
   */
  quarantine_reason?: string;
}

const SNAP_FACTORS = [0.01, 0.1, 1, 10, 100];
// Only snap when the current value is >2× off from the anchor — leaves real
// intraday premium/discount on illiquid trades alone.
const SNAP_TRIGGER = 2;
// Snapped candidate must be within 20% of the anchor to be accepted; if no
// candidate qualifies, leave the field untouched rather than guess.
const SNAP_ACCEPT = 1.2;
// Quarantine threshold — when price_pence after snap is still this far off
// market, the row is structurally wrong and should be hidden. Real volatility
// on illiquid micro-caps tops out around 5-10× over short windows; 50×
// catches placings (RBD-shape) and missed FX without false-positive on
// anything legitimate. Same threshold as the cacheBars cross-fetch guard.
const QUARANTINE_RATIO = 50;

export function reconcileTradeFields(input: ReconcileInput): ReconcileResult {
  let { shares, price_pence, value_gbp } = input;
  const market = input.market_price_pence;
  const changes: string[] = [];
  const currency = input.currency ?? "GBP";

  // Step 0: FX conversion for non-GBP rows. The LLM left price_pence and
  // value_gbp at 0; we recompute both from price_native × fx. value_gbp comes
  // from price × shares rather than the LLM's native total because the
  // separate-aggregate field is the one most prone to decimal-shift errors
  // (observed on IPC.L: $313,009 stored as 31300.9). Trusting price × shares
  // also keeps value_gbp consistent with the post-snap shares figure below.
  if (currency !== "GBP") {
    const fx = input.fx_gbp_per_native;
    const native = input.price_native;
    if (fx && fx > 0 && native && native > 0) {
      const newPrice = native * fx * 100; // pence-equivalent
      const newValue = (newPrice * shares) / 100;
      changes.push(
        `fx ${currency} ${native} × ${fx.toFixed(6)} -> price ${newPrice.toFixed(4)}p, value £${newValue.toFixed(2)}`,
      );
      price_pence = newPrice;
      value_gbp = newValue;
    } else {
      changes.push(
        `fx skipped: currency=${currency}, native=${native ?? "null"}, fx=${fx ?? "null"} — leaving raw LLM fields, expect quarantine`,
      );
    }
  }

  // Step 1: anchor price. Market close is preferred (independent of the LLM
  // and the rest of the row); fall back to value/shares when prices for the
  // ticker haven't been ingested yet.
  const priceAnchor =
    market && market > 0
      ? { value: market, label: `market ${market}p` }
      : value_gbp > 0 && shares > 0
        ? {
            value: (value_gbp * 100) / shares,
            label: `value/shares ${((value_gbp * 100) / shares).toFixed(2)}p`,
          }
        : null;

  if (
    priceAnchor &&
    price_pence > 0 &&
    ratio(price_pence, priceAnchor.value) > SNAP_TRIGGER
  ) {
    const best = pickBestSnap(price_pence, priceAnchor.value);
    if (best && best.factor !== 1) {
      changes.push(
        `price ${price_pence}p -> ${best.value}p (×${best.factor}, ${priceAnchor.label})`,
      );
      price_pence = best.value;
    }
  }

  // Step 2 (early): when value_gbp lands below the £5k FCA/DTR disclosure
  // threshold but shares × price / 100 falls in the typical director-RNS
  // range (£5k–£10M), the LLM has dropped a ×100 or ×10 from value during
  // extraction. Recompute value from shares × price — leaves shares and
  // price untouched, so the dealing id (hash of those fields) stays stable
  // and no FK migration is needed downstream. Only fires when there's a
  // clear discrepancy (>2×) between computed and stored value.
  const PLAUSIBLE_MIN = 5_000;
  const PLAUSIBLE_MAX = 10_000_000;
  if (shares > 0 && price_pence > 0 && value_gbp > 0) {
    const computed = (shares * price_pence) / 100;
    if (
      value_gbp < PLAUSIBLE_MIN &&
      computed >= PLAUSIBLE_MIN &&
      computed <= PLAUSIBLE_MAX &&
      ratio(computed, value_gbp) > SNAP_TRIGGER
    ) {
      changes.push(
        `value £${value_gbp} -> £${computed.toFixed(2)} (recomputed from shares×price; LLM value below £${PLAUSIBLE_MIN} threshold)`,
      );
      value_gbp = computed;
    }
  }

  // Step 3: with price market-anchored, snap shares to value/price.
  //
  // Strict precondition: only snap shares when the price was actually
  // corrected against the market in step 1. Otherwise we can't tell whether
  // shares or value_gbp is the unreliable field — both are LLM-extracted from
  // the same RNS document, and either can drop a decimal. The dry-run on the
  // initial dataset surfaced ~13 rows where the LLM's value_gbp had lost a
  // ×100 factor (e.g. AAL.L value=£180 against an obvious £18k trade); a
  // value-trusting snap there would have collapsed shares to 8 and corrupted
  // the row. Holding fire when there's no market signal leaves those rows
  // visibly inconsistent (downstream display can guard) instead of silently
  // wrong.
  const priceWasSnapped = changes.some((c) => c.startsWith("price "));
  if (
    priceWasSnapped &&
    market &&
    market > 0 &&
    price_pence > 0 &&
    value_gbp > 0 &&
    shares > 0
  ) {
    const impliedShares = (value_gbp * 100) / price_pence;
    if (ratio(shares, impliedShares) > SNAP_TRIGGER) {
      const best = pickBestSnap(shares, impliedShares);
      if (best && best.factor !== 1) {
        const snapped = Math.round(best.value);
        changes.push(
          `shares ${shares} -> ${snapped} (×${best.factor}, implied ${Math.round(impliedShares)})`,
        );
        shares = snapped;
      }
    }
  }

  // Step 4: quarantine check. If we have a market anchor and price_pence
  // is still wildly off after every snap had a chance to run, the row is
  // structurally wrong (most commonly: a placing at par value misclassified
  // as open_market_buy — see RBD.L 75M shares @ 0.1p). Flag it; the API
  // layer hides flagged rows from default responses.
  let quarantine_reason: string | undefined;
  if (market && market > 0 && price_pence > 0) {
    const r = ratio(price_pence, market);
    if (r > QUARANTINE_RATIO) {
      quarantine_reason = `price ${price_pence.toFixed(4)}p is ${r.toFixed(0)}× off market ${market}p — possible placing or extraction error`;
      changes.push(`quarantine: ${quarantine_reason}`);
    }
  }

  return { shares, price_pence, value_gbp, changes, quarantine_reason };
}

function ratio(a: number, b: number): number {
  if (a <= 0 || b <= 0) return Infinity;
  return Math.max(a, b) / Math.min(a, b);
}

function pickBestSnap(
  value: number,
  target: number,
): { value: number; factor: number } | null {
  let best: { value: number; factor: number; r: number } | null = null;
  for (const factor of SNAP_FACTORS) {
    const candidate = value * factor;
    const r = ratio(candidate, target);
    if (!best || r < best.r) best = { value: candidate, factor, r };
  }
  if (best && best.r < SNAP_ACCEPT)
    return { value: best.value, factor: best.factor };
  return null;
}
