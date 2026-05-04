// Shared types for API + DB rows. The frontend imports these via worker/db/types.
// Keep this file dependency-free so both sides can use it.

export type Rating =
  | "significant"
  | "noteworthy"
  | "minor"
  | "routine";

// ICB top-level industries (FTSE Russell). Used to group dealings by
// industry in the iOS Performance tab. Sourced from Companies House SIC
// 2007 codes via worker/lib/sic-to-icb.ts; LLM fallback emits one of these.
export type SectorNormalized =
  | "Technology"
  | "Telecommunications"
  | "Health Care"
  | "Financials"
  | "Real Estate"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Industrials"
  | "Basic Materials"
  | "Energy"
  | "Utilities";

export const SECTOR_NORMALIZED_VALUES: readonly SectorNormalized[] = [
  "Technology",
  "Telecommunications",
  "Health Care",
  "Financials",
  "Real Estate",
  "Consumer Discretionary",
  "Consumer Staples",
  "Industrials",
  "Basic Materials",
  "Energy",
  "Utilities",
] as const;

export function isSectorNormalized(v: unknown): v is SectorNormalized {
  return typeof v === "string" && (SECTOR_NORMALIZED_VALUES as readonly string[]).includes(v);
}

export interface RatingChecklist {
  open_market_buy: boolean;
  senior_insider: boolean;
  meaningful_conviction: boolean;
  no_alternative_explanation: boolean;
  supporting_context_found: boolean;
  no_major_counter_signal: boolean;
}

export type TriageVerdict = "skip" | "maybe" | "promising";

export interface EvidencePoint {
  headline: string;      // short one-liner
  detail: string;        // fuller explanation
  source_label: string;  // citation text
  // Real URL retrieved via web_search. Required at write time for new
  // analyses (enforced in worker/pipeline/analyze.ts), but kept optional on
  // the type so legacy rows + fixtures with no URL still typecheck.
  source_url?: string;
}

export interface Analysis {
  rating: Rating;
  confidence: number;
  summary: string;          // tweet-ready one-liner
  thesis_points: string[];  // 4-6 short paragraphs, each <=2 sentences
  evidence_for: EvidencePoint[];
  evidence_against: EvidencePoint[];
  key_risks: string[];
  catalyst_window: "3m" | "6m" | "12m";
  checklist?: RatingChecklist;
  rating_rationale?: string;
}

export interface DirectorSummary {
  id: string;
  name: string;
  role: string;
  company: string;
  age_band?: string;
  tenure_years?: number;
}

export interface Dealing {
  id: string;
  trade_date: string;      // ISO
  disclosed_date: string;  // ISO
  created_at?: string;     // ISO datetime UTC — when the row was ingested
  director: DirectorSummary;
  ticker: string;
  company: string;
  tx_type: "buy" | "sell";
  shares: number;
  price_pence: number;
  value_gbp: number;
  triage?: { verdict: TriageVerdict; reason: string };
  analysis?: Analysis;
  performance?: PerformanceRow[];
  sector?: string | null;
  sector_normalized?: SectorNormalized | null;
  sic_codes?: string[] | null;
}

export interface PerformanceRow {
  horizon_days: 90 | 180 | 365 | 730;
  return_pct: number | null;
  as_of_date: string | null;
}

export interface DirectorDetail extends DirectorSummary {
  profile?: {
    biography: string;
    track_record_summary: string;
    flags: string[];
  };
  prior_picks: Dealing[];
  hit_rate_pct: number;
  avg_return_by_horizon: Record<string, number | null>;
}

export interface PortfolioPoint {
  date: string;
  value_gbp: number;
}

export interface PortfolioPick {
  dealing_id: string;
  ticker: string;
  company: string;
  trade_date: string;
  rating: Rating;
  entry_price_pence: number;
  current_price_pence: number | null;
  return_pct: number;
  contribution_gbp: number; // current £value − £100 stake
  ftse_return_pct: number;  // FTSE All-Share return over the same trade_date → as_of window
  alpha_pp: number;         // (return_pct − ftse_return_pct) × 100, percentage points
}

export interface FinancialYear {
  fy: number;        // 26 means FY26 (starts 6 Apr 2026)
  start: string;     // ISO date
  end: string;       // ISO date (inclusive)
  in_progress: boolean;
  picks_count: number;
}

export interface CompanyProfile {
  description: string;
  sector: string;
  sector_normalized?: SectorNormalized | null;
  sic_codes?: string[] | null;
  website?: string;
  key_facts: string[];
}

export interface Ticker {
  ticker: string;
  company_name: string | null;
  exchange: string;
  first_seen_at: string;
  last_seen_at: string;
  sector?: string | null;
  sector_normalized?: SectorNormalized | null;
  sic_codes?: string[] | null;
  description?: string | null;
  website?: string | null;
  profile?: CompanyProfile;
  profile_updated_at?: string | null;
}

export interface LatestPrice {
  ticker: string;
  price_pence: number;
  date: string;
}

/** UK markets headline from aggregated RSS (outbound links only). */
export interface UkNewsItem {
  title: string;
  url: string;
  source: string;
  published_at: string | null;
}

export interface Portfolio {
  fy: number;                  // 26 means FY26
  fy_start: string;            // ISO, e.g. "2026-04-06"
  fy_end: string;              // ISO, e.g. "2027-04-05"
  as_of: string;               // ISO of the latest curve point
  in_progress: boolean;        // FY hasn't ended yet
  picks_curve: PortfolioPoint[];
  ftse_curve: PortfolioPoint[];
  picks_return_pct: number;    // 0.123 = +12.3%
  ftse_return_pct: number;
  alpha_pp: number;            // (picks − ftse) × 100, in percentage points
  picks_count: number;
  starting_value_gbp: number;  // picks_count × £100
  picks: PortfolioPick[];
  available_fys: FinancialYear[];
}
