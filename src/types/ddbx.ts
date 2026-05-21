// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DO NOT EDIT — generated copy of ddbx-data/worker/db/types.ts
//
// The canonical source lives in the ddbx-data repo. To update this file, run
// `npm run sync:types` from a checkout of ddbx-site that has ddbx-data cloned
// alongside it (../ddbx-data). CI runs `npm run check:types` to fail builds
// if this file drifts from the canonical.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// ============================================================================
// Market registry
// ============================================================================
// Single source of truth for which markets the worker knows about and what
// each one supports. Consumed by GET /api/markets so clients (iOS, ddbx-site)
// can render the right surfaces without hardcoding per-market branches.
//
// Adding a market: append to MARKETS and add a MARKET_CONFIG entry. The
// Record<Market, …> shape makes the new entry a type error until populated.
// EU_MARKETS / MARKET_POLICY further down stay in lockstep when the new
// market is region:"EU" — see the comment on EU_MARKETS below.

export const MARKETS = ["UK", "US", "SE", "NL"] as const;
export type Market = (typeof MARKETS)[number];

export function isMarket(v: unknown): v is Market {
  return typeof v === "string" && (MARKETS as readonly string[]).includes(v);
}

export interface MarketConfig {
  /** ISO-style market code. Matches the keys of MARKET_CONFIG. */
  code: Market;
  /** Display name. */
  name: string;
  /** Region groups markets that share a wire format and pipeline shape.
   *  "UK" and "US" are one-market regions; "EU" covers all MAR-jurisdiction
   *  members and shares the EuDealing wire format. */
  region: "UK" | "US" | "EU";
  /** Primary listing currency (ISO 4217). Note: for UK this is the canonical
   *  product currency; an LSE-listed company can still disclose in EUR/USD —
   *  see the comment block on Dealing.currency below. */
  currency: string;
  /** Which wire format this market's dealings ride on. */
  wireType: "Dealing" | "UsDealing" | "EuDealing";
  /** What an insider/director identifier looks like in URLs and detail keys.
   *  - "opaque-hash": UK's `d-{16-char}` synthetic key
   *  - "cik": SEC 10-digit zero-padded reporter CIK
   *  - "normalized-name": lowercase + diacritic-folded reporter name (SE, NL)
   *  Lets clients build deep-link URLs and dedupe directors without sniffing. */
  directorIdKind: "opaque-hash" | "cik" | "normalized-name";
  /** Canonical endpoint paths a client should hit for this market. Resolved
   *  server-side so consumers don't hardcode the current naming asymmetry
   *  (`/api/dealings` vs `/api/us-dealings` vs `/api/eu-dealings?market=…`). */
  endpoints: {
    /** List endpoint. */
    dealings: string;
    /** Detail-by-id endpoint. Undefined when the market has no detail view
     *  (US, EU today — list-only). */
    dealing?: string;
    /** Director / insider detail-by-id endpoint. */
    directorDetail: string;
    /** Per-market news feed. */
    news: string;
  };
  /** Capability flags — which product surfaces this market currently lights
   *  up. Read once at client boot, not hardcoded per surface. Flip a flag
   *  here when the corresponding backend layer ships. */
  capabilities: {
    /** Per-dealing deep analysis (Analysis joined onto rows). */
    analysis: boolean;
    /** Performance / backtest harness — /api/performance equivalent. */
    performance: boolean;
    /** Portfolio surface — /api/portfolio equivalent. */
    portfolio: boolean;
    /** AI-generated morning / afternoon daily summary. */
    dailySummary: boolean;
    /** Per-market news feed (refreshUk/Us/Se/NlNews + /api/news/*). */
    news: boolean;
    /** Has automated tweet output (daily summaries, weekly movers). */
    tweets: boolean;
  };
}

