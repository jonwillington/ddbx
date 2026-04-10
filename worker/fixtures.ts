import type {
  Dealing,
  DirectorDetail,
  Portfolio,
} from "./db/types";

// Realistic-looking mock data used until the pipeline starts writing real
// rows. Shared by both the Worker API (for dev) and can be imported by the
// frontend for Storybook-style previews if needed.

const dealings: Dealing[] = [
  {
    id: "d-0001",
    trade_date: "2026-04-02",
    disclosed_date: "2026-04-03",
    director: {
      id: "dir-smith-j",
      name: "James Smith",
      role: "CEO",
      company: "Marshalls plc",
      age_band: "50s",
      tenure_years: 6,
    },
    ticker: "MSLH.L",
    company: "Marshalls plc",
    tx_type: "buy",
    shares: 50_000,
    price_pence: 248.5,
    value_gbp: 124_250,
    triage: {
      verdict: "promising",
      reason: "Meaningful size vs prior trades; stock in 35% drawdown.",
    },
    analysis: {
      rating: "significant",
      confidence: 0.78,
      summary:
        "CEO made his largest-ever open-market purchase into a 35% drawdown, two weeks before a scheduled trading update.",
      thesis_points: [
        "James Smith's £124k buy is the biggest personal purchase in his six-year tenure, at a 9x forward P/E and 35% below the two-year high.",
        "Prior buys by Smith returned an average of +22% at 12 months across three trades, all made into cycle weakness.",
        "Building-products leading indicators turned positive in February 2026 and the balance sheet is clean.",
        "The size and timing are both unusual for this director, which is the main reason this rises above the noise.",
      ],
      evidence_for: [
        {
          headline: "Largest personal buy in a six-year tenure",
          detail: "£124k vs a prior average of £18k across three earlier purchases - a near 7x step-up in size.",
          source_label: "RNS PDMR filings 2020-2026",
        },
        {
          headline: "Stock at 9x forward P/E, 35% below its two-year high",
          detail: "Valuation is at the low end of the five-year historical range for a business with stable margins.",
          source_label: "Yahoo Finance price history",
        },
        {
          headline: "Housebuilder leading indicators turned positive in February 2026",
          detail: "UK construction PMI returned above 50 for the first time since mid-2024, with residential new orders leading the move.",
          source_label: "ONS construction PMI Feb 2026",
          source_url: "https://www.ons.gov.uk/economy/economicoutputandproductivity/output/bulletins/constructionoutputingreatbritain/february2026",
        },
        {
          headline: "Prior CEO buys returned an average of +22% at 12 months",
          detail: "Three for three hit rate across prior trades, all made into cycle weakness.",
          source_label: "Internal performance tracker",
        },
      ],
      evidence_against: [
        {
          headline: "Interest rate path remains uncertain",
          detail: "Housing is rate-sensitive and the BoE has signalled no rush to cut further given sticky services inflation.",
          source_label: "BoE MPC minutes March 2026",
          source_url: "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/march-2026",
        },
        {
          headline: "Trade falls two weeks before a scheduled update",
          detail: "Cynically, a buy just before a trading statement could be designed to signal confidence rather than reflect genuine conviction.",
          source_label: "Company IR calendar",
        },
      ],
      key_risks: [
        "Trading update disappoints and confirms continued cycle weakness",
        "Rate hold extends into H2 2026",
      ],
      catalyst_window: "6m",
    },
    performance: [
      { horizon_days: 90, return_pct: null, as_of_date: null },
      { horizon_days: 180, return_pct: null, as_of_date: null },
      { horizon_days: 365, return_pct: null, as_of_date: null },
      { horizon_days: 730, return_pct: null, as_of_date: null },
    ],
  },
  {
    id: "d-0002",
    trade_date: "2026-04-01",
    disclosed_date: "2026-04-02",
    director: {
      id: "dir-khan-p",
      name: "Priya Khan",
      role: "Non-Executive Director",
      company: "Oxford Instruments plc",
      age_band: "30s",
      tenure_years: 1,
    },
    ticker: "OXIG.L",
    company: "Oxford Instruments plc",
    tx_type: "buy",
    shares: 400,
    price_pence: 2_240,
    value_gbp: 8_960,
    triage: {
      verdict: "maybe",
      reason:
        "Small £ but meaningful for a young NED in first year — worth surfacing despite size.",
    },
    analysis: {
      rating: "noteworthy",
      confidence: 0.62,
      summary:
        "Newly appointed NED made her first open-market purchase within a year of joining, in a business with pricing power and no prior selling.",
      thesis_points: [
        "First open-market purchase by a newly appointed non-exec, made within twelve months of joining the board.",
        "At £8.9k the absolute size is small, but for a director in the first year of tenure this is a plausible personal allocation with real money at risk.",
        "Oxford Instruments operates in scientific instruments with sticky customer relationships and has held operating margins through the cycle.",
      ],
      evidence_for: [
        {
          headline: "First purchase within 12 months of joining the board",
          detail: "Early buying by a new NED tends to reflect genuine conviction rather than routine top-up behaviour.",
          source_label: "RNS appointment notice 2025-04",
        },
        {
          headline: "Scientific instruments segment held margins through the 2022-2024 downturn",
          detail: "Operating margins have stayed in the 14-17% range across four consecutive years of macro headwinds.",
          source_label: "FY25 annual report segmental analysis",
        },
      ],
      evidence_against: [
        {
          headline: "£8.9k is below the threshold most signal screens require",
          detail: "At this size the purchase barely registers relative to a NED fee of around £60k per year.",
          source_label: "Internal triage logic",
        },
        {
          headline: "No prior trading history to judge against",
          detail: "Without a baseline it is impossible to know whether this trade is unusual for this director.",
          source_label: "RNS history check",
        },
      ],
      key_risks: ["Too little history to assess director conviction"],
      catalyst_window: "12m",
    },
    performance: [
      { horizon_days: 90, return_pct: null, as_of_date: null },
      { horizon_days: 180, return_pct: null, as_of_date: null },
      { horizon_days: 365, return_pct: null, as_of_date: null },
      { horizon_days: 730, return_pct: null, as_of_date: null },
    ],
  },
  {
    id: "d-0003",
    trade_date: "2026-04-01",
    disclosed_date: "2026-04-02",
    director: {
      id: "dir-brown-r",
      name: "Robert Brown",
      role: "CFO",
      company: "Centrica plc",
      age_band: "50s",
      tenure_years: 4,
    },
    ticker: "CNA.L",
    company: "Centrica plc",
    tx_type: "buy",
    shares: 75_000,
    price_pence: 152.3,
    value_gbp: 114_225,
    triage: {
      verdict: "promising",
      reason: "CFO buying post-results after strong cash generation guidance.",
    },
    analysis: {
      rating: "noteworthy",
      confidence: 0.55,
      summary:
        "CFO bought £114k of shares inside the post-results window after guiding FY26 free cash flow roughly 10% above consensus.",
      thesis_points: [
        "CFO purchase within the post-results dealing window following guidance that FY26 free cash flow will exceed consensus.",
        "Brown's prior purchases are flat on average, so the signal here is the timing and the FCF guide rather than the director's track record.",
        "Centrica's retail energy business is increasingly predictable cash-wise, even if politically noisy.",
      ],
      evidence_for: [
        {
          headline: "Buy falls inside the post-results open window",
          detail: "The dealing date confirms this is not a close-period purchase, removing any regulatory ambiguity.",
          source_label: "Company dealing calendar",
        },
        {
          headline: "FY26 FCF guide around 10% above analyst consensus",
          detail: "Management guided to free cash flow of approximately £1.4bn against a consensus of £1.27bn at the time of results.",
          source_label: "RNS 2026-03-28 results",
        },
      ],
      evidence_against: [
        {
          headline: "Brown's prior buys have averaged -4% at 12 months",
          detail: "Four prior trades, two profitable and two not, giving a below-average hit rate for a CFO-level buyer.",
          source_label: "Internal tracker",
        },
        {
          headline: "Energy retail policy is a recurring political risk",
          detail: "Price cap interventions and windfall tax extensions have surprised the market twice in three years.",
          source_label: "UK election cycle commentary",
        },
      ],
      key_risks: ["Political intervention on retail tariffs", "Commodity reversal hitting upstream margins"],
      catalyst_window: "6m",
    },
    performance: [
      { horizon_days: 90, return_pct: null, as_of_date: null },
      { horizon_days: 180, return_pct: null, as_of_date: null },
      { horizon_days: 365, return_pct: null, as_of_date: null },
      { horizon_days: 730, return_pct: null, as_of_date: null },
    ],
  },
  {
    id: "d-0004",
    trade_date: "2026-03-30",
    disclosed_date: "2026-03-31",
    director: {
      id: "dir-taylor-a",
      name: "Amanda Taylor",
      role: "Chair",
      company: "THG plc",
      age_band: "50s",
      tenure_years: 2,
    },
    ticker: "THG.L",
    company: "THG plc",
    tx_type: "buy",
    shares: 120_000,
    price_pence: 52.1,
    value_gbp: 62_520,
    triage: {
      verdict: "maybe",
      reason: "Chair top-up; history of small regular buys regardless of price.",
    },
    analysis: {
      rating: "minor",
      confidence: 0.4,
      summary:
        "Chair buying looks routine rather than signals - near-identical trades every quarter for two years with a negative average return.",
      thesis_points: [
        "Amanda Taylor has bought THG shares in roughly the same size every quarter for the past two years.",
        "This regularity strips the signal value from any individual trade, and her prior trades have averaged -6% at 12 months.",
        "The valuation is genuinely cheap at 0.8x book, but the buying pattern looks mechanical rather than opportunistic.",
      ],
      evidence_for: [
        {
          headline: "Company trading at 0.8x book value",
          detail: "Tangible assets include a significant owned logistics and fulfilment infrastructure.",
          source_label: "Yahoo Finance",
        },
      ],
      evidence_against: [
        {
          headline: "Near-identical trades in each of the prior 8 quarters",
          detail: "The regularity and consistent sizing suggests a standing instruction rather than a timing decision.",
          source_label: "RNS history",
        },
        {
          headline: "Prior trades by this chair averaged -6% at 12 months",
          detail: "Eight trades, six of which are in the red at the 12-month mark.",
          source_label: "Internal tracker",
        },
      ],
      key_risks: ["Structural unit economics pressure in beauty and nutrition"],
      catalyst_window: "12m",
    },
    performance: [
      { horizon_days: 90, return_pct: null, as_of_date: null },
      { horizon_days: 180, return_pct: null, as_of_date: null },
      { horizon_days: 365, return_pct: null, as_of_date: null },
      { horizon_days: 730, return_pct: null, as_of_date: null },
    ],
  },
  {
    id: "d-0005",
    trade_date: "2026-03-29",
    disclosed_date: "2026-03-30",
    director: {
      id: "dir-walker-t",
      name: "Thomas Walker",
      role: "Executive Director",
      company: "Burberry Group plc",
      age_band: "40s",
      tenure_years: 3,
    },
    ticker: "BRBY.L",
    company: "Burberry Group plc",
    tx_type: "buy",
    shares: 8_000,
    price_pence: 780,
    value_gbp: 62_400,
    triage: {
      verdict: "skip",
      reason: "Routine scheme-adjacent purchase; director has weak track record.",
    },
  },
];

