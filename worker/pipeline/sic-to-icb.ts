// SIC 2007 → ICB top-level industry mapping.
//
// SIC 2007 (UK Standard Industrial Classification of Economic Activities, 2007)
// is the classification Companies House attaches to every UK-registered
// company. It has 21 sections (A–U) split into ~88 two-digit divisions.
// Source: https://www.ons.gov.uk/methodology/classificationsandstandards/ukstandardindustrialclassificationofeconomicactivities/uksic2007
//
// ICB (Industry Classification Benchmark, FTSE Russell) groups equities into
// 11 top-level industries and is the framework the LSE itself uses for sector
// indices. Mapping is approximate — many divisions span multiple ICB
// industries (e.g. SIC 32 "Other manufacturing" includes both medical
// instruments and toys); in those cases we pick the modal listing for UK
// public companies. Refine on a case-by-case basis if real-world data shows
// the bucket is wrong for a given ticker.

import type { SectorNormalized } from "../db/types";

const DIVISION_TO_ICB: Record<string, SectorNormalized> = {
  // Section A — Agriculture, forestry and fishing
  "01": "Consumer Staples",
  "02": "Consumer Staples",
  "03": "Consumer Staples",

  // Section B — Mining and quarrying
  "05": "Energy",          // Coal mining
  "06": "Energy",          // Oil & gas extraction
  "07": "Basic Materials", // Metal ores
  "08": "Basic Materials", // Other mining and quarrying
  "09": "Energy",          // Mining support (mostly oilfield services)

  // Section C — Manufacturing
  "10": "Consumer Staples", // Food products
  "11": "Consumer Staples", // Beverages
  "12": "Consumer Staples", // Tobacco
  "13": "Consumer Discretionary", // Textiles
  "14": "Consumer Discretionary", // Wearing apparel
  "15": "Consumer Discretionary", // Leather
  "16": "Basic Materials",  // Wood products
  "17": "Basic Materials",  // Paper products
  "18": "Industrials",      // Printing
  "19": "Energy",           // Coke and refined petroleum
  "20": "Basic Materials",  // Chemicals
  "21": "Health Care",      // Pharmaceuticals
  "22": "Industrials",      // Rubber and plastics
  "23": "Basic Materials",  // Other non-metallic mineral products (cement, glass)
  "24": "Basic Materials",  // Basic metals
  "25": "Industrials",      // Fabricated metal
  "26": "Technology",       // Computer, electronic, optical products
  "27": "Industrials",      // Electrical equipment
  "28": "Industrials",      // Machinery and equipment n.e.c.
  "29": "Consumer Discretionary", // Motor vehicles
  "30": "Industrials",      // Other transport equipment (ships, aircraft, rail)
  "31": "Consumer Discretionary", // Furniture
  "32": "Industrials",      // Other manufacturing
  "33": "Industrials",      // Repair and installation

  // Section D — Electricity/gas/steam
  "35": "Utilities",

  // Section E — Water/sewerage/waste
  "36": "Utilities",
  "37": "Utilities",
  "38": "Utilities",
  "39": "Utilities",

  // Section F — Construction
  "41": "Industrials",
  "42": "Industrials",
  "43": "Industrials",

  // Section G — Wholesale and retail trade
  "45": "Consumer Discretionary", // Motor vehicle trade
  "46": "Industrials",            // Wholesale trade
  "47": "Consumer Discretionary", // Retail trade

  // Section H — Transportation and storage
  "49": "Industrials",
  "50": "Industrials",
  "51": "Industrials",
  "52": "Industrials",
  "53": "Industrials",

  // Section I — Accommodation and food service
  "55": "Consumer Discretionary",
  "56": "Consumer Discretionary",

  // Section J — Information and communication
  // 58 is mostly book/newspaper publishing in UK; software publishing is rare
  // — software companies typically use 62 instead.
  "58": "Consumer Discretionary",
  "59": "Consumer Discretionary", // Motion picture, music
  "60": "Telecommunications",     // Programming and broadcasting
  "61": "Telecommunications",
  "62": "Technology",             // Computer programming
  "63": "Technology",             // Information service activities

  // Section K — Financial and insurance
  "64": "Financials",
  "65": "Financials",
  "66": "Financials",

  // Section L — Real estate
  "68": "Real Estate",

  // Section M — Professional/scientific/technical
  "69": "Industrials",            // Legal and accounting
  "70": "Industrials",            // Head offices, management consultancy
  "71": "Industrials",            // Architecture and engineering
  "72": "Industrials",            // Scientific R&D (biotech R&D more often 21)
  "73": "Consumer Discretionary", // Advertising and market research
  "74": "Industrials",            // Other professional/scientific/technical
  "75": "Consumer Discretionary", // Veterinary

  // Section N — Administrative and support service
  "77": "Industrials",
  "78": "Industrials",
  "79": "Consumer Discretionary", // Travel agency
  "80": "Industrials",
  "81": "Industrials",
  "82": "Industrials",

  // Section O — Public administration (rare for listed)
  "84": "Industrials",

  // Section P — Education
  "85": "Consumer Discretionary",

  // Section Q — Human health and social work
  "86": "Health Care",
  "87": "Health Care",
  "88": "Health Care",

  // Section R — Arts/entertainment/recreation
  "90": "Consumer Discretionary",
  "91": "Consumer Discretionary",
  "92": "Consumer Discretionary",
  "93": "Consumer Discretionary",

  // Section S — Other service activities
  "94": "Consumer Discretionary",
  "95": "Consumer Discretionary",
  "96": "Consumer Discretionary",

  // Section T — Households as employers (rare for listed)
  "97": "Consumer Discretionary",
  "98": "Consumer Discretionary",

  // Section U — Extraterritorial organisations (rare for listed)
  "99": "Industrials",
};

// Codes that don't tell us anything about what the operating business does.
// 99999 / 98000 = "None Supplied" placeholders for new/shell entities.
// 82990 = "Other business support service activities n.e.c." — a catch-all.
// 64201 / 64202 / 64209 = "Activities of holding companies" — extremely
// common for UK listcos because the parent entity owns operating subs (e.g.
// Breedon Group's parent is a 64209 holdco even though the subs quarry
// aggregates). When the only SIC is one of these, fall through to the LLM.
const SENTINEL_CODES = new Set([
  "99999",
  "98000",
  "82990",
  "64201",
  "64202",
  "64209",
]);

export function sicToIcb(rawCode: string): SectorNormalized | null {
  const trimmed = rawCode.trim();
  if (!trimmed || SENTINEL_CODES.has(trimmed)) return null;
  const division = trimmed.slice(0, 2);
  return DIVISION_TO_ICB[division] ?? null;
}

// Reduce a list of SIC codes (as Companies House returns 1–4 per company) to
// a single ICB industry by majority vote, falling back to the first valid
// mapping if there's no clear winner.
export function pickIcbFromCodes(codes: readonly string[]): SectorNormalized | null {
  const tally = new Map<SectorNormalized, number>();
  let firstHit: SectorNormalized | null = null;
  for (const code of codes) {
    const icb = sicToIcb(code);
    if (!icb) continue;
    if (firstHit === null) firstHit = icb;
    tally.set(icb, (tally.get(icb) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  let best: SectorNormalized | null = null;
  let bestCount = 0;
  for (const [icb, count] of tally) {
    if (count > bestCount) {
      best = icb;
      bestCount = count;
    }
  }
  return best ?? firstHit;
}
