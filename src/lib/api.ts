import type {
  Dealing,
  DirectorDetail,
  LatestPrice,
  Portfolio,
  Rating,
} from "../../worker/db/types";

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
    get<{ prices: LatestPrice[] }>(`/prices/latest?tickers=${tickers.join(",")}`)
      .then((r) => r.prices),
  priceOn: (ticker: string, date: string) =>
    get<{ price: number | null }>(`/prices/on?ticker=${encodeURIComponent(ticker)}&date=${date}`)
      .then((r) => r.price),
  priceHistory: (ticker: string, days = 90) =>
    get<{ bars: { date: string; close_pence: number }[] }>(
      `/prices/history?ticker=${encodeURIComponent(ticker)}&days=${days}`,
    ).then((r) => r.bars),
};

export type { Dealing, DirectorDetail, LatestPrice, Portfolio, Rating };
