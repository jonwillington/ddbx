// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DO NOT EDIT — generated copy of ddbx-data/worker/db/types.ts
//
// The canonical source lives in the ddbx-data repo. To update this file, run
// `npm run sync:types` from a checkout of ddbx-site that has ddbx-data cloned
// alongside it (../ddbx-data). CI runs `npm run check:types` to fail builds
// if this file drifts from the canonical.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


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

export type DealingCurrency = "GBP" | "EUR" | "USD";

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
  /** Canonical GBP-equivalent price per share, in pence. FX-converted from
   *  price_native at trade-date rate when currency != "GBP". */
  price_pence: number;
  /** Canonical GBP-equivalent total consideration. */
  value_gbp: number;
  /** Currency of the original RNS. Defaults to "GBP" for legacy rows. */
  currency: DealingCurrency;
  /** Price per share in the native major unit (£, €, $). For GBP rows this
   *  equals price_pence/100; for non-GBP rows this is the raw RNS figure
   *  surfaced for cross-checking against broker confirmations. */
  price_native: number;
  /**
   * Set when the row is structurally wrong (price >50× off market after
   * FX + snap). Quarantined rows are hidden from default API responses;
   * /api/dealings?include_quarantined=1 surfaces them for ops/audit.
   * Always undefined on the wire for non-quarantined rows.
   */
  quarantine_reason?: string;
  /**
   * Mechanical classification — set by worker/pipeline/classify-trade.ts by
   * comparing price_pence to the trade-day market close. false ⇒ placing /
   * subscription / option exercise / vesting (price reflects deal terms,
   * not market). null ⇒ no price data yet (innocent until proven guilty).
   */
  is_open_market_buy?: boolean | null;
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

/** Close-of-day prose recap, synthesised by Opus from the full tape. */
export interface DailySummary {
  date: string;                  // ISO YYYY-MM-DD
  session: "morning" | "afternoon";
  headline: string;              // push title, ~50 chars
  body: string;                  // prose body, ~150-250 words; may contain markdown bold
  cited_ids: string[];           // dealings.id in narrative order
  total_count: number;           // dealings considered that day
  total_value_gbp: number;       // sum of value_gbp across all considered dealings
  model: string;                 // e.g. "claude-opus-4-6"
  created_at: string;            // ISO datetime UTC
}

/** Response shape for GET /api/daily-summary — the summary plus the cited
 *  dealings hydrated into full Dealing objects, in cited_ids order. */
export interface DailySummaryResponse {
  summary: DailySummary;
  cited: Dealing[];
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

// ============================================================================
// US wire format — see investigations/multi-market/form4-mapping.md
// ============================================================================
// Per the form4-mapping spike, Form 4 is structurally larger than the UK
// `Dealing` shape — we keep a parallel `UsDealing` row format rather than
// generalising. Field names mirror Form 4's XML element names where reasonable
// so the parser stays auditable against the SEC schema (X0609).

/** SEC Form 4 transaction codes. The full set is documented at
 *  https://www.sec.gov/about/forms/form4.pdf — we carry the raw code so the
 *  iOS adapter can decide how to surface it (open-market buy/sale, grant,
 *  exercise, gift, other). */
export type UsTransactionCode =
  | "P"  // Open market or private purchase
  | "S"  // Open market or private sale
  | "A"  // Grant/award (issuer to insider, free)
  | "M"  // Exercise/conversion of derivative
  | "F"  // Payment of exercise price or tax via shares
  | "G"  // Gift
  | "C"  // Conversion of derivative
  | "D"  // Disposition pursuant to tender / Rule 16b-3
  | "J"  // Other (footnote required)
  | "V"  // Voluntary reported earlier
  | "K"  // Equity swap
  | "X"  // Exercise of in/at-the-money derivative
  | "U"  // Disposition pursuant to tender
  | "W"  // Will or laws of descent
  | "Z"  // Voting trust
  | "L"  // Small transaction
  | "H"  // Expiration
  | "I"  // Discretionary plan
  | "E"; // Expiration of short position

export interface UsReporter {
  /** SEC CIK, 10-digit zero-padded. Stable across filings — the right
   *  primary key for an insider, much better than the free-form RNS name. */
  cik: string;
  name: string;
  /** Multi-checkbox roles. A reporter can be both a director and officer; this
   *  is a flattened list rather than the single string `Dealing.director.role`. */
  roles: Array<"director" | "officer" | "ten_percent_owner" | "other">;
  officer_title?: string;
  other_text?: string;
}

export interface UsDealing {
  /** Deterministic id: `f4-{accession_with_dashes}-{table}-{row}`. */
  id: string;
  /** EDGAR accession number with dashes (e.g. `0001213900-26-056175`). Groups
   *  N transactions emitted by the same Form 4 — same-day multi-leg
   *  disclosures (M then S) share a filing_id. */
  filing_id: string;
  /** Form 4 `periodOfReport` / `transactionDate`. */
  trade_date: string;          // ISO
  /** EDGAR file_date from the index. */
  disclosed_date: string;      // ISO
  created_at?: string;         // ISO datetime UTC — when ingested

