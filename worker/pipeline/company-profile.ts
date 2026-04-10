import type { Env } from "../index";
import { callAnthropic } from "../llm/anthropic";
import { COMPANY_PROFILE_PROMPT } from "../llm/prompts";
import { getTickerProfileAge, updateCompanyProfile } from "../db/writes";

// Refresh the Opus-generated profile for a ticker if it's missing or stale.
// Profiles are gated to once per ~90 days because company fundamentals don't
// move that fast and each call uses web_search (~5 tool calls of latency).
const STALE_DAYS = 90;

export async function ensureCompanyProfile(
  env: Env,
  ticker: string,
  companyName: string,
): Promise<void> {
  const { exists, updated_at } = await getTickerProfileAge(env, ticker);
  if (!exists) return; // upsertTicker hasn't run yet — nothing to update
  if (updated_at && !isStale(updated_at)) return;

  const userMsg = JSON.stringify({ ticker, company_name: companyName });

  const resp = await callAnthropic(env, {
    model: "claude-opus-4-6",
    system: COMPANY_PROFILE_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    max_tokens: 1500,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
  });

  const parsed = extractJson(resp.text);
  if (!parsed) throw new Error("company-profile: no JSON object in response");
  if (
    typeof parsed.description !== "string" ||
    typeof parsed.sector !== "string"
  ) {
    throw new Error("company-profile: missing required fields");
  }

  const key_facts: string[] = Array.isArray(parsed.key_facts)
    ? parsed.key_facts.filter(
        (f: unknown): f is string => typeof f === "string" && f.trim().length > 0,
      )
    : [];

  await updateCompanyProfile(env, ticker, {
    description: parsed.description,
    sector: parsed.sector,
    website: typeof parsed.website === "string" ? parsed.website : undefined,
    key_facts,
  });
}

function isStale(updatedAt: string): boolean {
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return true;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_DAYS;
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