export const MARKET_CONFIG: Record<Market, MarketConfig> = {
  UK: {
    code: "UK",
    name: "United Kingdom",
    region: "UK",
    currency: "GBP",
    wireType: "Dealing",
    directorIdKind: "opaque-hash",
    endpoints: {
      dealings: "/api/dealings",
      dealing: "/api/dealings/:id",
      directorDetail: "/api/directors/:id",
      news: "/api/news/uk",
    },
    capabilities: {
      analysis: true,
      performance: true,
      portfolio: true,
      dailySummary: true,
      news: true,
      tweets: true,
    },
  },
  US: {
    code: "US",
    name: "United States",
    region: "US",
    currency: "USD",
    wireType: "UsDealing",
    directorIdKind: "cik",
    endpoints: {
      dealings: "/api/us-dealings",
      directorDetail: "/api/directors/us/:id",
      news: "/api/news/us",
    },
    capabilities: {
      analysis: true,
      performance: false,
      portfolio: false,
      dailySummary: false,
      news: true,
      tweets: false,
    },
  },
  SE: {
    code: "SE",
    name: "Sweden",
    region: "EU",
    currency: "SEK",
    wireType: "EuDealing",
    directorIdKind: "normalized-name",
    endpoints: {
      dealings: "/api/eu-dealings?market=SE",
      directorDetail: "/api/directors/se/:id",
      news: "/api/news/se",
    },
    capabilities: {
      analysis: false,
      performance: false,
      portfolio: false,
      dailySummary: false,
      news: true,
      tweets: false,
    },
  },
  NL: {
    code: "NL",
    name: "Netherlands",
    region: "EU",
    currency: "EUR",
    wireType: "EuDealing",
    directorIdKind: "normalized-name",
    endpoints: {
      dealings: "/api/eu-dealings?market=NL",
      directorDetail: "/api/directors/nl/:id",
      news: "/api/news/nl",
    },
    capabilities: {
      analysis: false,
      performance: false,
      portfolio: false,
      dailySummary: false,
      news: true,
      tweets: false,
    },
  },
};

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

// DealingCurrency is the *disclosure* currency on a UK-pipeline row: an
// LSE-listed company can file its PDMR notification in EUR or USD (notably
// dollar-reporters and overseas ADRs cross-listed in London), in which case
// the worker preserves the raw figure in `price_native` and FX-converts to
// the canonical GBP-pence in `price_pence` / `value_gbp`.
//
// IMPORTANT — not the same axis as `EuDealing.currency`:
// - `Dealing.currency = "EUR"` ⇒ an LSE-listed issuer whose RNS happened to
//   report in EUR. Still a UK-pipeline row, still surfaced via /api/dealings.
// - `EuDealing.currency = "EUR"` ⇒ a Euronext-Amsterdam (or other EU venue)
//   listing under MAR Article 19. Different pipeline, different table,
//   /api/eu-dealings.
// Treat them as distinct concepts even though the string overlaps.
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
   *  the read API — not part of the raw Form 4 payload. Same nested shape as
   *  `Dealing.triage` / `EuDealing.triage` so clients have one consistent
   *  way to read triage across markets. */
  triage?: { verdict: UsTriageVerdict; reason: string };

  /** Deep analysis result for the parent filing+code+reporter group, when
   *  one exists. Joined in by the read API from us_analyses; absent (or null)
   *  when the group hasn't been enriched yet. The same Analysis shape UK
   *  dealings carry, so the same renderers apply on the frontend. */
  analysis?: Analysis | null;
}

export type UsTriageVerdict = "skip" | "maybe" | "promising";

/** Composite key for one logical Form 4 trade — matches the triple
 *  getUsDealingsGrouped collapses tranche rows on. The right granularity for
 *  both triage and analysis: joint-filer disclosures stay separate, multi-leg
 *  purchases at different prices collapse into one decision. */
export interface UsAnalysisKey {
  filing_id: string;
  transaction_code: string;
  reporter_cik: string;
}

/** Response shape for GET /api/directors/us/:id. Mirrors DirectorDetail
 *  field-by-field except prior_picks is typed against UsDealing so the
 *  wire format stays parallel rather than translated. age_band /
 *  tenure_years / profile are present on the type for shape-parity with
 *  DirectorDetail but always undefined in v1 — bio + tenure data lands in
 *  a follow-up. The :id is a reporter_cik. Horizon aggregates can be null
 *  while US data depth is shallow — frontend renders "—". */
export interface UsDirectorDetail {
  /** reporter_cik, zero-padded 10-digit. */
  id: string;
  name: string;
  /** Most recent role across this person's filings — flattened from the
   *  multi-checkbox UsReporter.roles. Falls back to "Insider" when empty. */
  role: string;
  /** Most recent issuer this person filed for. */
  company: string;
  age_band?: string;
  tenure_years?: number;
  profile?: {
    biography: string;
    track_record_summary: string;
    flags: string[];
  };
  prior_picks: UsDealing[];
  /** Fraction of resolved prior picks with a positive longest-horizon return,
   *  expressed as a percentage. 0 when no horizons have resolved. */
  hit_rate_pct: number;
  /** Average return at each horizon across resolved prior picks. Each value
   *  is null while that horizon has not resolved for any pick (the common
   *  case during the first 3 months of US coverage). Keyed "3m" | "6m" |
   *  "12m" | "24m" to match the UK shape. */
  avg_return_by_horizon: Record<string, number | null>;
}

