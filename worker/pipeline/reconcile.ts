// Pure reconciler for the three numeric trade fields (shares, price_pence,
// value_gbp). The LLM extraction is mostly correct but occasionally returns
// values that are off by 10× (decimal shift, e.g. "40.5p" -> 405) or 100×
// (pence/pounds confusion). Earlier defenses lived inline in extract.ts and
// scrape.ts and could undo each other (extract divided price by 100 to match
// value/shares; scrape multiplied it back to match market) while never
// touching the shares field. This centralises the logic and adds 10× snaps.

export interface ReconcileInput {
  shares: number;
  price_pence: number;
  value_gbp: number;
  /** Market close on or before the trade date — independent ground truth. */
  market_price_pence?: number;
}

export interface ReconcileResult {
  shares: number;
  price_pence: number;
  value_gbp: number;
  /** Human-readable log of corrections, for pipeline observability. */
  changes: string[];
}

const SNAP_FACTORS = [0.01, 0.1, 1, 10, 100];
// Only snap when the current value is >2× off from the anchor — leaves real
// intraday premium/discount on illiquid trades alone.
const SNAP_TRIGGER = 2;
// Snapped candidate must be within 20% of the anchor to be accepted; if no
// candidate qualifies, leave the field untouched rather than guess.
const SNAP_ACCEPT = 1.2;

export function reconcileTradeFields(input: ReconcileInput): ReconcileResult {
  let { shares, price_pence, value_gbp } = input;
  const market = input.market_price_pence;
  const changes: string[] = [];

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

  return { shares, price_pence, value_gbp, changes };
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
