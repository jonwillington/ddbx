import type {
  FinancialYear,
  Portfolio,
  PortfolioPick,
  PortfolioPoint,
  Rating,
} from "./types";

const STAKE = 100; // £100 notional per pick
const BENCHMARK = "^FTAS"; // FTSE All-Share

// Returns the most recent price at or before `date` from a sorted price list.
function priceOn(
  prices: { date: string; close_pence: number }[],
  date: string,
): number | null {
  if (prices.length === 0) return null;
  let lo = 0;
  let hi = prices.length - 1;
  let result: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid].date <= date) {
      result = prices[mid].close_pence;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

// UK tax year: FY26 = 6 Apr 2026 → 5 Apr 2027.
function fyBounds(fy: number): { start: string; end: string } {
  const startYear = 2000 + fy;
  const start = `${startYear}-04-06`;
  const end = `${startYear + 1}-04-05`;
  return { start, end };
}

function currentFy(today: string): number {
  // today is YYYY-MM-DD
  const [y, m, d] = today.split("-").map(Number);
  // Before 6 April we're still in the previous FY.
  if (m < 4 || (m === 4 && d < 6)) return y - 2000 - 1;
  return y - 2000;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// Walk daily from `start` to `end` (inclusive), yielding ISO date strings.
function dailyRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export async function getPortfolio(
  db: D1Database,
  opts: { fy?: number } = {},
): Promise<Portfolio | null> {
  const today = isoToday();

  // ---- 1. Discover available financial years -----------------------------
  // Earliest interesting buy → list of FYs from there to current.
  const earliest = await db
    .prepare(
      `SELECT MIN(d.trade_date) AS d
         FROM dealings d
         JOIN analyses a ON a.dealing_id = d.id
        WHERE a.rating IN ('significant', 'noteworthy')
          AND d.tx_type = 'buy'`,
    )
    .first<{ d: string | null }>();

  if (!earliest?.d) return null;

  const earliestFy = currentFy(earliest.d);
  const nowFy = currentFy(today);
  const fy = opts.fy ?? nowFy;
  const { start: fyStart, end: fyEnd } = fyBounds(fy);

  // ---- 2. Picks in this FY ------------------------------------------------
  interface DealRow {
    id: string;
    trade_date: string;
    ticker: string;
    company: string;
    price_pence: number;
    rating: string;
  }
  const dealRows = await db
    .prepare(
      `SELECT d.id, d.trade_date, d.ticker, d.company, d.price_pence, a.rating
         FROM dealings d
         JOIN analyses a ON a.dealing_id = d.id
        WHERE a.rating IN ('significant', 'noteworthy')
          AND d.tx_type = 'buy'
          AND d.trade_date BETWEEN ?1 AND ?2
        ORDER BY d.trade_date`,
    )
    .bind(fyStart, fyEnd)
    .all<DealRow>();

  // ---- 3. Per-FY pick counts (for the selector chips) --------------------
  const fyCounts = await db
    .prepare(
      `SELECT d.trade_date FROM dealings d
         JOIN analyses a ON a.dealing_id = d.id
        WHERE a.rating IN ('significant', 'noteworthy')
          AND d.tx_type = 'buy'`,
    )
    .all<{ trade_date: string }>();

  const countsByFy = new Map<number, number>();
  for (const row of fyCounts.results) {
    const f = currentFy(row.trade_date);
    countsByFy.set(f, (countsByFy.get(f) ?? 0) + 1);
  }

  const availableFys: FinancialYear[] = [];
  for (let f = earliestFy; f <= nowFy; f++) {
    const b = fyBounds(f);
    availableFys.push({
      fy: f,
      start: b.start,
      end: b.end,
      in_progress: f === nowFy,
      picks_count: countsByFy.get(f) ?? 0,
    });
  }

  // Window end for curve walking — clamp to today if FY in progress.
  const windowEnd = fyEnd > today ? today : fyEnd;
  const windowStart = fyStart;
  const inProgress = fy === nowFy;

  // No picks in this FY — still return scaffolding so the page can render.
  if (dealRows.results.length === 0) {
    return {
      fy,
      fy_start: fyStart,
      fy_end: fyEnd,
      as_of: windowEnd,
      in_progress: inProgress,
      picks_curve: [],
      ftse_curve: [],
      picks_return_pct: 0,
      ftse_return_pct: 0,
      alpha_pp: 0,
      picks_count: 0,
      starting_value_gbp: 0,
      picks: [],
      available_fys: availableFys,
    };
  }

  // ---- 4. Pull price history for tickers + benchmark ---------------------
  const tickers = [...new Set(dealRows.results.map((d) => d.ticker))];
  const allTickers = [...tickers, BENCHMARK];
  const placeholders = allTickers.map((_, i) => `?${i + 1}`).join(",");

  const allPrices = await db
    .prepare(
      `SELECT ticker, date, close_pence
         FROM prices
        WHERE ticker IN (${placeholders})
        ORDER BY ticker, date`,
    )
    .bind(...allTickers)
    .all<{ ticker: string; date: string; close_pence: number }>();

  const priceMap = new Map<string, { date: string; close_pence: number }[]>();
  for (const p of allPrices.results) {
    const list = priceMap.get(p.ticker) ?? [];
    list.push({ date: p.date, close_pence: p.close_pence });
    priceMap.set(p.ticker, list);
  }

  // ---- 5. Picks portfolio curve (daily) -----------------------------------
  // Equal-weighted: every pick is £100 entered at its trade_date close.
  // Only picks that have been entered contribute to the curve — no "cash"
  // held for future picks. The curve starts on the first pick's trade date.
  const picksCount = dealRows.results.length;
  const startingValue = picksCount * STAKE;

  const dates = dailyRange(windowStart, windowEnd);
  const picksCurve: PortfolioPoint[] = [];
  for (const date of dates) {
    let sum = 0;
    let entered = 0;
    for (const deal of dealRows.results) {
      if (deal.trade_date > date) continue; // not yet entered
      entered++;
      const prices = priceMap.get(deal.ticker) ?? [];
      const current = priceOn(prices, date);
      sum += current != null ? STAKE * (current / deal.price_pence) : STAKE;
    }
    if (entered === 0) continue; // no picks yet — skip this date
    picksCurve.push({ date, value_gbp: Math.round(sum * 100) / 100 });
  }

  // ---- 6. FTSE benchmark curve (entry-matched) ---------------------------
  // For each pick, we "buy" £100 of the FTSE All-Share on the same trade
  // date at the FTSE close that day. This gives a time-matched counterfactual:
  // same capital, same entry timing, only variable is stock selection.
  const ftsePrices = priceMap.get(BENCHMARK) ?? [];

  // Pre-compute each pick's FTSE entry level.
  const ftseEntries: { trade_date: string; entry_level: number }[] = [];
  for (const deal of dealRows.results) {
    const level = priceOn(ftsePrices, deal.trade_date);
    if (level != null) ftseEntries.push({ trade_date: deal.trade_date, entry_level: level });
  }

  const ftseCurve: PortfolioPoint[] = [];
  for (const date of dates) {
    let sum = 0;
    let entered = 0;
    for (const fe of ftseEntries) {
      if (fe.trade_date > date) continue;
      entered++;
      const current = priceOn(ftsePrices, date);
      sum += current != null ? STAKE * (current / fe.entry_level) : STAKE;
    }
    if (entered === 0) continue;
    ftseCurve.push({ date, value_gbp: Math.round(sum * 100) / 100 });
  }

  // ---- 7. Per-pick details (as of windowEnd) ------------------------------
  const picks: PortfolioPick[] = dealRows.results.map((deal) => {
    const prices = priceMap.get(deal.ticker) ?? [];
    const current = priceOn(prices, windowEnd);
    const ret = current != null ? current / deal.price_pence - 1 : 0;

    // FTSE return over the same trade_date → windowEnd window. We use the
    // same priceOn() helper against the cached benchmark series.
    const ftseAtTrade = priceOn(ftsePrices, deal.trade_date);
    const ftseAtEnd = priceOn(ftsePrices, windowEnd);
    const ftseRet =
      ftseAtTrade != null && ftseAtEnd != null
        ? ftseAtEnd / ftseAtTrade - 1
        : 0;
    const alphaPp = (ret - ftseRet) * 100;

    return {
      dealing_id: deal.id,
      ticker: deal.ticker,
      company: deal.company,
      trade_date: deal.trade_date,
      rating: deal.rating as Rating,
      entry_price_pence: deal.price_pence,
      current_price_pence: current,
      return_pct: ret,
      contribution_gbp: Math.round(STAKE * ret * 100) / 100,
      ftse_return_pct: ftseRet,
      alpha_pp: Math.round(alphaPp * 100) / 100,
    };
  });

  // ---- 8. Headline numbers ------------------------------------------------
  const picksEnd = picksCurve[picksCurve.length - 1]?.value_gbp ?? startingValue;
  const ftseEnd = ftseCurve[ftseCurve.length - 1]?.value_gbp ?? startingValue;
  const picksReturn =
    startingValue === 0 ? 0 : (picksEnd - startingValue) / startingValue;
  const ftseReturn =
    startingValue === 0 ? 0 : (ftseEnd - startingValue) / startingValue;
  const alphaPp = (picksReturn - ftseReturn) * 100;

  return {
    fy,
    fy_start: fyStart,
    fy_end: fyEnd,
    as_of: windowEnd,
    in_progress: inProgress,
    picks_curve: picksCurve,
    ftse_curve: ftseCurve,
    picks_return_pct: picksReturn,
    ftse_return_pct: ftseReturn,
    alpha_pp: Math.round(alphaPp * 100) / 100,
    picks_count: picksCount,
    starting_value_gbp: startingValue,
    picks,
    available_fys: availableFys,
  };
}
