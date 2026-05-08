# dd-site: money-handling fixes — response to iOS audit

A reply to the iOS team's audit note. Reads top-to-bottom; no prior context required.

## TL;DR

Three fixes in flight, in this order:

1. **cacheBars cross-fetch unit guard** (uncommitted, ready to ship) — protects the prices table from Yahoo unit-confusion across separate fetches.
2. **Currency-aware extraction** — root cause of MTLN.L / IPC.L. Adds currency capture in the extractor and FX conversion in the reconciler. Two known rows backfilled the day it deploys.
3. **Quarantine flag for unfixable rows** — catches RBD-shaped cases where the dealing data is internally consistent but ~1000× off market. Hides them from default API responses.

A fourth fix (placing-aware extractor) and two follow-ups (corporate actions, USD branch audit) are deferred — see "Deferred" at the bottom.

## What we agree on

The iOS audit identified three classes of money-handling problems:

- **Cross-fetch price-scale drift** in the `prices` table (RBD.L bars stored at two different scales).
- **Currency mishandling at extraction** (MTLN.L EUR, IPC.L USD).
- **Returns showing nonsense for some rows** (RBD.L position card displaying +90,150%).

The defensive `value × (1 + (current − entry)/entry)` pattern in PositionCard is the right client-side stance — it keeps the two cells consistent even when the row is wrong. Web and Android should adopt it. None of the server fixes below remove the need for it; clients should always be defensive against bad rows.

## What we corrected after investigating

Two diagnoses in the audit don't survive contact with the source data. Calling them out so we don't build solutions for problems we don't have.

### "RBD.L did a share consolidation" — no, it didn't

The RBD.L RNS for the dealing in question (`d-56fd372fc8ff969e`, 2026-04-23) literally says:

> "...75,000,000 new ordinary shares of 0.1p each, raising £75,000 in gross proceeds, **subject to shareholder approval**..."

That is a **placing at par value**, not an open-market buy and not a corporate action. Yahoo's daily bars for RBD.L show:
- April 2024: 68–78p
- April 2026 (around the trade date): 35–40p
- Current: ~90p

No split events in Yahoo's `events.splits` data either. The 0.1p in the dealing record is the par-value subscription price, not pre-consolidation pricing. The dealing record is correct *for a placing*; the pipeline simply mis-classified it as `open_market_buy`. iOS sees 0.1p as the entry price and ~110p as the current price and computes a +110,000% return.

This means the iOS audit's "Issue 3 — share consolidation handling" doesn't exist as a distinct problem. The fix is **placing-aware extraction** (Phase 3 below), and in the interim, **quarantining** rows whose entry price is wildly off market (Phase 2 below). A separate corporate-actions table is over-engineered for the data we actually have.

### "USD branch in `prices.ts` is dead / dangerous"

Likely true but uncertain. URTH bars in production are stored as raw USD (~150-200), not pence-equivalents (~14000), which suggests the USD path either never executes or was added after URTH was last ingested. Worth a 30-minute log-and-look (Phase 5) before deciding to delete or repair.

### "Reconcile is the place to detect EUR/USD"

The audit suggests fixing currency handling in `extract.ts` and `reconcile.ts`. Closer look: `extract.ts` has no currency awareness at all (the LLM is told to convert £ to pence and emit `price_pence`, with no provision for non-GBP). The right structural fix is to extend the LLM contract — capture currency at extract time, do FX in reconcile. Both files change. See Phase 1.

## The fixes

### Phase 0 — cacheBars cross-fetch unit guard

**Status:** code written, uncommitted on `main`. See `worker/pipeline/prices.ts:148-182`.

**What it does:** when caching incoming Yahoo bars, reads the most recent stored bar for the ticker and rejects any incoming bar whose price is more than 50× off either way. Logs the rejection. Real stocks don't move 50× overnight without a corporate action.

**Refinement before merge:** if 5+ consecutive bars are rejected, also log a `prices: ${ticker} anchor possibly poisoned (session ${id})` warning. The guard depends on the most recent stored bar being correct; if that bar is itself bad (the failure mode the guard exists to prevent), the guard will silently reject every legitimate incoming bar. The warning makes a stuck cache visible.

`session ${id}` is a per-call short random ID generated at the top of `cacheBars`. cacheBars is called from many entry points (pipeline run, `/__refresh-prices`, `/api/prices/history`, `/api/prices/latest`, performance refresh) and a poisoned anchor split across two of them otherwise looks like two unrelated quiet warnings. Aggregating by session ID makes the incident a single line in log search. Operator response is the existing `/__purge-prices` + `/__refresh-prices` two-step.

**Ship plan:** commit, deploy, monitor logs for a week. Should be quiet in normal operation — splits/consolidations under 50× would still pass through cleanly.

### Phase 1 — currency-aware extraction

**The root cause** of MTLN.L and IPC.L. Without this, every new EUR/USD-denominated PDMR notice produces another bad row.

