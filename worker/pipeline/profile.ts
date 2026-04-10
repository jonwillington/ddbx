import type { Env } from "../index";
import type { DirectorSummary } from "../db/types";

// Build (or refresh) an Opus-generated director profile. Cached in `directors`
// table; refreshed monthly. Uses Anthropic web search tool to gather:
//   - role, age band, tenure
//   - notable prior trades (hit rate, size, timing vs stock moves)
//   - governance red flags / regulator actions
//
// For v1 scaffold this is a no-op; the row already exists as a stub when the
// scraper first encounters the director.
export async function ensureDirectorProfile(
  _env: Env,
  _director: DirectorSummary,
): Promise<void> {
  // TODO:
  // 1. SELECT profile_updated_at FROM directors WHERE id = ?
  // 2. If missing or > 30 days old, call Opus with web_search tool
  // 3. UPDATE directors SET profile_json = ?, profile_updated_at = now()
}