// ============================================================================
// EU wire format — MAR Article 19 PDMR transactions
// ============================================================================
// Pan-EU spike. v1 source is Sweden's Finansinspektionen (FI) "Insynsregister"
// CSV export — the only NCA with a clean machine-readable feed of full Article
// 19 fields (LEI, ISIN, price, volume, MIC). NL/DE/FR added later via per-market
// modules; the wire format is designed to fit all of them since MAR mandates
// a harmonised notification template (Commission Implementing Regulation
// 2016/523, Annex).
//
// Field names use the MAR/MiFID English vocabulary (LEI, ISIN, MIC, PDMR) so
// the parser stays auditable against the underlying regulation rather than the
// per-country localisation of the CSV.

/** Source market. ISO 3166-1 alpha-2. Single source today; expected to grow
 *  as more NCAs come online. Runtime constant is the source of truth so
 *  validators stay in lockstep with the type — add a new market by appending
 *  to EU_MARKETS and the union widens automatically. */
export const EU_MARKETS = ["SE", "NL"] as const;
export type EuMarket = (typeof EU_MARKETS)[number];

export function isEuMarket(v: unknown): v is EuMarket {
  return (
    typeof v === "string" &&
    (EU_MARKETS as readonly string[]).includes(v)
  );
}

export interface EuReporter {
  /** Free-form person name (PDMR — "Person discharging managerial
   *  responsibilities", the EU's equivalent of an SEC "insider"). MAR has no
   *  cross-border stable identifier for individuals, so this is the join key
   *  for now. Cross-filing continuity is best-effort by exact name match. */
  name: string;
  /** Localised role text (FI: "Styrelseledamot" = board member, "VD" = CEO,
   *  "Annan ledande befattningshavare" = other senior officer). Carried
   *  verbatim; the iOS adapter maps to a product-level enum. */
  role: string;
  /** True when the filing is by a PCA ("Person closely associated" — family
   *  member or controlled entity) on behalf of the PDMR. Distinguishes a
   *  spouse's purchase from the director's own purchase, which matters for
   *  conviction signal. */
  is_closely_associated: boolean;
  /** The reporting entity (FI: Anmälningsskyldig). When the PDMR reports for
   *  themselves this equals `name`; for a PCA filing it's the PCA's legal
   *  name. Surfaced verbatim for indirect-ownership chain visibility. */
  filing_entity?: string;
}

/** MAR's nature-of-transaction enumerations are localised by each NCA but
 *  derive from the same Annex template. Carry the raw localised string and
 *  normalise at the edge.
 *
 *  FI strings seen so far: "Förvärv" (acquisition), "Avyttring" (disposal),
 *  "Tilldelning" (allotment/grant), "Pantsättning" (pledge), "Lån" (lending).
 *  Direction (acquisition vs disposal) is implicit in the string. */
export type EuTransactionNature = string;

export interface EuDealing {
  /** Deterministic id: `mar-{market}-{publication_ts}-{hash}` where hash is
   *  a short digest of (issuer LEI, reporter name, isin, trade_date, volume,
   *  price). FI CSV has no native row ID so we synthesise one. */
  id: string;
  /** Source market. */
  market: EuMarket;

  /** Transaktionsdatum — when the trade happened. Date-only; FI publishes
   *  timestamps but the time component is always 00:00:00. */
  trade_date: string;          // ISO
  /** Publiceringsdatum — when the NCA published the notification. Closest
   *  EU equivalent of EDGAR's file_date. Includes time of day. */
  disclosed_date: string;      // ISO datetime
  created_at?: string;         // ISO datetime UTC — when ingested

  /** PDMR or PCA who filed. */
  reporter: EuReporter;

  /** Issuer name (FI: Emittent). Legal entity name; not the trading name. */
  company: string;
  /** Legal Entity Identifier — the MAR-mandated cross-border issuer key.
   *  20 chars, ISO 17442. Stable across renames, M&A, and ticker changes.
   *  Use this as the canonical issuer ID, not `company` or `ticker`. */
  lei: string;
  /** ISIN — 12-char ISO 6166 security identifier. The cross-border security
   *  key under MAR; tickers vary by venue (`.ST`, `.AS`, etc.) but ISIN is
   *  unique. */
  isin: string;

  /** Free-text instrument name (FI: Instrumentnamn). Sometimes a share class
   *  ("XYZ AB ser. B"), sometimes a derivative description. */
  instrument_name: string;
  /** Instrument type (FI: Instrumenttyp). "Aktie" = share, "Option" = option,
   *  "Obligation" = bond, "Warrant" = warrant. Surfaced verbatim; the iOS
   *  adapter decides whether to display. */
  instrument_type: string;

