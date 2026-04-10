import type { DirectorDetail, PerformanceRow } from "./types";
import { getDealings } from "./queries";

interface DirectorRow {
  id: string;
  name: string;
  role: string | null;
  company_primary: string | null;
  age_band: string | null;
  tenure_years: number | null;
  profile_json: string | null;
}

export async function getDirector(
  db: D1Database,
  id: string,
): Promise<DirectorDetail | null> {
  const row = await db
    .prepare(
      `SELECT id, name, role, company_primary, age_band, tenure_years, profile_json
         FROM directors WHERE id = ?1`,
    )
    .bind(id)
    .first<DirectorRow>();
  if (!row) return null;

  // Reuse the main dealings hydrator and filter by director id. Cheap for
  // the data volumes we expect (one director ≤ dozens of rows).
  const allDealings = await getDealings(db, {});
  const priorPicks = allDealings.filter((d) => d.director.id === id);

  // Hit rate: fraction of picks with a positive return at the longest
  // available horizon.
  let positive = 0;
  let total = 0;
  for (const p of priorPicks) {
    const best = bestHorizon(p.performance ?? []);
    if (best !== null) {
      total++;
      if (best >= 0) positive++;
    }
  }
  const hitRate = total === 0 ? 0 : (positive / total) * 100;

  const avgByHorizon: Record<string, number | null> = {
    "3m": avg(priorPicks, 90),
    "6m": avg(priorPicks, 180),
    "12m": avg(priorPicks, 365),
    "24m": avg(priorPicks, 730),
  };

  const profile = row.profile_json
    ? (() => {
        try {
          return JSON.parse(row.profile_json!) as DirectorDetail["profile"];
        } catch {
          return undefined;
        }
      })()
    : undefined;

  return {
    id: row.id,
    name: row.name,
    role: row.role ?? "Director",
    company: row.company_primary ?? "",
    age_band: row.age_band ?? undefined,
    tenure_years: row.tenure_years ?? undefined,
    profile,
    prior_picks: priorPicks,
    hit_rate_pct: hitRate,
    avg_return_by_horizon: avgByHorizon,
  };
}

function bestHorizon(perf: PerformanceRow[]): number | null {
  // Prefer longer horizons when available.
  for (const h of [730, 365, 180, 90] as const) {
    const row = perf.find((p) => p.horizon_days === h);
    if (row && row.return_pct != null) return row.return_pct;
  }
  return null;
}

function avg(picks: { performance?: PerformanceRow[] }[], horizon: number): number | null {
  const rets: number[] = [];
  for (const p of picks) {
    const row = (p.performance ?? []).find((x) => x.horizon_days === horizon);
    if (row && row.return_pct != null) rets.push(row.return_pct);
  }
  if (rets.length === 0) return null;
  return rets.reduce((a, b) => a + b, 0) / rets.length;
}
