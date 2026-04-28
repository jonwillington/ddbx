// Contributors list — port of PerformanceView.swift `contributorsSection`.
// Each row links to the deal detail; the X button drops the deal from both
// strategy and benchmark legs (symmetric exclusion).

import type { ContributorRow, StrategyConfig } from "@/lib/performance/types";

import { Link } from "react-router-dom";
import { useDiscretion } from "@/lib/discretion";

interface Props {
  rows: ContributorRow[];
  excludedDealIds: StrategyConfig["excludedDealIds"];
  isComputing: boolean;
  onExclude: (dealId: string) => void;
  onResetExclusions: () => void;
}

/** Number of contributor rows that stay unblurred when discretion mode is on. */
const UNBLURRED_CONTRIBUTORS = 2;

const PLACEHOLDER_TICKERS = [
  "GSK", "BARC", "RR", "VOD", "BP", "TSCO", "AZN", "LLOY", "DGE", "REL",
];
const PLACEHOLDER_COMPANIES = [
  "GlaxoSmithKline plc",
  "Barclays plc",
  "Rolls-Royce Holdings plc",
  "Vodafone Group plc",
  "BP plc",
  "Tesco plc",
  "AstraZeneca plc",
  "Lloyds Banking Group plc",
  "Diageo plc",
  "RELX plc",
];
const PLACEHOLDER_RETURNS = [0.087, -0.041, 0.121, -0.012, 0.034, 0.059, -0.024, 0.018, 0.073, -0.035];
const PLACEHOLDER_PNLS = [142, -38, 240, -8, 47, 92, -22, 24, 118, -54];

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
  const discretion = useDiscretion();
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
          const blurred = discretion.enabled && idx >= UNBLURRED_CONTRIBUTORS;
          const ticker = blurred
            ? PLACEHOLDER_TICKERS[idx % PLACEHOLDER_TICKERS.length]
            : row.ticker.replace(/\.L$/, "");
          const company = blurred
            ? PLACEHOLDER_COMPANIES[idx % PLACEHOLDER_COMPANIES.length]
            : row.company;
          const displayReturn = blurred
            ? PLACEHOLDER_RETURNS[idx % PLACEHOLDER_RETURNS.length]
            : row.returnPct;
          const displayPnl = blurred
            ? PLACEHOLDER_PNLS[idx % PLACEHOLDER_PNLS.length]
            : pnl;
          const displayPositive = displayReturn >= 0;

          const inner = (
            <>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">
                    {ticker}
                  </span>
                  {!blurred && row.state === "open" && (
                    <span className="rounded-full bg-surface/60 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted">
                      Open
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted">{company}</div>
              </div>
              <div className="text-right">
                <div
                  className={`text-sm font-semibold ${displayPositive ? "text-[#1e6b18] dark:text-[#5cd84a]" : "text-[#8b2020] dark:text-[#e84d4d]"}`}
                >
                  {formatPct(displayReturn)}
                </div>
                <div className="text-[11px] text-muted">
                  {formatSignedGbp(displayPnl)}
                </div>
              </div>
            </>
          );

          return (
            <li
              key={row.dealId}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                idx > 0 ? "border-t border-separator/60" : ""
              }`}
            >
              {blurred ? (
                <div
                  aria-hidden
                  className="flex flex-1 items-center gap-3 min-w-0 -mx-3 px-3 py-1 rounded-md pointer-events-none select-none"
                  style={{ filter: "blur(4px)" }}
                >
                  {inner}
                </div>
              ) : (
                <Link
                  className="flex flex-1 items-center gap-3 min-w-0 hover:bg-surface/40 -mx-3 px-3 py-1 rounded-md"
                  to={`/dealings/${row.dealId}`}
                >
                  {inner}
                </Link>
              )}
              {!blurred && (
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
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
