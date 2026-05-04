import type { Env } from "../index";
import { cacheBars, fetchDailyBars } from "./prices";

const HORIZONS = [90, 180, 365, 730] as const;

interface DealingRow {
  id: string;
  ticker: string;
  trade_date: string;
  price_pence: number;
}

// Recompute return_pct for every historical dealing at each horizon, using
// cached prices. Backfills Yahoo price history for any ticker we haven't
// cached enough bars for.
export async function refreshPerformance(env: Env): Promise<{ updated: number }> {
  const dealings = await env.DB.prepare(
    `SELECT id, ticker, trade_date, price_pence FROM dealings`,
  ).all<DealingRow>();

  let updated = 0;
  const now = new Date();

  // Group tickers so we only hit Yahoo once per symbol.
  const byTicker = new Map<string, DealingRow[]>();
  for (const d of dealings.results) {
    const list = byTicker.get(d.ticker) ?? [];
    list.push(d);
    byTicker.set(d.ticker, list);
  }

  for (const [ticker, rows] of byTicker) {
    // Earliest trade date we care about — pull bars from slightly before that.
    const earliest = rows.reduce(
      (min, r) => (r.trade_date < min ? r.trade_date : min),
      rows[0].trade_date,
    );
    const from = new Date(earliest);
    from.setDate(from.getDate() - 10);
    const fromUnix = Math.floor(from.getTime() / 1000);
    const toUnix = Math.floor(now.getTime() / 1000);

    try {
      const bars = await fetchDailyBars(env, ticker, fromUnix, toUnix);
      await cacheBars(env, ticker, bars);
    } catch (err) {
      // Log & skip — one bad ticker shouldn't sink the whole refresh.
      console.error(`prices ${ticker}: ${(err as Error).message}`);
      continue;
    }

    for (const d of rows) {
      for (const h of HORIZONS) {
        const target = addDaysIso(d.trade_date, h);
        const close = await env.DB.prepare(
          `SELECT close_pence FROM prices
             WHERE ticker = ?1 AND date <= ?2
             ORDER BY date DESC LIMIT 1`,
        )
          .bind(ticker, target)
          .first<{ close_pence: number }>();
        if (!close) continue;
        // Only record once the horizon has actually elapsed — otherwise we'd
        // be reading today's price and calling it the 24-month return.
        const elapsedMs = now.getTime() - new Date(d.trade_date).getTime();
        if (elapsedMs < h * 86_400_000) continue;

        const ret = (close.close_pence - d.price_pence) / d.price_pence;
        await env.DB.prepare(
          `INSERT OR REPLACE INTO performance
             (dealing_id, horizon_days, return_pct, as_of_date)
           VALUES (?1, ?2, ?3, date('now'))`,
        )
          .bind(d.id, h, ret)
          .run();
        updated++;
      }
    }
  }

  // Also refresh the FTSE All-Share benchmark used by the portfolio page.
  // Pull from the earliest dealing date so the chart can render any FY.
  const earliestRow = await env.DB.prepare(
    `SELECT MIN(trade_date) AS d FROM dealings`,
  ).first<{ d: string | null }>();
  if (earliestRow?.d) {
    const from = new Date(earliestRow.d);
    from.setDate(from.getDate() - 10);
    try {
      const bars = await fetchDailyBars(
        env,
        "^FTAS",
        Math.floor(from.getTime() / 1000),
        Math.floor(now.getTime() / 1000),
      );
      await cacheBars(env, "^FTAS", bars);
    } catch (err) {
      console.error(`prices ^FTAS: ${(err as Error).message}`);
    }
  }

  return { updated };
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
