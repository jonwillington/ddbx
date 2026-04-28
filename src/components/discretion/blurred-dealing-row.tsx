import type { Dealing } from "@/lib/api";
import type { Rating } from "../../../worker/db/types";
import { DealingRow } from "@/components/dealing-row";

interface Placeholder {
  ticker: string;
  company: string;
  director: string;
  role: string;
  valueGbp: number;
  pricePence: number;
  perfPct: number;
  rating: Rating | "skip";
}

const POOL: Placeholder[] = [
  { ticker: "GSK",  company: "GlaxoSmithKline plc",      director: "Eleanor Hayes",       role: "Chief Financial Officer",      valueGbp:  47830, pricePence: 1620, perfPct: -1.2, rating: "noteworthy" },
  { ticker: "BARC", company: "Barclays plc",             director: "Marcus Whitfield",    role: "Non-Executive Director",       valueGbp:  24500, pricePence:  295, perfPct:  3.4, rating: "minor" },
  { ticker: "RR",   company: "Rolls-Royce Holdings plc", director: "Olivia Thornton",     role: "Chair",                        valueGbp:  86200, pricePence:  640, perfPct:  8.7, rating: "significant" },
  { ticker: "VOD",  company: "Vodafone Group plc",       director: "Henry Ashcroft",      role: "Chief Executive Officer",      valueGbp:  31900, pricePence:   78, perfPct: -4.1, rating: "skip" },
  { ticker: "BP",   company: "BP plc",                   director: "Sarah Pemberton",     role: "Chief Financial Officer",      valueGbp: 145000, pricePence:  478, perfPct:  2.3, rating: "noteworthy" },
  { ticker: "TSCO", company: "Tesco plc",                director: "James Holloway",      role: "Director",                     valueGbp:   9800, pricePence:  362, perfPct: -0.8, rating: "minor" },
  { ticker: "AZN",  company: "AstraZeneca plc",          director: "Charlotte Reeves",    role: "Chief Executive Officer",      valueGbp: 230400, pricePence: 11920, perfPct: 12.1, rating: "significant" },
  { ticker: "LLOY", company: "Lloyds Banking Group plc", director: "Daniel Mercer",       role: "Non-Executive Director",       valueGbp:  18750, pricePence:   54, perfPct:  1.6, rating: "minor" },
  { ticker: "DGE",  company: "Diageo plc",               director: "Imogen Calloway",     role: "Chair",                        valueGbp:  52000, pricePence: 2470, perfPct: -2.4, rating: "skip" },
  { ticker: "REL",  company: "RELX plc",                 director: "Thomas Hartwell",     role: "Chief Financial Officer",      valueGbp:  67500, pricePence: 3420, perfPct:  5.9, rating: "noteworthy" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pick(seed: string, index: number): Placeholder {
  return POOL[hash(`${seed}-${index}`) % POOL.length];
}

function placeholderDealing(seed: string, index: number, isoDate: string): Dealing {
  const p = pick(seed, index);
  const isSkipped = p.rating === "skip";

  return {
    id: `__placeholder__-${seed}-${index}`,
    trade_date: isoDate,
    disclosed_date: isoDate,
    director: {
      id: `__placeholder__-${seed}-${index}-d`,
      name: p.director,
      role: p.role,
      company: p.company,
    },
    ticker: `${p.ticker}.L`,
    company: p.company,
    tx_type: "buy",
    shares: Math.max(1, Math.round((p.valueGbp * 100) / p.pricePence)),
    price_pence: p.pricePence,
    value_gbp: p.valueGbp,
    triage: isSkipped ? { verdict: "skip", reason: "" } : undefined,
    analysis: isSkipped
      ? undefined
      : {
          rating: p.rating as Rating,
          confidence: 0.7,
          summary: "",
          thesis_points: [],
          evidence_for: [],
          evidence_against: [],
          key_risks: [],
          catalyst_window: "6m",
        },
  };
}

export function BlurredDealingRow({
  seed,
  index,
  isoDate,
  showVsFtse,
  hideDate,
}: {
  seed: string;
  index: number;
  /** ISO date used for the row's date column. Should match the day this row stands in for. */
  isoDate: string;
  showVsFtse?: boolean;
  hideDate?: boolean;
}) {
  const p = pick(seed, index);
  const dealing = placeholderDealing(seed, index, isoDate);
  const currentPricePence = Math.max(
    1,
    Math.round(p.pricePence * (1 + p.perfPct / 100)),
  );
  // Plausible-looking FTSE bracket so the vs-FTSE pill renders.
  const ftseEntryPence = 820000;
  const ftseCurrentPence = Math.round(ftseEntryPence * 1.012);

  return (
    <div
      aria-hidden
      className="pointer-events-none select-none"
      style={{ filter: "blur(4px)" }}
    >
      <DealingRow
        dealing={dealing}
        currentPricePence={currentPricePence}
        ftseEntryPence={ftseEntryPence}
        ftseCurrentPence={ftseCurrentPence}
        showVsFtse={showVsFtse}
        hideDate={hideDate}
        onSelect={() => {}}
      />
    </div>
  );
}