  /** Primary reporter, picked per parser rules (prefer named individuals
   *  over fund entities; first listed when ambiguous). */
  reporter: UsReporter;
  /** Joint filers other than `reporter`, if any. The same transaction can be
   *  reported by multiple persons (e.g. fund GP + attributed individual). */
  co_reporters?: UsReporter[];

  /** Form 4 `issuerCik`. Stable company key; ticker can change on M&A. */
  issuer_cik: string;
  company: string;             // issuerName
  ticker: string;              // issuerTradingSymbol (no exchange suffix on US tickers)
  /** Always "USD" today; field kept for symmetry with `Dealing.currency`. */
  currency: "USD";

  /** Raw `securityTitle` text. Distinguishes Class A vs Class B for dual-class
   *  filers (e.g. NPWR). */
  security_title: string;
  /** Form 4's `transactionCode` — surfaced verbatim so triage and the iOS
   *  adapter can categorise. Don't collapse to `buy|sell`. */
  transaction_code: UsTransactionCode;
  /** Acquired (A) vs disposed (D). Orthogonal to `transaction_code` — a J
   *  ("other") row can be either. */
  acquired_disposed: "A" | "D";
  shares: number;
  /** Decimal USD majors. `null` when the filing footnotes the price
   *  (common for distributions and complex transactions). `0` for grants. */
  price: number | null;
  /** shares × price. `null` when price is `null`. */
  value: number | null;
  /** Post-transaction holding. Lets the product answer "did they sell out
   *  entirely?" — a stronger signal than just the transaction size. */
  shares_after?: number;
  /** Direct (D) or indirect (I) beneficial ownership. */
  direct_indirect: "D" | "I";
  /** Free-text nature when indirect (e.g. "By: NPEH, LLC"). */
  nature_of_ownership?: string;

  /** The Rule 10b5-1 plan affirmation. A `true` here means the trade ran on
   *  a pre-arranged plan — approximately zero current-view signal. The single
   *  most important quality flag in US insider data. */
  aff_10b5_one: boolean;
  /** Voluntary filer who's not formally a Section 16 reporter. Edge case. */
  not_subject_to_section16?: boolean;
  /** Form 4 `transactionTimeliness = "L"` — filed late (past T+2). Itself a
   *  governance signal. */
  is_late?: boolean;

  /** Set when the row comes from Table II (derivative table). */
  is_derivative: boolean;
  /** For derivative rows only — title of the security the derivative converts
   *  into (e.g. "Class A Common Stock" for an option on common stock). */
  underlying_security_title?: string;
  underlying_security_shares?: number;
  conversion_or_exercise_price?: number | null;
  exercise_date?: string | null;
  expiration_date?: string | null;

  /** True when documentType is `4/A`. Restate policy TBD — current default is
   *  to surface alongside the original with the badge. */
  is_amendment: boolean;
  /** Form 4 `dateOfOriginalSubmission`, present on amendments only. */
  original_filing_date?: string;

  /** Footnote map. Many Form 4 fields carry a `<footnoteId>` reference
   *  instead of an inline value — the footnote text is often the substance. */
  footnotes?: Record<string, string>;

  /** Haiku triage verdict for the parent filing+code group. Joined in by
   *  the read API — not part of the raw Form 4 payload. */
  triage_verdict?: UsTriageVerdict;
  triage_reason?: string;
}

export type UsTriageVerdict = "skip" | "maybe" | "promising";

/** One logical Form 4 trade after collapsing tranche-split rows. Same shape
 *  the triage runner sees and the iOS / web clients can render as a single
 *  card instead of N near-duplicate ones. Grouped by
 *  (filing_id, transaction_code, reporter_cik) — co-reporter filings stay
 *  separate even when they share a filing_id. */
export interface UsDealingGroup {
  filing_id: string;
  transaction_code: UsTransactionCode;
  reporter_cik: string;
  reporter_name: string;
  issuer_cik: string;
  ticker: string;
  company: string;
  trade_date: string;
  disclosed_date: string;
  security_title: string;
  /** Sum of all leg shares. */
  shares: number;
  /** Volume-weighted average price across legs, or `null` if every leg was
   *  footnote-priced. */
  price: number | null;
  /** Sum of all leg `value` fields, treating null as 0. */
  value: number;
  acquired_disposed: "A" | "D";
  direct_indirect: "D" | "I";
  aff_10b5_one: boolean;
  is_derivative: boolean;
  is_amendment: boolean;
  is_late: boolean | null;
  /** Number of underlying us_dealings rows that collapsed into this group. */
  leg_count: number;
  triage_verdict?: UsTriageVerdict;
  triage_reason?: string;
}
