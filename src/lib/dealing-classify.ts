import type { Dealing } from "@/lib/api";

/** True when Opus rated above the noise floor (not routine-only). */
export function isSuggestedDealing(d: Dealing): boolean {
  return !!d.analysis && d.analysis.rating !== "routine";
}
