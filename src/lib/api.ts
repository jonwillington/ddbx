import type {
  Dealing,
  DirectorDetail,
  LatestPrice,
  Portfolio,
  Rating,
  UkNewsItem,
  UsDealing,
} from "@/types/ddbx";

export interface UsDealingsStats {
  total: number;
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
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
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
  version: () => get<{ latest: string | null; total: number }>("/version"),
  usDealings: (opts: { limit?: number; code?: string; ticker?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.limit != null) qs.set("limit", String(opts.limit));
    if (opts.code) qs.set("code", opts.code);
    if (opts.ticker) qs.set("ticker", opts.ticker);
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
};

export type {
  Dealing,
  DirectorDetail,
  LatestPrice,
  Portfolio,
  Rating,
  UkNewsItem,
  UsDealing,
};
