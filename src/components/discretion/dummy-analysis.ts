import type { Analysis } from "../../../worker/db/types";

// Static placeholder rendered under a CSS blur when discretion mode gates the
// drawer. The text is never legible on screen, but stays realistic so the
// shape of the analysis (length, structure) reads as the "real thing" behind
// the frosted glass.
export const DUMMY_ANALYSIS: Analysis = {
  rating: "noteworthy",
  confidence: 0.72,
  catalyst_window: "6m",
  summary:
    "The director's open-market purchase comes ahead of a scheduled trading update and follows a multi-month period of share price weakness.",
  thesis_points: [
    "Recent management commentary points to improving order intake across the core division, with a meaningful pickup expected in the second half.",
    "The buyer has a strong personal track record on prior open-market purchases at this company, and the size of this transaction is material relative to their salary.",
    "Sector peers are trading on richer multiples despite weaker margins, suggesting the market has not yet priced the operational improvements management has flagged.",
    "A scheduled trading statement next month is the obvious near-term catalyst that could close the valuation gap.",
  ],
  evidence_for: [
    {
      headline: "Margin recovery is tracking ahead of plan",
      detail:
        "The most recent half-year report showed gross margin expansion in the core division, with management guiding to further improvement as legacy contracts roll off.",
      source_label: "Half-year results, 2026",
      source_url: "https://example.com/results",
    },
    {
      headline: "Director has a strong open-market record",
      detail:
        "Two prior personal purchases at this company preceded periods of double-digit outperformance versus the FTSE All-Share over twelve months.",
      source_label: "Director track record",
      source_url: "https://example.com/track-record",
    },
    {
      headline: "Peers are trading at a premium",
      detail:
        "Comparable mid-cap names in the sector trade at a meaningful EV/EBITDA premium despite delivering lower margins, suggesting room for re-rating.",
      source_label: "Sector valuation comparison",
      source_url: "https://example.com/peers",
    },
  ],
  evidence_against: [
    {
      headline: "Currency exposure remains a headwind",
      detail:
        "A material share of revenue is generated overseas, and recent sterling strength may weigh on reported numbers in the next update.",
      source_label: "Annual report 2026",
      source_url: "https://example.com/fx",
    },
    {
      headline: "Order book lumpiness obscures the trend",
      detail:
        "Quarterly disclosures show high variance in order intake, making it harder to read the underlying trajectory from a single update.",
      source_label: "Trading update commentary",
      source_url: "https://example.com/orders",
    },
  ],
  key_risks: [
    "A miss on the scheduled trading update would unwind much of the recent recovery in sentiment.",
    "Sustained sterling strength could compress reported margins on overseas contracts.",
    "Working capital swings have been a recurring drag and may surprise on the downside again.",
  ],
  checklist: {
    open_market_buy: true,
    senior_insider: true,
    meaningful_conviction: true,
    no_alternative_explanation: true,
    supporting_context_found: true,
    no_major_counter_signal: false,
  },
};
