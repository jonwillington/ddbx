import type { RatingChecklist } from "@/types/ddbx";

import { InformationCircleIcon } from "@heroicons/react/20/solid";

export const CHECKLIST_LABELS: {
  key: keyof RatingChecklist;
  label: string;
  tooltip: string;
}[] = [
  {
    key: "open_market_buy",
    label: "Open-market buy",
    tooltip:
      "Purchased on the open market — not via an options exercise, LTIP vesting, or employee share scheme. A stronger signal of deliberate investment.",
  },
  {
    key: "senior_insider",
    label: "Senior insider",
    tooltip:
      "The buyer is a CEO, CFO, Chairman, or board-level director with genuine operational insight into the business.",
  },
  {
    key: "meaningful_conviction",
    label: "Meaningful conviction",
    tooltip:
      "The purchase size is large relative to the director's likely compensation, suggesting real personal conviction rather than a token gesture.",
  },
  {
    key: "no_alternative_explanation",
    label: "No scheme or plan",
    tooltip:
      "The purchase doesn't appear to result from a pre-arranged trading plan, SAYE/10b5-1 plan, or required ownership policy — suggesting it's an active investment decision.",
  },
  {
    key: "supporting_context_found",
    label: "Supporting context found",
    tooltip:
      "External news, filings, or analyst commentary support a bullish view the director may be acting on.",
  },
  {
    key: "no_major_counter_signal",
    label: "No major counter-signal",
    tooltip:
      "No recent red flags — profit warnings, accounting irregularities, or heavy insider selling — that would undercut the signal.",
  },
];

function InfoIcon() {
  return (
    <InformationCircleIcon className="w-3.5 h-3.5 shrink-0 text-muted/50 group-hover/tip:text-muted/80 transition-colors" />
  );
}

export function RatingChecklistView({
  checklist,
}: {
  checklist: RatingChecklist;
}) {
  const passed = CHECKLIST_LABELS.filter((c) => checklist[c.key]).length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold">Rating checklist</h3>
        <span className="text-xs text-muted">
          {passed} of {CHECKLIST_LABELS.length} criteria met
        </span>
      </div>
      <ul className="divide-y divide-black/10 dark:divide-white/10 border-y border-black/10 dark:border-white/10">
        {CHECKLIST_LABELS.map(({ key, label, tooltip }) => {
          const ok = checklist[key];

          return (
            <li key={key} className="flex items-center gap-3 py-2.5">
              <span
                aria-label={ok ? "passed" : "failed"}
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0
                  ${
                    ok
                      ? "bg-[#1e6b18]/[0.12] text-[#1e6b18] dark:bg-[#5cd84a]/[0.15] dark:text-[#5cd84a]"
                      : "bg-[#8b2020]/[0.12] text-[#8b2020] dark:bg-[#e84d4d]/[0.15] dark:text-[#e84d4d]"
                  }`}
              >
                {ok ? "✓" : "✗"}
              </span>
              <span
                className={`text-sm ${ok ? "text-foreground" : "text-foreground/60"} relative group/tip inline-flex items-center gap-1.5 cursor-default`}
              >
                {label}
                <InfoIcon />
                <span
                  className="pointer-events-none absolute left-0 top-full mt-1.5 z-50
                  opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150
                  w-64 rounded-lg bg-[#1e1a16] dark:bg-[#e8e2da]
                  text-[#e8e2da] dark:text-[#1e1a16]
                  text-xs px-3 py-2.5 leading-relaxed shadow-2xl"
                >
                  {tooltip}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
