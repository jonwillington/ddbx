import type { Env } from "../index";
import {
  fetchText,
  maxPageNumber,
  parseListHtml,
  processListItem,
  type ListItem,
} from "./scrape";
import { analyzeDealing } from "./analyze";
import { triageDealing } from "./triage";
import { ensureDirectorProfile } from "./profile";
import { refreshPerformance } from "./performance";
import {
  insertAnalysis,
  insertDealing,
  insertTriage,
  upsertDirector,
} from "../db/writes";

export interface BackfillResult {
  days_walked: number;
  list_pages_fetched: number;
  items_found: number;
  new_dealings: number;
  triaged: number;
  analyzed: number;
  performance_updated: number;
  errors: string[];
}

// Walks Investegate's /today-announcements/YYYY-MM-DD archive for the last N
// days, pushing every director/PDMR shareholding announcement through the
// same extract → triage → analyze pipeline. Fully idempotent thanks to the
// extractions + dealings hash caches — re-running is cheap.
//
// `startOffset` skips the most-recent N days so callers can process a window
// further back in time (e.g. startOffset=5, days=5 covers days 6-10 ago).
export async function backfillDays(
  env: Env,
  days: number,
  startOffset = 0,
): Promise<BackfillResult> {
  const result: BackfillResult = {
    days_walked: 0,
    list_pages_fetched: 0,
    items_found: 0,
    new_dealings: 0,
    triaged: 0,
    analyzed: 0,
    performance_updated: 0,
    errors: [],
  };

  const today = new Date();
  for (let dayOffset = startOffset + 1; dayOffset <= startOffset + days; dayOffset++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - dayOffset);
    const iso = d.toISOString().slice(0, 10);
    result.days_walked++;

    try {
      const items = await fetchAllItemsForDate(env, iso, result);
      result.items_found += items.length;
      for (const item of items) {
        try {
          const dealing = await processListItem(env, item);
          if (!dealing) continue;

          await upsertDirector(env, dealing.director);
          const fresh = await insertDealing(env, dealing);
          if (!fresh) continue;
          result.new_dealings++;

          await ensureDirectorProfile(env, dealing.director);

          const triage = await triageDealing(env, dealing);
          await insertTriage(
            env,
            dealing.id,
            { verdict: triage.verdict, reason: triage.reason },
            triage.usage,
          );
          result.triaged++;

          if (triage.verdict === "promising" || triage.verdict === "maybe") {
            try {
              const analyzed = await analyzeDealing(env, dealing);
              await insertAnalysis(
                env,
                dealing.id,
                analyzed.analysis,
                analyzed.usage,
              );
              result.analyzed++;
            } catch (err) {
              result.errors.push(
                `analyze ${dealing.id}: ${(err as Error).message}`,
              );
            }
          }
        } catch (err) {
          result.errors.push(
            `item ${item.announcementUrl}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      result.errors.push(`day ${iso}: ${(err as Error).message}`);
    }
  }

  try {
    const perf = await refreshPerformance(env);
    result.performance_updated = perf.updated;
  } catch (err) {
    result.errors.push(`performance: ${(err as Error).message}`);
  }

  return result;
}

// Walks every paginated list page for a single historical day and returns
// all director/PDMR items. Stops early once it hits the page count from
// the pagination links on the first page.
async function fetchAllItemsForDate(
  _env: Env,
  isoDate: string,
  result: BackfillResult,
): Promise<ListItem[]> {
  const baseUrl = `https://www.investegate.co.uk/today-announcements/${isoDate}`;
  const all: ListItem[] = [];
  const firstHtml = await fetchText(baseUrl);
  result.list_pages_fetched++;
  all.push(...parseListHtml(firstHtml));
  const totalPages = maxPageNumber(firstHtml);
  for (let page = 2; page <= totalPages; page++) {
    try {
      const html = await fetchText(`${baseUrl}?page=${page}`);
      result.list_pages_fetched++;
      all.push(...parseListHtml(html));
    } catch (err) {
      result.errors.push(
        `list ${isoDate} p${page}: ${(err as Error).message}`,
      );
    }
  }
  // Dedupe by URL in case pagination overlap returned duplicates.
  const seen = new Set<string>();
  return all.filter((x) => {
    if (seen.has(x.announcementUrl)) return false;
    seen.add(x.announcementUrl);
    return true;
  });
}
