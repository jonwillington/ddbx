import type { Env } from "../index";
import { callAnthropic } from "../llm/anthropic";
import { EXTRACT_PROMPT } from "../llm/prompts";

export interface ExtractedDealing {
  director_name: string;
  role: string;
  trade_date: string; // ISO
  transaction_type:
    | "open_market_buy"
    | "vesting"
    | "transfer"
    | "sell"
    | "other";
  shares: number;
  price_pence: number;
  value_gbp: number;
  is_open_market_buy: boolean;
}

export interface ExtractInput {
  url: string;
  headline: string;
  company: string;
  ticker: string;
  body: string;
}

// Takes the plain text of a PDMR announcement and asks Haiku to extract
// structured trade details + classify whether it is an open-market buy
// (the only kind we care about for signal).
export async function extractDealing(
  env: Env,
  input: ExtractInput,
): Promise<ExtractedDealing | null> {
  const userMsg = JSON.stringify(input);
  const resp = await callAnthropic(env, {
    model: "claude-haiku-4-5-20251001",
    system: EXTRACT_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    max_tokens: 512,
  });

  const parsed = extractJson(resp.text);
  if (!parsed) return null;
  if (
    typeof parsed.director_name !== "string" ||
    typeof parsed.trade_date !== "string" ||
    typeof parsed.shares !== "number" ||
    typeof parsed.price_pence !== "number"
  ) {
    return null;
  }
  // Numeric reconciliation (price/shares unit errors) lives in
  // reconcile.ts and runs in scrape.ts where market data is available.
  return {
    director_name: parsed.director_name,
    role: typeof parsed.role === "string" ? parsed.role : "",
    trade_date: parsed.trade_date,
    transaction_type: normalizeType(parsed.transaction_type),
    shares: parsed.shares,
    price_pence: parsed.price_pence,
    value_gbp:
      typeof parsed.value_gbp === "number" ? parsed.value_gbp : 0,
    is_open_market_buy: !!parsed.is_open_market_buy,
  };
}

function normalizeType(t: unknown): ExtractedDealing["transaction_type"] {
  if (typeof t !== "string") return "other";
  const s = t.toLowerCase();
  if (s.includes("open") && s.includes("buy")) return "open_market_buy";
  if (s.includes("vest") || s.includes("ltip") || s.includes("scheme"))
    return "vesting";
  if (s.includes("transfer")) return "transfer";
  if (s.includes("sell") || s.includes("disposal")) return "sell";
  return "other";
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
