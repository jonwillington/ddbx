import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { DailySummary } from "@/types/ddbx";

/** Module-level cache so flipping back to a market doesn't refetch what
 *  we already have. Keys are `YYYY-MM-DD`. `null` means the API 404'd —
 *  no summary for that day, don't ask again. `undefined` (missing key)
 *  means we haven't asked yet. */
const cache = new Map<string, DailySummary | null>();
const inflight = new Set<string>();

/** Returns a date-keyed map of daily summaries for the requested set of
 *  dates. The hook is UK-only today — pass `market !== "uk"` and you get
 *  an empty map back without firing any requests. */
export function useDailySummaries(
  market: string,
  dates: string[],
): Map<string, DailySummary | null> {
  // Snapshot of the cache for the dates this caller asked about. Re-derived
  // on every render so newly-resolved fetches surface without explicit
  // re-renders elsewhere.
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (market !== "uk") return;
    if (dates.length === 0) return;

    let cancelled = false;

    for (const date of dates) {
      if (cache.has(date)) continue;
      if (inflight.has(date)) continue;
      inflight.add(date);
      api
        .dailySummary(date)
        .then((resp) => {
          cache.set(date, resp ? resp.summary : null);
        })
        .catch(() => {
          // Network blip — leave it out of the cache so we retry on the
          // next mount; but mark it null in the local view so we don't
          // keep retrying within this session.
          cache.set(date, null);
        })
        .finally(() => {
          inflight.delete(date);
          if (!cancelled) forceRender((n) => n + 1);
        });
    }

    return () => {
      cancelled = true;
    };
    // Comma-joined to keep the dependency stable when the caller passes
    // a fresh array reference with the same contents.
  }, [market, dates.join(",")]);

  const out = new Map<string, DailySummary | null>();

  for (const date of dates) {
    const cached = cache.get(date);

    if (cached !== undefined) out.set(date, cached);
  }

  return out;
}