**1a. Prompt:** `worker/llm/prompts.ts EXTRACT_PROMPT` gains `currency` (`"GBP" | "GBp" | "EUR" | "USD"`) and `price_native` (the price in the native unit, unconverted) fields. Haiku is instructed to set `price_pence` and `value_gbp` to `0` when currency != GBP, and to never invent an FX rate.

**1b. Type:** `worker/pipeline/extract.ts ExtractedDealing` gains:
```ts
currency: "GBP" | "EUR" | "USD";
price_native: number;
```
The parser defaults `currency` to `"GBP"` when absent so the existing extraction cache (`extractions` table) keeps working.

**1c. Reconcile:** `worker/pipeline/reconcile.ts` runs an FX-conversion step *before* the existing snap pass when `currency != "GBP"`:
- Look up `nearestPriorRate` from `fx_rates` (USD) or `fx_rates_eur` (EUR) for the trade date.
- Convert `price_native` → `price_pence`, native total → `value_gbp`.
- Log the conversion in `changes[]` (also logs when the rate falls back to a prior date — Frankfurter is weekday-only).
- Then run the existing snap pass for any residual decimal errors.

**FX miss policy:** use `nearestPriorRate` and log. Don't reject the row. Don't trigger a new Frankfurter fetch in the scrape path — `getEurGbpRates` / `getUsdGbpRates` already handle population.

**1d. Schema (Migration 010):**
```sql
ALTER TABLE dealings ADD COLUMN currency TEXT NOT NULL DEFAULT 'GBP';
ALTER TABLE dealings ADD COLUMN price_native REAL;   -- nullable; unused for legacy GBP rows
```
`currency` is `NOT NULL DEFAULT 'GBP'` rather than nullable so that `WHERE currency = 'GBP'` and `WHERE currency != 'GBP'` both behave correctly without `IS NULL` ceremony — legacy rows backfill to `'GBP'` automatically as part of the `ALTER`. `price_native` stays nullable since it's genuinely unused for GBP rows.

`price_pence` and `value_gbp` stay as the canonical GBP-equivalent fields. No client-side breaking change. The native columns are observability — they make wrong rows debuggable from the API alone, without re-fetching the RNS, and feed the iOS detail-view native-amount display (see "API surface" below).

**1e. Backfill the two known rows** the day it deploys:

```bash
# MTLN.L: 10,000 shares @ €36.7450, FX-converted at 2026-05-05
curl -X POST "https://api.ddbx.uk/__fix-dealing?id=d-2e20100f83135179&shares=10000&price_pence=<EUR→GBp>&value_gbp=<EUR→GBP>"

# IPC.L: 10,000 shares @ $31.3009, FX-converted at 2026-05-01
curl -X POST "https://api.ddbx.uk/__fix-dealing?id=d-4bd1ab9319be4309&shares=10000&price_pence=<USD→GBp>&value_gbp=<USD→GBP>"

# Re-run Opus analysis so the text doesn't quote the wrong £ figures
curl -X POST "https://api.ddbx.uk/__reanalyze?ids=d-2e20100f83135179,d-4bd1ab9319be4309"
```

Exact converted figures will be filled in at apply time using the rate from `fx_rates` / `fx_rates_eur` for the trade date.

### Phase 2 — quarantine flag for unfixable rows

The reconciler bailed correctly on RBD.L: no clean ×N snap brings 0.1p within 20% of market. Problem: the row got committed anyway, and downstream readers compute returns against bad data.

**2a. Schema (Migration 011):**
```sql
ALTER TABLE dealings ADD COLUMN quarantine_reason TEXT;  -- NULL = healthy, set = hidden
```

**2b. Reconcile:** when `market_price_pence > 0` and the residual ratio after snap+FX is **>50×** either way, set `quarantine_reason = "price ${X}× off market ${Y}p — possible placing or extraction error"`. The row is still committed (preserves history) but flagged.

**2c. API:** `getDealings` defaults to `WHERE quarantine_reason IS NULL`. New query param `?include_quarantined=1` for ops/audit tooling.

**2d. One-time audit:**
```sql
SELECT d.id, d.ticker, d.trade_date, d.price_pence,
       (SELECT close_pence FROM prices p
          WHERE p.ticker = d.ticker AND p.date <= d.trade_date
          ORDER BY p.date DESC LIMIT 1) AS market_at_trade,
       (SELECT close_pence FROM prices p
          WHERE p.ticker = d.ticker
          ORDER BY p.date DESC LIMIT 1) AS market_now
  FROM dealings d
 WHERE d.price_pence > 0
   AND ABS(LOG10(market_now / d.price_pence)) > 1.7;  -- ratio >50× either way
```

We surface the count first, eyeball the rows, then bulk-set `quarantine_reason` for the matches. RBD.L (`d-56fd372fc8ff969e`) is one. Expect a handful more — small-cap placings and IPO subscriptions are the typical shape.

### Phase 3 (deferred until Phases 0-2 ship) — placing-aware extraction