// A few closed (historical) picks with realized performance so Portfolio
// and Director pages have something to render.
const historicalDealings: Dealing[] = [
  {
    id: "d-h001",
    trade_date: "2024-10-15",
    disclosed_date: "2024-10-16",
    director: {
      id: "dir-smith-j",
      name: "James Smith",
      role: "CEO",
      company: "Marshalls plc",
      age_band: "50s",
      tenure_years: 6,
    },
    ticker: "MSLH.L",
    company: "Marshalls plc",
    tx_type: "buy",
    shares: 10_000,
    price_pence: 210,
    value_gbp: 21_000,
    triage: { verdict: "promising", reason: "Prior conviction buy" },
    analysis: {
      rating: "noteworthy",
      confidence: 0.6,
      summary: "CEO bought into cycle weakness at a price 20% below where he had previously sold.",
      thesis_points: ["Earlier conviction buy into cycle weakness."],
      evidence_for: [],
      evidence_against: [],
      key_risks: [],
      catalyst_window: "12m",
    },
    performance: [
      { horizon_days: 90, return_pct: 0.08, as_of_date: "2025-01-13" },
      { horizon_days: 180, return_pct: 0.14, as_of_date: "2025-04-13" },
      { horizon_days: 365, return_pct: 0.18, as_of_date: "2025-10-15" },
      { horizon_days: 730, return_pct: null, as_of_date: null },
    ],
  },
  {
    id: "d-h002",
    trade_date: "2024-06-20",
    disclosed_date: "2024-06-21",
    director: {
      id: "dir-brown-r",
      name: "Robert Brown",
      role: "CFO",
      company: "Centrica plc",
      age_band: "50s",
      tenure_years: 4,
    },
    ticker: "CNA.L",
    company: "Centrica plc",
    tx_type: "buy",
    shares: 50_000,
    price_pence: 140,
    value_gbp: 70_000,
    triage: { verdict: "promising", reason: "" },
    analysis: {
      rating: "noteworthy",
      confidence: 0.5,
      summary: "CFO bought £70k of shares following a period of sector underperformance.",
      thesis_points: ["CFO bought £70k of shares following a period of sector underperformance."],
      evidence_for: [],
      evidence_against: [],
      key_risks: [],
      catalyst_window: "12m",
    },
    performance: [
      { horizon_days: 90, return_pct: -0.05, as_of_date: "2024-09-18" },
      { horizon_days: 180, return_pct: -0.02, as_of_date: "2024-12-17" },
      { horizon_days: 365, return_pct: 0.09, as_of_date: "2025-06-20" },
      { horizon_days: 730, return_pct: null, as_of_date: null },
    ],
  },
];

