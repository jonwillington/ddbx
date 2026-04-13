import type { Env } from "../index";
import type { Dealing } from "../db/types";
import {
  directorIdFromName,
  getCachedExtraction,
  hashDealing,
  putCachedExtraction,
} from "../db/writes";
import { extractDealing, type ExtractedDealing } from "./extract";

const LIST_URL = "https://www.investegate.co.uk/category/directors-dealings";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export interface ListItem {
  announcementUrl: string;
  company: string;
  ticker: string; // e.g. "TPK.L"
  headline: string;
  disclosedDate: string; // ISO, best-effort from the list row
}

// Nightly entry point: today's director-dealings category page, all pages.
export async function scrapeDealings(env: Env): Promise<Dealing[]> {
  const firstHtml = await fetchText(LIST_URL);
  const list = parseListHtml(firstHtml);
  const totalPages = maxPageNumber(firstHtml);
  for (let page = 2; page <= totalPages; page++) {
    try {
      const html = await fetchText(`${LIST_URL}?page=${page}`);
      list.push(...parseListHtml(html));
    } catch {
      // Non-fatal — process what we have.
    }
  }
  // Dedupe by URL in case of pagination overlap.
  const seen = new Set<string>();
  const deduped = list.filter((x) => {
    if (seen.has(x.announcementUrl)) return false;
    seen.add(x.announcementUrl);
    return true;
  });
  return processListItems(env, deduped);
}

// Walks one list item (from either the daily or historical scrape) through
// the cached extraction pipeline, returning a Dealing if it's an open-market
// buy or null otherwise.
export async function processListItem(
  env: Env,
  item: ListItem,
): Promise<Dealing | null> {
  let extracted: ExtractedDealing | null | undefined;
  const cached = await getCachedExtraction(env, item.announcementUrl);
  if (cached) {
    if (!cached.is_open_market_buy) return null;
    extracted = cached.extracted as ExtractedDealing;
  } else {
    const html = await fetchText(item.announcementUrl);
    const text = extractVisibleText(html);
    extracted = await extractDealing(env, {
      url: item.announcementUrl,
      headline: item.headline,
      company: item.company,
      ticker: item.ticker,
      body: text.slice(0, 8000),
    });
    await putCachedExtraction(
      env,
      item.announcementUrl,
      !!extracted?.is_open_market_buy,
      extracted,
    );
  }
  if (!extracted || !extracted.is_open_market_buy) return null;

  // Cross-check extracted price against the market close for that date.
  // Catches cases where the LLM and value/shares all agree internally but
  // the price is in the wrong unit (or simply hallucinated).
  let price_pence = extracted.price_pence;
  if (price_pence > 0) {
    const marketRow = await env.DB.prepare(
      `SELECT close_pence FROM prices
        WHERE ticker = ?1 AND date <= ?2
        ORDER BY date DESC LIMIT 1`,
    )
      .bind(item.ticker, extracted.trade_date)
      .first<{ close_pence: number }>();

    if (marketRow && marketRow.close_pence > 0) {
      const ratio = marketRow.close_pence / price_pence;
      if (ratio > 5) {
        // Extracted price is far too low — likely in pounds instead of pence.
        console.log(
          `price-fix ${item.ticker}: ${price_pence} -> ${price_pence * 100} (market ${marketRow.close_pence}, ratio ${ratio.toFixed(1)}x)`,
        );
        price_pence = price_pence * 100;
      } else if (ratio < 0.2) {
        // Extracted price is far too high — likely pence * 100.
        console.log(
          `price-fix ${item.ticker}: ${price_pence} -> ${price_pence / 100} (market ${marketRow.close_pence}, ratio ${ratio.toFixed(1)}x)`,
        );
        price_pence = price_pence / 100;
      }
    }
  }

  const director_id = directorIdFromName(extracted.director_name);
  const hash = await hashDealing({
    trade_date: extracted.trade_date,
    director_id,
    ticker: item.ticker,
    shares: extracted.shares,
    price_pence,
  });

  return {
    id: `d-${hash.slice(0, 16)}`,
    trade_date: extracted.trade_date,
    disclosed_date: item.disclosedDate || extracted.trade_date,
    director: {
      id: director_id,
      name: extracted.director_name,
      role: extracted.role || "Director",
      company: item.company,
    },
    ticker: item.ticker,
    company: item.company,
    tx_type: "buy",
    shares: extracted.shares,
    price_pence,
    value_gbp:
      extracted.value_gbp ||
      (price_pence * extracted.shares) / 100,
  };
}

async function processListItems(
  env: Env,
  list: ListItem[],
): Promise<Dealing[]> {
  const out: Dealing[] = [];
  for (const item of list) {
    try {
      const d = await processListItem(env, item);
      if (d) out.push(d);
    } catch (err) {
      console.error(
        `scrape ${item.announcementUrl}: ${(err as Error).message}`,
      );
    }
  }
  return out;
}

// --- HTTP helpers ----------------------------------------------------------

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return await res.text();
}

// --- List page parser ------------------------------------------------------

export async function fetchList(url: string): Promise<ListItem[]> {
  const html = await fetchText(url);
  return parseListHtml(html);
}

// Same page format used by both /category/directors-dealings and
// /today-announcements/YYYY-MM-DD. We filter rows by headline so the historical
// (unfiltered) pages still work.
export function parseListHtml(html: string): ListItem[] {
  const items: ListItem[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const dateMatch = row.match(
      /<td[^>]*>\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?\s*<\/td>/,
    );
    const tidmMatch = row.match(/\/company\/([A-Z0-9.]+)"/);
    const companyNameMatch = row.match(
      /\/company\/[A-Z0-9.]+"[^>]*>([^<]+)<\/a>/,
    );
    const linkMatch = row.match(
      /<a[^>]*class="announcement-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/,
    );
    if (!dateMatch || !tidmMatch || !linkMatch) continue;
    const headline = decodeEntities(linkMatch[2].trim());
    if (!/director|pdmr|dealing/i.test(headline)) continue;

    items.push({
      announcementUrl: linkMatch[1],
      company: decodeEntities(companyNameMatch?.[1]?.trim() ?? ""),
      ticker: normaliseTicker(tidmMatch[1]),
      headline,
      disclosedDate: parseDateToIso(dateMatch[1]) ?? "",
    });
  }
  return items;
}

// Maximum page number found in pagination links on the given HTML. Used by
// the backfill walker to know how far to page.
export function maxPageNumber(html: string): number {
  let max = 1;
  const re = /[?&]page=(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

// --- Detail page text extraction -------------------------------------------

function extractVisibleText(html: string): string {
  let s = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// --- utilities -------------------------------------------------------------

function normaliseTicker(tidm: string): string {
  const t = tidm.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  return t.endsWith(".L") ? t : `${t}.L`;
}

function parseDateToIso(s: string): string | null {
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const mon = months[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${m[3]}-${pad(mon)}-${pad(+m[1])}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