The deeper fix for RBD-shaped rows. Updates `EXTRACT_PROMPT` with explicit negative examples:

> If the announcement says "placing", "subscription", "issue of new ordinary shares", or "subject to shareholder approval", `is_open_market_buy` is FALSE, even if the PDMR is the buyer. These are primary-market subscriptions, not on-exchange purchases.

**Pre-flight grading before flushing the cache.** Small-cap RNS texts cross-reference each other constantly ("following our recent placing announced on..."), so a naive prompt change risks false-positive demotions of legitimate open-market buys. Grade the new prompt against a held-out set before invalidating cached extractions:

1. Pull 30 random rows where `is_open_market_buy = 1` from the past 60 days.
2. Hand-confirm none are actually placings.
3. Run the new prompt against their cached RNS HTML.
4. Accept the prompt only if it still classifies all 30 correctly.

If grading fails, tune the prompt (require "placing" *plus* "new ordinary shares" co-occurrence in the transaction-details block, not just anywhere in the document) and re-grade.

Once the prompt is graded, invalidate the cached extractions for known placings:

```sql
DELETE FROM extractions WHERE url IN (
  'https://www.investegate.co.uk/announcement/rns/reabold-resources--rbd/director-pdmr-shareholding/9535823'
);
```

Re-run `/__cron/run`. RBD.L gets re-extracted, recognised as a placing, and dropped before reaching the dealings table.

Phase 2 quarantine already protects iOS from RBD-shaped rows even if Phase 3 slips or a placing slips through the new prompt, so this is genuinely deferrable.

### Phase 5 (30 min) — URTH USD branch audit

Add a `console.log` of `currency` and `regularMarketPrice` to `fetchDailyBars` for every non-`^` ticker. Deploy, watch one full pipeline run.

- If the `currency === "USD"` branch is dead (Yahoo always returns `GBp` even for ADR-like listings), delete `worker/pipeline/prices.ts:87-107`.
- If it's live, the existing `c * fx * 100` is correct and any stale URTH bars in the DB pre-date that branch — purge + refresh.

## Deferred

### Corporate actions handling

No confirmed corporate-action-driven misreads in the audited dataset (RBD.L is a placing, not a split). If the Phase 2 monthly audit surfaces real splits, the cleanest fix is to ingest Yahoo's `events.splits` array (already returned in the chart payload — confirmed via probe) into a `corporate_actions(ticker, effective_date, factor)` table and apply the cumulative factor to `dealing.price_pence` at read time in `getDealings`.

We're not using Yahoo's `adjclose` because it conflates split adjustments with dividend reinvestment, and the value would change retroactively as new dividends accrue.

### iOS / Android / web defensive math

iOS already does `value_gbp × (1 + stockPct)` in PositionCard so the gain% and gain£ cells stay consistent even when `shares × price ≠ value_gbp`. Android and web should mirror this in their position cards. Independent of any server fix — server data should always be correct, but defensive clients are cheap insurance.

## Order of operations

| Phase | Risk | Effort | Unblocks |
|---|---|---|---|
| 0 — cacheBars guard | low | 1h | Prevents new RBD-prices-shaped corruption |
| 1 — currency-aware extraction | medium | ~1d | Prevents new MTLN/IPC-shaped rows; fixes the two known |
| 2 — quarantine flag | low | half-day | Hides RBD-shaped rows from iOS today |
| 3 — placing-aware extractor | low | 1h + cache flush | Removes RBD-shaped rows at the source |
| 5 — URTH audit | trivial | 30m | Cleans up dead/dangerous code |

Phases 0-2 ship the same week. Phase 3 within the following sprint. Phase 5 whenever convenient.

## API surface (decided with iOS)

- **Quarantined rows:** server-side filter only. `/api/dealings` and `/api/dealings/:id` return `WHERE quarantine_reason IS NULL` by default; quarantined rows simply don't appear. No banner, no "data verification pending" UI. Power users noticing missing rows is a better failure mode than wrong-numbers-with-caveats. `?include_quarantined=1` is for ops/audit only.
- **Native amounts on detail view:** `/api/dealings/:id` exposes `currency` and `price_native` once Migration 010 is live. iOS detail view will render both alongside the GBP canonical (e.g. `Entry: 3,160p €36.7450 (≈ £316,000)`); when `currency = "GBP"` the native row is suppressed.
- **Native amounts on list view:** `/api/dealings` exposes `currency` only (not `price_native`) so the dashboard can show a small currency tick on non-GBP rows. Deferred — ship after detail-view consumption is clean.

## Followups outside this work item

- **Yahoo-unresolvable tickers** flagged in the iOS audit (`EO.P.L` ×2, `ZNT.L`, `QQ..L`) are a ticker-normalisation issue, not a money-math one. The `..` and `.P.` shapes look like depository-receipt or ETP variants that `normaliseTicker` in `worker/pipeline/scrape.ts:233` doesn't handle. Worth a separate look but not on this plan's critical path.
