import type {
  Analysis,
  Dealing,
  EvidencePoint,
  PerformanceRow,
  Rating,
  RatingChecklist,
  TriageVerdict,
} from "./types";

// ---- Row shapes straight out of D1 ---------------------------------------

interface JoinedRow {
  id: string;
  trade_date: string;
  disclosed_date: string;
  created_at: string;
  ticker: string;
  company: string;
  tx_type: string;
  shares: number;
  price_pence: number;
  value_gbp: number;
  dir_id: string;
  dir_name: string;
  dir_role: string | null;
  dir_company: string | null;
  dir_age_band: string | null;
  dir_tenure_years: number | null;
  triage_verdict: string | null;
  triage_reason: string | null;
  rating: string | null;
  confidence: number | null;
  summary: string | null;
  thesis: string | null;
  thesis_points_json: string | null;
  evidence_for_json: string | null;
  evidence_against_json: string | null;
  risks_json: string | null;
  catalyst_window: string | null;
  checklist_json: string | null;
  rating_rationale: string | null;
}

const BASE_SELECT = `
  SELECT
    d.id, d.trade_date, d.disclosed_date, d.ticker, d.company, d.tx_type,
    d.shares, d.price_pence, d.value_gbp, d.created_at,
    dir.id AS dir_id, dir.name AS dir_name, dir.role AS dir_role,
    dir.company_primary AS dir_company, dir.age_band AS dir_age_band,
    dir.tenure_years AS dir_tenure_years,
    t.verdict AS triage_verdict, t.reason AS triage_reason,
    a.rating, a.confidence, a.summary, a.thesis, a.thesis_points_json,
    a.evidence_for_json, a.evidence_against_json, a.risks_json,
    a.catalyst_window, a.checklist_json, a.rating_rationale
  FROM dealings d
  JOIN directors dir ON dir.id = d.director_id
  LEFT JOIN triage t ON t.dealing_id = d.id
  LEFT JOIN analyses a ON a.dealing_id = d.id
`;

function jsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hydrate(r: JoinedRow, perf: PerformanceRow[] = []): Dealing {
  // thesis_points is the canonical field. Older rows only have the legacy
  // single-string `thesis` column; fall back to splitting on blank lines so
  // they still render as something.
  let thesis_points: string[] = jsonArray<string>(r.thesis_points_json).filter(
    (s) => typeof s === "string" && s.trim().length > 0,
  );
  if (thesis_points.length === 0 && r.thesis) {
    thesis_points = r.thesis
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (thesis_points.length === 0) thesis_points = [r.thesis];
  }

  let checklist: RatingChecklist | undefined;
  if (r.checklist_json) {
    try {
      const parsed = JSON.parse(r.checklist_json);
      if (parsed && typeof parsed === "object") checklist = parsed as RatingChecklist;
    } catch {
      /* ignore malformed checklist json */
    }
  }

  const analysis: Analysis | undefined = r.rating
    ? {
        rating: r.rating as Rating,
        confidence: r.confidence ?? 0,
        summary: r.summary ?? "",
        thesis_points,
        evidence_for: jsonArray<EvidencePoint>(r.evidence_for_json),
        evidence_against: jsonArray<EvidencePoint>(r.evidence_against_json),
        key_risks: jsonArray<string>(r.risks_json),
        catalyst_window: (r.catalyst_window as "3m" | "6m" | "12m") ?? "12m",
        checklist,
        rating_rationale: r.rating_rationale ?? undefined,
      }
    : undefined;

  return {
    id: r.id,
    trade_date: r.trade_date,
    disclosed_date: r.disclosed_date,
    created_at: r.created_at,
    director: {
      id: r.dir_id,
      name: r.dir_name,
      role: r.dir_role ?? "Director",
      company: r.dir_company ?? r.company,
      age_band: r.dir_age_band ?? undefined,
      tenure_years: r.dir_tenure_years ?? undefined,
    },
    ticker: r.ticker,
    company: r.company,
    tx_type: r.tx_type as "buy" | "sell",
    shares: r.shares,
    price_pence: r.price_pence,
    value_gbp: r.value_gbp,
    triage: r.triage_verdict
      ? {
          verdict: r.triage_verdict as TriageVerdict,
          reason: r.triage_reason ?? "",
        }
      : undefined,
    analysis,
    performance: perf,
  };
}

async function loadPerformance(
  db: D1Database,
  dealingIds: string[],
): Promise<Map<string, PerformanceRow[]>> {
  const map = new Map<string, PerformanceRow[]>();
  if (dealingIds.length === 0) return map;
  // D1 limits prepared statement variables to ?1–?100, so batch in chunks of 99.
  const CHUNK = 99;
  for (let i = 0; i < dealingIds.length; i += CHUNK) {
    const chunk = dealingIds.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => `?${j + 1}`).join(",");
    const rows = await db
      .prepare(
        `SELECT dealing_id, horizon_days, return_pct, as_of_date
           FROM performance
          WHERE dealing_id IN (${placeholders})`,
      )
      .bind(...chunk)
      .all<{
        dealing_id: string;
        horizon_days: number;
        return_pct: number | null;
        as_of_date: string | null;
      }>();
    for (const row of rows.results) {
      const list = map.get(row.dealing_id) ?? [];
      list.push({
        horizon_days: row.horizon_days as 90 | 180 | 365 | 730,
        return_pct: row.return_pct,
        as_of_date: row.as_of_date,
      });
      map.set(row.dealing_id, list);
    }
  }
  return map;
}

export async function getDealings(
  db: D1Database,
  opts: { rating?: string } = {},
): Promise<Dealing[]> {
  const rows = await db
    .prepare(
      `${BASE_SELECT}
       WHERE (?1 IS NULL OR a.rating = ?1)
       ORDER BY d.disclosed_date DESC, d.created_at DESC, d.trade_date DESC
       LIMIT 200`,
    )
    .bind(opts.rating ?? null)
    .all<JoinedRow>();
  if (rows.results.length === 0) return [];
  const perf = await loadPerformance(
    db,
    rows.results.map((r) => r.id),
  );
  return rows.results.map((r) => hydrate(r, perf.get(r.id) ?? []));
}

export async function getDealingById(
  db: D1Database,
  id: string,
): Promise<Dealing | null> {
  const row = await db
    .prepare(`${BASE_SELECT} WHERE d.id = ?1`)
    .bind(id)
    .first<JoinedRow>();
  if (!row) return null;
  const perf = await loadPerformance(db, [id]);
  return hydrate(row, perf.get(id) ?? []);
}
