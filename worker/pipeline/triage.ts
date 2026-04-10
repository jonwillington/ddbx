import type { Env } from "../index";
import type { Dealing, TriageVerdict } from "../db/types";
import { callAnthropic, type CallResult } from "../llm/anthropic";
import { TRIAGE_PROMPT } from "../llm/prompts";

export interface TriageResult {
  verdict: TriageVerdict;
  reason: string;
  usage: CallResult;
}

// Cheap Haiku pass — runs on every dealing, replaces a flat £ threshold with
// context-aware filtering (director seniority, age, prior track record, % of
// disclosed net worth, company drawdown, etc).
export async function triageDealing(
  env: Env,
  dealing: Dealing,
): Promise<TriageResult> {
  const userMsg = JSON.stringify({
    dealing: {
      director: dealing.director,
      ticker: dealing.ticker,
      company: dealing.company,
      tx_type: dealing.tx_type,
      value_gbp: dealing.value_gbp,
      price_pence: dealing.price_pence,
      shares: dealing.shares,
      trade_date: dealing.trade_date,
    },
  });

  const resp = await callAnthropic(env, {
    model: "claude-haiku-4-5-20251001",
    system: TRIAGE_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    max_tokens: 256,
  });

  const fallback = { verdict: "skip" as TriageVerdict, reason: "triage parse error" };
  try {
    const parsed = extractJson(resp.text);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.verdict === "string" &&
      ["skip", "maybe", "promising"].includes(parsed.verdict)
    ) {
      return {
        verdict: parsed.verdict as TriageVerdict,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
        usage: resp,
      };
    }
  } catch {
    /* fall through */
  }
  return { ...fallback, usage: resp };
}

// The model occasionally wraps JSON in ```json fences or adds preamble;
// grab the first {...} block defensively.
function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return JSON.parse(candidate.slice(start, end + 1));
}
