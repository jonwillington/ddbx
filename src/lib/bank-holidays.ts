// Exchange-holiday feeds. Generic — markets define a HolidaySource describing
// where the data comes from (remote feed or static map). Cached in
// localStorage, refreshed weekly. Map shape: { "YYYY-MM-DD": "Holiday name" }.

import { useEffect, useState } from "react";

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** How a market sources its exchange-closure calendar. */
export type HolidaySource =
  | {
      kind: "remote";
      /** Stable key for localStorage caches. */
      id: string;
      /** Feed URL returning a JSON payload to be parsed by `parse`. */
      url: string;
      /** Parser that pulls { date: name } pairs out of the feed payload. */
      parse: (json: unknown) => Record<string, string>;
    }
  | {
      kind: "static";
      /** Pre-known holiday map — used for NYSE / SE where a public feed is
       *  awkward to consume. Reseed in source when the year rolls over. */
      map: Record<string, string>;
    };

/** UK GOV.UK England-and-Wales bank holidays — what LSE observes. */
export const UK_BANK_HOLIDAYS_SOURCE: HolidaySource = {
  kind: "remote",
  id: "englandAndWales",
  url: "https://www.gov.uk/bank-holidays.json",
  parse: (json) => {
    const payload = json as
      | {
          "england-and-wales"?: {
            events?: Array<{ title?: string; date?: string }>;
          };
        }
      | undefined;
    const events = payload?.["england-and-wales"]?.events ?? [];
    const map: Record<string, string> = {};

    for (const e of events) {
      if (e.date && e.title) map[e.date] = e.title;
    }

    return map;
  },
};

function cacheKey(source: HolidaySource): string {
  return source.kind === "remote" ? `ddbx.bankHolidays.${source.id}` : "";
}

function lastFetchKey(source: HolidaySource): string {
  return source.kind === "remote"
    ? `ddbx.bankHolidays.${source.id}.lastFetch`
    : "";
}

function readCached(source: HolidaySource): Record<string, string> {
  if (source.kind === "static") return source.map;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(cacheKey(source));

    if (!raw) return {};
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === "object")
      return parsed as Record<string, string>;
  } catch {
    /* ignore parse / quota errors */
  }

  return {};
}

function writeCached(source: HolidaySource, map: Record<string, string>) {
  if (source.kind !== "remote") return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(source), JSON.stringify(map));
    window.localStorage.setItem(lastFetchKey(source), String(Date.now()));
  } catch {
    /* quota — best effort */
  }
}

function lastFetch(source: HolidaySource): number {
  if (source.kind !== "remote") return Date.now();
  if (typeof window === "undefined") return 0;

  return Number(window.localStorage.getItem(lastFetchKey(source)) || 0);
}

async function fetchRemote(
  source: Extract<HolidaySource, { kind: "remote" }>,
): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(source.url, { cache: "no-cache" });

    if (!r.ok) return null;

    return source.parse(await r.json());
  } catch {
    return null;
  }
}

/** Holiday map for a given exchange. Static sources return immediately;
 *  remote sources serve from localStorage cache and refresh weekly. */
export function useExchangeHolidays(
  source: HolidaySource,
): Record<string, string> {
  const [holidays, setHolidays] = useState<Record<string, string>>(() =>
    readCached(source),
  );

  useEffect(() => {
    if (source.kind !== "remote") return;
    const stale = Date.now() - lastFetch(source) > REFRESH_INTERVAL_MS;

    if (!stale) return;
    let cancelled = false;

    fetchRemote(source).then((map) => {
      if (cancelled || !map) return;
      writeCached(source, map);
      setHolidays(map);
    });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return holidays;
}

/** Back-compat shim — UK callers pass through `useExchangeHolidays` with
 *  the GOV.UK England-and-Wales source. */
export function useBankHolidays(): Record<string, string> {
  return useExchangeHolidays(UK_BANK_HOLIDAYS_SOURCE);
}
