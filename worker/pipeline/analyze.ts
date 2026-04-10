import type { Env } from "../index";
import type { Analysis, Dealing, EvidencePoint, Rating, RatingChecklist } from "../db/types";
import { callAnthropic, type CallResult } from "../llm/anthropic";
import { ANALYZE_PROMPT } from "../llm/prompts";

export interface AnalyzeResult {
  analysis: Analysis;
  usage: CallResult;
}

// Opus deep reasoning — only called for dealings that survive Haiku triage.
// Output is strict JSON; we validate defensively before returning.
//
// Opus runs Anthropic's server-side web_search tool during this call so that
// every evidence point cites a URL it actually retrieved, rather than one it
// hallucinated. The prompt requires evidence to be backed by real links and
// we drop anything that isn't.
function buildSignalContext(dealing: Dealing): string {
  const signals: string[] = [];

  const role = dealing.director.role ?? "";
  const isExec = /ceo|chief executive|cfo|chief financial|coo|chief operating|md|managing director|executive chair/i.test(role);
  const isNed = /non-executive|ned/i.test(role);
  signals.push(`Director role: ${role} (${isExec ? "executive" : isNed ? "non-executive" : "other"})`);

  const v = dealing.value_gbp ?? 0;
  const sizeLabel = v >= 100_000 ? "large (≥£100k)" : v >= 25_000 ? "moderate (£25k-£100k)" : "small (<£25k)";
  signals.push(`Purchase size: £${v.toLocaleString()} — ${sizeLabel}`);

  signals.push(`Transaction type: ${"is_open_market_buy" in dealing && (dealing as any).is_open_market_buy ? "confirmed open-market cash purchase" : dealing.tx_type === "buy" ? "buy (open market assumed)" : dealing.tx_type}`);

  return `Pre-analysis signals:\n${signals.map((s) => `- ${s}`).join("\n")}\n\nUse these facts to ground your judgment on the checklist items.`;
}

export async function analyzeDealing(
  env: Env,
  dealing: Dealing,
): Promise<AnalyzeResult> {
  const signalContext = buildSignalContext(dealing);
  const userMsg = `${signalContext}\n\n${JSON.stringify({ dealing })}`;

  const resp = await callAnthropic(env, {
    model: "claude-opus-4-6",
    system: ANALYZE_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    max_tokens: 4000,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
  });

  const parsed = extractJson(resp.text);
  if (!parsed) throw new Error("analyze: no JSON object in response");
  const analysis = validate(parsed);
  return { analysis, usage: resp };
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

const RATINGS: Rating[] = [
  "significant",
  "noteworthy",
  "minor",
  "routine",
];

const CHECKLIST_KEYS: (keyof RatingChecklist)[] = [
  "open_market_buy",
  "senior_insider",
  "meaningful_conviction",
  "no_alternative_explanation",
  "supporting_context_found",
  "no_major_counter_signal",
];

function validateChecklist(raw: unknown): RatingChecklist | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const result: Partial<RatingChecklist> = {};
  for (const k of CHECKLIST_KEYS) {
    result[k] = Boolean(c[k]);
  }
  return result as RatingChecklist;
}

function validate(o: any): Analysis {
  if (!o || typeof o !== "object") throw new Error("analyze: not an object");
  if (!RATINGS.includes(o.rating)) {
    throw new Error(`analyze: invalid rating ${o.rating}`);
  }

  const thesis_points: string[] = Array.isArray(o.thesis_points)
    ? o.thesis_points.filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  if (thesis_points.length < 1) {
    throw new Error("analyze: thesis_points must have at least one entry");
  }
  if (thesis_points.length > 8) {
    thesis_points.length = 8;
  }

  const cw = ["3m", "6m", "12m"].includes(o.catalyst_window)
    ? o.catalyst_window
    : "12m";

  const checklist = validateChecklist(o.checklist);

  // Safety net: if the LLM rated this "significant" but any checklist item
  // failed, downgrade to "noteworthy". The prompt enforces all-must-pass;
  // this is a code-level backstop.
  let rating: Rating = o.rating;
  if (rating === "significant" && checklist) {
    const allPass = CHECKLIST_KEYS.every((k) => checklist[k]);
    if (!allPass) rating = "noteworthy";
  }

  return {
    rating,
    confidence: typeof o.confidence === "number" ? o.confidence : 0.5,
    summary: typeof o.summary === "string" ? o.summary : "",
    thesis_points,
    evidence_for: Array.isArray(o.evidence_for)
      ? o.evidence_for.filter(isEvidence)
      : [],
    evidence_against: Array.isArray(o.evidence_against)
      ? o.evidence_against.filter(isEvidence)
      : [],
    key_risks: Array.isArray(o.key_risks)
      ? o.key_risks.filter((x: unknown) => typeof x === "string")
      : [],
    catalyst_window: cw,
    checklist,
    rating_rationale: typeof o.rating_rationale === "string" ? o.rating_rationale : undefined,
  };
}

// An evidence point is only kept if it carries a real, non-empty source_url.
// This is the gate that prevents hallucinated citations from reaching the UI.
function isEvidence(x: unknown): x is EvidencePoint {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.headline === "string" &&
    typeof e.detail === "string" &&
    typeof e.source_label === "string" &&
    typeof e.source_url === "string" &&
    /^https?:\/\//i.test(e.source_url)
  );
}
