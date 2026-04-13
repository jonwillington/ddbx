import type { Env } from "../index";
import type { UkNewsItem } from "../db/types";

/** Curated UK-focused business / markets RSS feeds (headlines + outbound links only). */
const UK_FEEDS: { source: string; url: string }[] = [
  { source: "BBC", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "Guardian", url: "https://www.theguardian.com/uk/business/rss" },
  { source: "City AM", url: "https://www.cityam.com/feed/" },
  { source: "This is Money", url: "https://www.thisismoney.co.uk/money/index.rss" },
];

const UA =
  "Mozilla/5.0 (compatible; DirectorDealings/1.0; +https://ddbx.uk)";

interface ParsedItem {
  title: string;
  url: string;
  published_at: string | null;
}

type ParsedItemWithSource = ParsedItem & { source: string };

export async function refreshUkNews(env: Env): Promise<{
  inserted: number;
  fetched_at: string;
}> {
  const fetchedAt = new Date().toISOString();
  const perFeed = await Promise.allSettled(
    UK_FEEDS.map(async ({ source, url }) => {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      });
      if (!res.ok) throw new Error(`${source} ${res.status}`);
      const xml = await res.text();
      const items = parseFeedXml(xml).map((it) => ({ ...it, source }));
      return items;
    }),
  );

  const merged: ParsedItemWithSource[] = [];
  for (const r of perFeed) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }

  const seen = new Set<string>();
  const deduped: ParsedItemWithSource[] = [];
  for (const it of merged) {
    const key = it.url.split("#")[0];
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  deduped.sort((a, b) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
    return tb - ta;
  });

  const top = deduped.slice(0, 40);

  await env.DB.prepare(`DELETE FROM news_items`).run();

  if (top.length === 0) {
    return { inserted: 0, fetched_at: fetchedAt };
  }

  const stmt = env.DB.prepare(
    `INSERT INTO news_items (id, title, url, source, published_at, fetched_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  );
  const batch = await Promise.all(
    top.map(async (it) => {
      const id = await hashId(it.url);
      return stmt.bind(
        id,
        it.title.slice(0, 500),
        it.url,
        it.source,
        it.published_at,
        fetchedAt,
      );
    }),
  );
  await env.DB.batch(batch);

  return { inserted: top.length, fetched_at: fetchedAt };
}

export async function getUkNews(env: Env): Promise<{
  items: UkNewsItem[];
  fetched_at: string | null;
}> {
  const rows = await env.DB.prepare(
    `SELECT title, url, source, published_at, fetched_at
       FROM news_items
      ORDER BY coalesce(published_at, fetched_at) DESC
      LIMIT 40`,
  ).all<{
    title: string;
    url: string;
    source: string;
    published_at: string | null;
    fetched_at: string;
  }>();

  if (rows.results.length === 0) {
    return { items: [], fetched_at: null };
  }

  const fetched_at = rows.results[0]?.fetched_at ?? null;
  return {
    items: rows.results.map((r) => ({
      title: r.title,
      url: r.url,
      source: r.source,
      published_at: r.published_at,
    })),
    fetched_at,
  };
}

/** Returns true if we should refresh (empty or last fetch older than ~20 min). */
export async function ukNewsIsStale(env: Env): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT MAX(fetched_at) AS last FROM news_items`,
  ).first<{ last: string | null }>();
  if (!row?.last) return true;
  const age = Date.now() - new Date(row.last).getTime();
  return age > 20 * 60 * 1000;
}

function parseFeedXml(xml: string): ParsedItem[] {
  const rss = parseRss2Items(xml);
  if (rss.length > 0) return rss;
  return parseAtomItems(xml);
}

function parseRss2Items(xml: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeEntities(stripTags(extractTagInner(block, "title")));
    let link = decodeEntities(stripTags(extractTagInner(block, "link"))).trim();
    if (!link) {
      const guid = extractTagInner(block, "guid");
      const hm = guid.match(/https?:\/\/[^\s<]+/);
      if (hm) link = hm[0];
    }
    const pubRaw = extractTagInner(block, "pubDate");
    const published_at = pubRaw ? normalizeDate(pubRaw) : null;
    if (title && link.startsWith("http")) {
      out.push({ title, url: link, published_at });
    }
  }
  return out;
}

function parseAtomItems(xml: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeEntities(stripTags(extractTagInner(block, "title")));
    const linkMatch = block.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i)
      ?? block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
    const link = linkMatch?.[1]?.trim() ?? "";
    const pubRaw =
      extractTagInner(block, "updated") ||
      extractTagInner(block, "published") ||
      extractTagInner(block, "modified");
    const published_at = pubRaw ? normalizeDate(pubRaw) : null;
    if (title && link.startsWith("http")) {
      out.push({ title, url: link, published_at });
    }
  }
  return out;
}

function extractTagInner(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m?.[1]?.trim() ?? "";
}

function stripTags(s: string): string {
  const cdata = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  const raw = cdata ? cdata[1] : s;
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function normalizeDate(raw: string): string | null {
  const t = Date.parse(raw.trim());
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

async function hashId(url: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return Array.from(new Uint8Array(buf))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
