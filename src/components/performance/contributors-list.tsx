// Contributors list — port of PerformanceView.swift `contributorsSection`.
// Each row links to the deal detail; the X button drops the deal from both
// strategy and benchmark legs (symmetric exclusion).

import type { ContributorRow, StrategyConfig } from "@/lib/performance/types";

import { Link } from "react-router-dom";

interface Props {
  rows: ContributorRow[];
  excludedDealIds: StrategyConfig["excludedDealIds"];
  isComputing: boolean;
  onExclude: (dealId: string) => void;
  onResetExclusions: () => void;
}

function formatPct(value: number): string {
  const x = value * 100;
  const sign = x >= 0 ? "+" : "−";

  return `${sign}${Math.abs(x).toFixed(1)}%`;
}

function formatSignedGbp(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  const abs = Math.abs(value);

  if (abs >= 10_000) return `${sign}£${(abs / 1_000).toFixed(1)}k`;

  return `${sign}£${Math.round(abs)}`;
}

export function ContributorsList({
  rows,
  excludedDealIds,
  isComputing,
  onExclude,
  onResetExclusions,
}: Props) {
  if (rows.length === 0) return null;

  return (
    <div
      className={`space-y-2 ${isComputing ? "opacity-60" : ""} transition-opacity`}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Contributors</h2>
        <span className="text-xs text-muted">sorted by impact</span>
      </div>

      {excludedDealIds.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-separator bg-surface/60 px-3 py-2 text-xs">
          <span className="text-muted">{excludedDealIds.size} excluded</span>
          <button
            className="font-semibold text-[#6b5038] hover:underline"
            type="button"
            onClick={onResetExclusions}
          >
            Reset
          </button>
        </div>
      )}

      <ul className="rounded-lg border border-separator overflow-hidden">
        {rows.map((row, idx) => {
          const pnl = row.currentValue - row.deployed;
          const positive = row.returnPct >= 0;

          return (
            <li
              key={row.dealId}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                idx > 0 ? "border-t border-separator/60" : ""
              }`}
            >
              <Link
                className="flex flex-1 items-center gap-3 min-w-0 hover:bg-surface/40 -mx-3 px-3 py-1 rounded-md"
                to={`/dealings/${row.dealId}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">
                      {row.ticker.replace(/\.L$/, "")}
                    </span>
                    {row.state === "open" && (
                      <span className="rounded-full bg-surface/60 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted">
                        Open
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {row.company}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-semibold ${positive ? "text-[#1e6b18] dark:text-[#5cd84a]" : "text-[#8b2020] dark:text-[#e84d4d]"}`}
                  >
                    {formatPct(row.returnPct)}
                  </div>
                  <div className="text-[11px] text-muted">
                    {formatSignedGbp(pnl)}
                  </div>
                </div>
              </Link>
              <button
                aria-label="Exclude from backtest"
                className="rounded-md p-1.5 text-muted/70 hover:bg-surface/60 hover:text-muted"
                type="button"
                onClick={() => onExclude(row.dealId)}
              >
                <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M9 9l6 6M9 15l6-6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