  /** Nature of transaction (FI: Karaktär). Localised. See EuTransactionNature. */
  nature: EuTransactionNature;
  /** Volume of the transaction. Unit is `volume_unit` — usually "Antal" (count
   *  of shares) but can be a nominal value for bonds. */
  volume: number;
  /** Unit of volume (FI: Volymsenhet). Usually "Antal" = share count. */
  volume_unit: string;
  /** Price per unit. `null` for grants and some derivative transactions where
   *  no consideration applies. */
  price: number | null;
  /** Currency of `price`. Sweden mostly SEK with some EUR for cross-listed
   *  issuers; other NCAs will be mostly EUR. */
  currency: string;
  /** MIC (Market Identifier Code, ISO 10383) where the trade executed. FI
   *  publishes the venue name verbatim ("NASDAQ STOCKHOLM AB",
   *  "Utanför handelsplats" = "Outside trading venue"); we map to MIC code
   *  where possible and fall back to the raw string. */
  venue?: string;

  /** True when the notification is a correction of an earlier filing
   *  (FI: Korrigering = "Ja"). Analogue of Form 4/A. */
  is_amendment: boolean;
  /** Free-text reason for the correction (FI: Beskrivning av korrigering).
   *  Often "Felaktigt pris" (wrong price), "Felaktigt antal" (wrong count). */
  amendment_reason?: string;
  /** True when the filing is the PDMR's first-time notification with this
   *  issuer (FI: Är förstagångsrapportering). MAR-specific concept. */
  is_first_time_report: boolean;
  /** True when the transaction is linked to a share/option programme
   *  (FI: Är kopplad till aktieprogram). Analogue of US transaction codes
   *  A/M/F — programme-driven trades are weaker conviction signals. */
  is_share_programme: boolean;
  /** FI: Status. "Aktuell" = current/active; rows can be retracted. */
  status: string;

  /** Canonical display symbol resolved from `isin` via the per-market
   *  lookup in `worker/pipeline/eu/isin-tickers.ts` — UI only, no exchange
   *  suffix. Populated at read time by `getEuDealings`, so consumers that
   *  go through `raw_json` directly won't see it. Optional — names not in
   *  the lookup keep falling back to the ISIN until the map is extended.
   *  The vendor-specific Yahoo symbol is deliberately not exposed on the
   *  wire; it lives in the lookup module and is used only by server-side
   *  price-fetching code. */
  ticker?: string;

  /** Haiku triage verdict, attached at read time when the eu_triage row
   *  exists. Same {skip,maybe,promising} shape as the UK and US layers.
   *  Optional — null/absent on rows we haven't triaged yet. */
  triage?: { verdict: EuTriageVerdict; reason: string };
}

export type EuTriageVerdict = "skip" | "maybe" | "promising";

/** Response shape for GET /api/directors/se/:id. Same field set as
 *  DirectorDetail/UsDirectorDetail; prior_picks is typed against EuDealing.
 *  Person identity is by normalised reporter.name (lowercase + diacritic
 *  fold + whitespace collapse) — FI publishes no stable cross-border
 *  identifier for individuals. The :id is that normalised key; the API
 *  also accepts any spelling/case/diacritic variant in the URL since both
 *  sides go through the same normaliser. age_band / tenure_years / profile
 *  exist for shape-parity with the UK type but are always undefined in v1;
 *  Swedish public-figure coverage is too thin for a Haiku bio pass to be
 *  worth running. */
export interface EuDirectorDetail {
  /** Normalised key (URL-safe). */
  id: string;
  /** Best display form — the original reporter_name on the most recent
   *  matching filing. Preserves Swedish diacritics for display. */
  name: string;
  /** Most recent localised reporter.role across this person's filings
   *  (FI strings: "Styrelseledamot", "VD", etc.). */
  role: string;
  /** Most recent issuer this person filed for. */
  company: string;
  market: EuMarket;
  age_band?: string;
  tenure_years?: number;
  profile?: {
    biography: string;
    track_record_summary: string;
    flags: string[];
  };
  prior_picks: EuDealing[];
  /** Fraction of resolved prior picks with a positive longest-horizon return,
   *  expressed as a percentage. 0 when no horizons have resolved (the case
   *  during the first 3 months of SE coverage). */
  hit_rate_pct: number;
  /** Average return at each horizon across resolved prior picks. Null when
   *  the horizon has not resolved for any pick. Keyed "3m" | "6m" | "12m" |
   *  "24m" to match UK/US. */
  avg_return_by_horizon: Record<string, number | null>;
}

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