const directors: DirectorDetail[] = [
  {
    id: "dir-smith-j",
    name: "James Smith",
    role: "CEO",
    company: "Marshalls plc",
    age_band: "50s",
    tenure_years: 6,
    profile: {
      biography:
        "James Smith has served as CEO of Marshalls plc since 2020, having joined the board as CFO in 2017. Background in building materials and prior CFO role at a FTSE 250 industrial.",
      track_record_summary:
        "3 prior open-market purchases, all in cycle drawdowns. Average 12-month return +22%. Pattern suggests counter-cyclical conviction rather than cosmetic buying.",
      flags: [],
    },
    prior_picks: historicalDealings.filter((d) => d.director.id === "dir-smith-j"),
    hit_rate_pct: 100,
    avg_return_by_horizon: { "3m": 0.08, "6m": 0.14, "12m": 0.18, "24m": null },
  },
  {
    id: "dir-brown-r",
    name: "Robert Brown",
    role: "CFO",
    company: "Centrica plc",
    age_band: "50s",
    tenure_years: 4,
    profile: {
      biography: "CFO of Centrica since 2022. Previously group financial controller at SSE.",
      track_record_summary: "Mixed track record — 4 prior buys, avg -4% at 12m.",
      flags: [],
    },
    prior_picks: historicalDealings.filter((d) => d.director.id === "dir-brown-r"),
    hit_rate_pct: 50,
    avg_return_by_horizon: { "3m": -0.05, "6m": -0.02, "12m": 0.09, "24m": null },
  },
];

const portfolio: Portfolio = {
  fy: 26,
  fy_start: "2026-04-06",
  fy_end: "2027-04-05",
  as_of: "2026-04-08",
  in_progress: true,
  picks_curve: [
    { date: "2026-04-06", value_gbp: 200 },
    { date: "2026-04-07", value_gbp: 204 },
    { date: "2026-04-08", value_gbp: 209 },
  ],
  ftse_curve: [
    { date: "2026-04-06", value_gbp: 200 },
    { date: "2026-04-07", value_gbp: 201 },
    { date: "2026-04-08", value_gbp: 202 },
  ],
  picks_return_pct: 0.045,
  ftse_return_pct: 0.01,
  alpha_pp: 3.5,
  picks_count: 2,
  starting_value_gbp: 200,
  picks: [],
  available_fys: [
    {
      fy: 25,
      start: "2025-04-06",
      end: "2026-04-05",
      in_progress: false,
      picks_count: 0,
    },
    {
      fy: 26,
      start: "2026-04-06",
      end: "2027-04-05",
      in_progress: true,
      picks_count: 2,
    },
  ],
};

export const FIXTURES = {
  dealings: [...dealings, ...historicalDealings],
  directors,
  portfolio,
};
