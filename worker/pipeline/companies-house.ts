// Companies House client for resolving SIC 2007 codes by company name.
//
// API docs: https://developer-specs.company-information.service.gov.uk/
// Auth: HTTP Basic, API key as username, blank password.
//
// Strategy: search by company name, take the top hit only if its
// normalized title closely matches what we sent (guards against
// "Foo Holdings" picking up "Foo Holdings Ltd" of an unrelated entity),
// then read /company/{number} for sic_codes. Returns null on any miss
// — never throws — so callers can fall back to the LLM path silently.

import type { Env } from "../index";

const BASE = "https://api.company-information.service.gov.uk";

interface SearchHit {
  company_number?: string;
  title?: string;
  company_status?: string;
}

interface SearchResponse {
  items?: SearchHit[];
}

interface CompanyDetail {
  sic_codes?: string[];
}

export async function fetchSicCodes(
  env: Env,
  companyName: string,
  ticker?: string,
): Promise<string[] | null> {
  const apiKey = env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey || !companyName.trim()) return null;

  const cleaned = stripTickerSuffix(companyName, ticker);
  if (!cleaned) return null;

  const auth = `Basic ${btoa(`${apiKey}:`)}`;
  const headers = { Authorization: auth, Accept: "application/json" };

  const searchUrl = `${BASE}/search/companies?q=${encodeURIComponent(cleaned)}&items_per_page=5`;
  let search: SearchResponse;
  try {
    const res = await fetch(searchUrl, { headers });
    if (!res.ok) return null;
    search = (await res.json()) as SearchResponse;
  } catch {
    return null;
  }

  const wantNorm = normalizeCompanyName(cleaned);
  const hit = (search.items ?? []).find((it) => {
    if (!it.company_number || !it.title) return false;
    if (it.company_status && it.company_status !== "active") return false;
    return normalizeCompanyName(it.title) === wantNorm;
  });
  if (!hit?.company_number) return null;

  const detailUrl = `${BASE}/company/${encodeURIComponent(hit.company_number)}`;
  try {
    const res = await fetch(detailUrl, { headers });
    if (!res.ok) return null;
    const detail = (await res.json()) as CompanyDetail;
    const codes = detail.sic_codes?.filter((c) => typeof c === "string" && c.trim().length > 0);
    return codes && codes.length > 0 ? codes : null;
  } catch {
    return null;
  }
}

// Strip legal suffixes and punctuation only — "Group", "Holdings", etc. are
// part of the company name itself and dropping them causes false matches
// (e.g. "Foo Holdings" → unrelated "Foo PLC"). When in doubt we'd rather
// return null and fall through to the LLM path.
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(public limited company|plc|limited|ltd|llp|inc|incorporated|corporation|corp)\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Names in our DB are formatted as "Trustpilot Group (TRST)" or
// "UIL Limited (DI) (UTL)". The trailing ticker bracket and the "(DI)"
// depository-interest marker confuse Companies House search, so we strip
// them before querying. Mirrors `displayCompany` in the iOS Models.swift.
function stripTickerSuffix(rawName: string, ticker?: string): string {
  let name = rawName.trim();
  if (ticker) {
    const short = ticker.replace(/\.L$/i, "");
    for (const suffix of [` (${ticker})`, ` (${short})`]) {
      if (name.endsWith(suffix)) {
        name = name.slice(0, -suffix.length).trim();
        break;
      }
    }
  }
  // Generic trailing parenthetical, e.g. "(DI)", "(THE)" — only when ALL
  // caps to avoid stripping meaningful suffixes like "(Holdings)".
  name = name.replace(/\s*\([A-Z]{1,4}\)\s*$/g, "").trim();
  return name;
}
