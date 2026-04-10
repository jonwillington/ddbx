import type { Env } from "../index";

// Thin Anthropic client — we call the REST API directly with fetch() instead
// of pulling in the SDK, since Workers is happier with zero deps here.
// Docs: https://docs.anthropic.com/claude/reference/messages_post

export interface CallOpts {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  max_tokens: number;
  temperature?: number;
  // Server-side tools (e.g. web_search) that the API runs on our behalf.
  // Pass the raw tool spec as documented in the Anthropic API.
  tools?: Array<Record<string, unknown>>;
}

export interface CallResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
}

export async function callAnthropic(
  env: Env,
  opts: CallOpts,
): Promise<CallResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature ?? 0,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`anthropic ${res.status}: ${errBody}`);
  }

  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  // The response may interleave server tool_use / web_search_tool_result
  // blocks with text. The model's final answer is always in text blocks;
  // join them in order so the caller can parse JSON out of the tail.
  const text = json.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  return {
    text,
    tokens_in: json.usage.input_tokens,
    tokens_out: json.usage.output_tokens,
    model: json.model,
  };
}
