import type { Analysis } from "../db/types";

const TWEET_URL = "https://api.twitter.com/2/tweets";
const SITE_BASE = "https://ddbx.uk";

// X OAuth 2.0 User Context Bearer token with `tweet.write` scope.
// Tokens expire after 2h; refresh logic lives in twitter-auth.ts (added next step).
export interface TwitterCreds {
  TWITTER_OAUTH2_ACCESS_TOKEN: string;
}

const RATING_EMOJI: Record<string, string> = {
  significant: "🟢",
  noteworthy: "🔵",
  minor: "🟡",
  routine: "⚪",
};

const RATING_LABEL: Record<string, string> = {
  significant: "Significant",
  noteworthy: "Noteworthy",
  minor: "Minor",
  routine: "Routine",
};

function buildTweet(p: {
  id: string;
  ticker: string;
  company: string;
  analysis: Analysis;
}): string {
  const emoji = RATING_EMOJI[p.analysis.rating] ?? "•";
  const verdict = RATING_LABEL[p.analysis.rating] ?? p.analysis.rating;
  // UK tickers come with .L suffix — strip it for display and use £
  const isUk = p.ticker.endsWith(".L");
  const displayTicker = isUk ? p.ticker.replace(/\.L$/, "") : p.ticker;
  const symbol = isUk ? "£" : "$";
  // Strip trailing (TICKER) from company name if present
  const company = p.company.replace(/\s*\([^)]*\)\s*$/, "");

  return [
    `${emoji} ${verdict}`,
    ``,
    `${symbol}${displayTicker} · ${company}`,
    ``,
    p.analysis.summary,
    ``,
    `View full analysis: ${SITE_BASE}/dealings/${p.id}`,
    ``,
    `#FTSE #LSE #DirectorDeals #FinTwit`,
  ].join("\n");
}

export async function postTweet(env: TwitterCreds, p: {
  id: string;
  ticker: string;
  company: string;
  analysis: Analysis;
}): Promise<void> {
  const text = buildTweet(p);
  await sendTweet(env, text);
}

export async function sendTweet(creds: TwitterCreds, text: string): Promise<void> {
  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.TWITTER_OAUTH2_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twitter ${res.status}: ${detail}`);
  }
}

// ---- Daily heartbeat summary ---------------------------------------------

export interface DailySummaryDealing {
  ticker: string;     // raw ticker, may include .L suffix
  value_gbp: number;
  rating: string | null;
}

function formatGbp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "£0";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    // 1 decimal for <10M, whole number above
    return `£${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `£${Math.round(value / 1_000)}k`;
  }
  return `£${Math.round(value)}`;
}

function tickerTag(ticker: string, cashtag: boolean): string {
  // Strip LSE .L suffix. Twitter only allows one $cashtag per post, so the
  // biggest trade gets the real cashtag for search pickup and the rest fall
  // back to #hashtags (still searchable, just via the hashtag index).
  const clean = ticker.replace(/\.L$/i, "").toUpperCase();
  return `${cashtag ? "$" : "#"}${clean}`;
}

function formatDate(isoDate: string): string {
  // isoDate "2026-04-09" -> "9 Apr"
  const [, mm, dd] = isoDate.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = months[Number(mm) - 1] ?? mm;
  return `${Number(dd)} ${m}`;
}

export type Session = "morning" | "afternoon";

export function buildDailySummaryTweet(p: {
  date: string; // ISO yyyy-mm-dd
  session: Session;
  dealings: DailySummaryDealing[];
}): string | null {
  const total = p.dealings.length;
  if (total === 0) return null;

  const noteworthy = p.dealings.filter(
    (d) => d.rating === "significant" || d.rating === "noteworthy",
  ).length;

  // Top 5 by value_gbp (capped at 5 to stay under 280 chars with CTA)
  const top = [...p.dealings]
    .sort((a, b) => b.value_gbp - a.value_gbp)
    .slice(0, 5);

  const items = top.map((d, idx) =>
    `${tickerTag(d.ticker, idx === 0)} ${formatGbp(d.value_gbp)}`,
  );
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push(items.slice(i, i + 3).join(" · "));
  }
  const moreCount = total - top.length;
  if (moreCount > 0) rows.push(`+ ${moreCount} more`);

  const sessionLabel = p.session === "morning" ? "Morning" : "Close";
  const header = `📊 Director dealings · ${formatDate(p.date)} · ${sessionLabel}`;
  const tradeWord = total === 1 ? "trade" : "trades";
  const lead = p.session === "morning"
    ? `${total} ${tradeWord} logged so far today:`
    : `${total} ${tradeWord} logged today:`;

  const lines = [
    header,
    ``,
    lead,
    ...rows,
    ``,
  ];

  if (noteworthy > 0) {
    lines.push(`${noteworthy} rated noteworthy or above 🔵 — full breakdown at:`);
  } else {
    lines.push(`Nothing rated noteworthy or above today.`);
  }

  lines.push(
    SITE_BASE,
    ``,
    `Think we've missed something? Let us know beneath 🧵`,
    ``,
    `#FTSE #LSE #DirectorDeals #FinTwit`,
  );

  return lines.join("\n");
}

export async function postDailySummary(env: TwitterCreds, p: {
  date: string;
  session: Session;
  dealings: DailySummaryDealing[];
}): Promise<{ posted: boolean; text: string | null }> {
  const text = buildDailySummaryTweet(p);
  if (!text) return { posted: false, text: null };
  await sendTweet(env, text);
  return { posted: true, text };
}
