import type {
  DailySummaryResponse,
  Dealing,
  DirectorDetail,
  EuDealing,
  EuDirectorDetail,
  LatestPrice,
  Portfolio,
  Rating,
  UkNewsItem,
  UsDealing,
  UsDirectorDetail,
} from "@/types/ddbx";

export interface EuScrapeResult {
  source: "FI";
  from: string;
  to: string;
  fetched_bytes: number;
  totalRows: number;
  parsed: number;
  skipped: number;
  rows: EuDealing[];
  errors: Array<{ rowIdx: number; message: string }>;
}

export interface UsDealingsStats {
  total: number;
  /** Rows passing the `view=interesting` predicate (open-market direct buy, no 10b5-1, non-derivative, value >= $50k). */
  interesting: number;
  /** Rows in the `interesting` set that also have a Haiku triage verdict in {maybe, promising}. */
  signal: number;
  /** Logical filings (filing_id, transaction_code) that have been triaged at all. */
  triaged: number;
  by_code: Array<{ code: string; n: number }>;
  latest_disclosed_date: string | null;
}

export interface IngestResult {
  scanned: number;
  parsed: number;
  rows: UsDealing[];
  inserted: number;
  replaced: number;
  errors: Array<{ accession: string; message: string }>;
}

const WORKER_BASE = (() => {
  // Strip the trailing `/api` so admin routes (`/__us-*`) hit the worker root.
  const apiBase =
    (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

  return apiBase.endsWith("/api") ? apiBase.slice(0, -4) : apiBase;
})();

// In dev, Vite proxies /api to wrangler dev (see vite.config.ts).
// In prod on Cloudflare Pages, set VITE_API_BASE to the Worker URL, e.g.
//   VITE_API_BASE=https://director-dealings.<your-subdomain>.workers.dev/api
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);

  if (!res.ok) throw new Error(`${path} ${res.status}`);

  return (await res.json()) as T;
}

export const api = {
  dealings: (rating?: Rating) =>
    get<{ dealings: Dealing[] }>(
      rating ? `/dealings?rating=${rating}` : "/dealings",
    ).then((r) => r.dealings),
  dealing: (id: string) => get<Dealing>(`/dealings/${id}`),
  portfolio: (fy?: number) =>
    get<Portfolio>(fy != null ? `/portfolio?fy=${fy}` : `/portfolio`),
  director: (id: string) => get<DirectorDetail>(`/directors/${id}`),
  usDirector: (id: string) => get<UsDirectorDetail>(`/directors/us/${id}`),
  seDirector: (nameOrKey: string) =>
    get<EuDirectorDetail>(`/directors/se/${encodeURIComponent(nameOrKey)}`),
  latestPrices: (tickers: string[]) =>
    get<{ prices: LatestPrice[] }>(
      `/prices/latest?tickers=${tickers.join(",")}`,
    ).then((r) => r.prices),
  priceOn: (ticker: string, date: string) =>
    get<{ price: number | null }>(
      `/prices/on?ticker=${encodeURIComponent(ticker)}&date=${date}`,
    ).then((r) => r.price),
  priceHistory: (ticker: string, days = 90) =>
    get<{ bars: { date: string; close_pence: number }[] }>(
      `/prices/history?ticker=${encodeURIComponent(ticker)}&days=${days}`,
    ).then((r) => r.bars),
  gbpPerUsdHistory: (days = 730) =>
    get<{ rates: { date: string; gbp_per_usd: number }[] }>(
      `/fx/gbp-per-usd?days=${days}`,
    ).then((r) => r.rates),
  ukNews: () =>
    get<{ items: UkNewsItem[]; fetched_at: string | null }>("/news/uk"),
  usNews: () =>
    get<{ items: UkNewsItem[]; fetched_at: string | null }>("/news/us"),
  seNews: () =>
    get<{ items: UkNewsItem[]; fetched_at: string | null }>("/news/se"),
  version: () => get<{ latest: string | null; total: number }>("/version"),
  /** UK daily summary for a given YYYY-MM-DD. Returns null on 404 — the
   *  endpoint 404s for days the team hasn't written one for yet, which
   *  is expected, not an error the UI should surface. */
  dailySummary: async (date: string): Promise<DailySummaryResponse | null> => {
    const res = await fetch(
      `${BASE}/daily-summary?date=${encodeURIComponent(date)}`,
    );

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`/daily-summary ${res.status}`);

    return (await res.json()) as DailySummaryResponse;
  },
  usDealings: (
    opts: {
      limit?: number;
      code?: string;
      ticker?: string;
      view?: "interesting" | "signal" | "all";
    } = {},
  ) => {
    const qs = new URLSearchParams();

    if (opts.limit != null) qs.set("limit", String(opts.limit));
    if (opts.code) qs.set("code", opts.code);
    if (opts.ticker) qs.set("ticker", opts.ticker);
    if (opts.view) qs.set("view", opts.view);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    return get<{ dealings: UsDealing[]; stats: UsDealingsStats }>(
      `/us-dealings${suffix}`,
    );
  },
  usIngest: async (limit = 50): Promise<IngestResult> => {
    // Force a fresh scrape + persist. Fires the same code path as the cron;
    // the /us page's "Fetch latest" button is the manual trigger.
    const res = await fetch(`${WORKER_BASE}/__us-ingest?limit=${limit}`, {
      method: "POST",
    });

    if (!res.ok) throw new Error(`/__us-ingest ${res.status}`);

    return (await res.json()) as IngestResult;
  },
  euScrape: async (from: string, to: string): Promise<EuScrapeResult> => {
    // Dry-run EU scrape (currently Sweden FI). Returns parsed rows without
    // persistence — kept around for ad-hoc spot-checks of the parser. The
    // /eu page reads from persisted /api/eu-dealings rather than calling
    // this each load.
    const qs = new URLSearchParams({ from, to });
    const res = await fetch(`${WORKER_BASE}/__eu-scrape?${qs.toString()}`, {
      method: "POST",
    });

    if (!res.ok) throw new Error(`/__eu-scrape ${res.status}`);

    return (await res.json()) as EuScrapeResult;
  },
  euDealings: (
    opts: { limit?: number; since?: string; market?: "SE" } = {},
  ) => {
    const qs = new URLSearchParams();

    if (opts.limit != null) qs.set("limit", String(opts.limit));
    if (opts.since) qs.set("since", opts.since);
    if (opts.market) qs.set("market", opts.market);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    return get<{ dealings: EuDealing[]; stats: EuDealingsStats }>(
      `/eu-dealings${suffix}`,
    );
  },
};

export interface EuDealingsStats {
  total: number;
  latest_disclosed_date: string | null;
  by_market: Array<{ market: string; n: number }>;
}

export type {
  DailySummaryResponse,
  Dealing,
  DirectorDetail,
  EuDealing,
  EuDirectorDetail,
  LatestPrice,
  Portfolio,
  Rating,
  UkNewsItem,
  UsDealing,
  UsDirectorDetail,
};
