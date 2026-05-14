// England-and-Wales bank holiday feed. Mirrors the iOS BankHolidayProvider,
// but the data lives in localStorage instead of a Caches directory so it
// survives a tab refresh and is shared across tabs of the same origin.
//
// Map shape: { "YYYY-MM-DD": "Bank holiday name" }.

import { useEffect, useState } from "react";

const FEED_URL = "https://www.gov.uk/bank-holidays.json";
const CACHE_KEY = "ddbx.bankHolidays.englandAndWales";
const LAST_FETCH_KEY = "ddbx.bankHolidays.lastFetch";
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

interface FeedEvent { title: string; date: string }
interface FeedRegion { events: FeedEvent[] }
interface FeedPayload { "england-and-wales": FeedRegion }

function readCached(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch { /* ignore parse / quota errors */ }
  return {};
}

function writeCached(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    window.localStorage.setItem(LAST_FETCH_KEY, String(Date.now()));
  } catch { /* quota — best effort */ }
}

function lastFetch(): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(LAST_FETCH_KEY) || 0);
}

async function fetchHolidays(): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(FEED_URL, { cache: "no-cache" });
    if (!r.ok) return null;
    const payload = (await r.json()) as FeedPayload;
    const events = payload?.["england-and-wales"]?.events ?? [];
    const map: Record<string, string> = {};
    for (const e of events) {
      if (e.date && e.title) map[e.date] = e.title;
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Returns the bank-holiday map and refreshes it from gov.uk in the background
 * if the cached snapshot is older than a week.
 */
export function useBankHolidays(): Record<string, string> {
  const [holidays, setHolidays] = useState<Record<string, string>>(readCached);

  useEffect(() => {
    const stale = Date.now() - lastFetch() > REFRESH_INTERVAL_MS;
    if (!stale) return;
    let cancelled = false;
    fetchHolidays().then((map) => {
      if (cancelled || !map) return;
      writeCached(map);
      setHolidays(map);
    });
    return () => { cancelled = true; };
  }, []);

  return holidays;
}
