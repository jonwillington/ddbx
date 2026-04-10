import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import DefaultLayout from "@/layouts/default";
import { title, subtitle } from "@/components/primitives";
import { PerformanceChart } from "@/components/performance-chart";
import { RatingBadge } from "@/components/rating-badge";
import { Skeleton } from "@/components/skeleton";
import { api, type Portfolio, type Rating } from "@/lib/api";

const PICKS_COLOR = "#4ade80";
const FTSE_COLOR = "#a1a1aa";

function pct(n: number, digits = 1) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

function pp(n: number, digits = 1) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)} pp`;
}

function gbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function pence(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}p`;
}

export default function PortfolioPage() {
  const [p, setP] = useState<Portfolio | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fy, setFy] = useState<number | undefined>(undefined);

  useEffect(() => {
    setP(null);
    api
      .portfolio(fy)
      .then(setP)
      .catch((e) => setErr((e as Error).message));
  }, [fy]);

  if (err) return <DefaultLayout>Error: {err}</DefaultLayout>;
  if (!p) return <DefaultLayout><PortfolioSkeleton /></DefaultLayout>;

  const beat = p.alpha_pp >= 0;
  const verdict = beat
    ? `Beat the market by ${pp(p.alpha_pp)}`
    : `Underperformed the market by ${pp(p.alpha_pp)}`;

  const fyLabel = `FY${String(p.fy).padStart(2, "0")}`;
  const dayN = p.in_progress
    ? Math.max(
        1,
        Math.floor(
          (new Date(p.as_of).getTime() - new Date(p.fy_start).getTime()) /
            86_400_000,
        ) + 1,
      )
    : null;

  const chartLines = [
    {
      label: "Picks portfolio",
      color: PICKS_COLOR,
      points: p.picks_curve,
    },
    {
      label: "FTSE All-Share",
      color: FTSE_COLOR,
      points: p.ftse_curve,
    },
  ];

  // Sort by alpha (vs FTSE) descending so outperformers sit at the top —
  // matches the "did this beat the market" framing of the page.
  const sortedPicks = [...p.picks].sort((a, b) => b.alpha_pp - a.alpha_pp);

  return (
    <DefaultLayout>
      <section className="py-8 space-y-8 animate-content-in">
        <div>
          <h1 className={title({ size: "sm" })}>
            Does this <span className={title({ color: "blue", size: "sm" })}>beat the market</span>?
          </h1>
          <p className={subtitle({ class: "mt-2" })}>
            £100 into every "interesting" director buy on its trade date,
            held to today, vs the FTSE All-Share over the same window.
            One question: would you have made more money than the index?
          </p>
        </div>

        {/* FY selector */}
        <div className="flex gap-2 flex-wrap">
          {p.available_fys
            .slice()
            .reverse()
            .map((f) => {
              const active = f.fy === p.fy;
              return (
                <button
                  key={f.fy}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-[#7a6552] bg-[#7a6552]/10 text-[#7a6552]"
                      : "border-separator text-muted hover:border-[#7a6552]/50"
                  }`}
                  onClick={() => setFy(f.fy)}
                >
                  FY{String(f.fy).padStart(2, "0")}
                  {f.in_progress ? " · in progress" : ""}
                  {f.picks_count > 0 ? ` · ${f.picks_count}` : ""}
                </button>
              );
            })}
        </div>

        {/* Hero alpha */}
        <div className="border border-separator rounded-lg bg-surface/40 p-6">
          <div className="text-xs text-muted uppercase">
            {fyLabel}
            {dayN != null ? ` · day ${dayN}` : ` · ${p.fy_start} → ${p.fy_end}`}
          </div>
          <div
            className={`mt-2 text-4xl md:text-5xl font-semibold ${
              beat ? "text-green-400" : "text-red-400"
            }`}
          >
            {verdict}
          </div>
          {p.picks_count === 0 && (
            <div className="mt-2 text-sm text-muted">
              No interesting buys in this financial year yet.
            </div>
          )}
        </div>

        {/* Three stat tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat
            label="Picks return"
            value={pct(p.picks_return_pct)}
            tone={p.picks_return_pct >= 0 ? "pos" : "neg"}
          />
          <Stat
            label="FTSE All-Share return"
            value={pct(p.ftse_return_pct)}
            tone={p.ftse_return_pct >= 0 ? "pos" : "neg"}
          />
          <Stat
            label="Picks in window"
            value={`${p.picks_count}`}
            sub={`${gbp(p.starting_value_gbp)} notional`}
          />
        </div>

        {/* Chart */}
        {p.picks_curve.length >= 2 && (
          <div className="border border-separator rounded-lg bg-surface/40 p-4">
            <PerformanceChart
              headerLabel={`${fyLabel} · picks vs FTSE All-Share`}
              lines={chartLines}
            />
          </div>
        )}

        {/* Picks table */}
        {sortedPicks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Picks in {fyLabel}</h2>
            <div className="border border-separator rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted bg-surface/40">
                  <tr>
                    <th className="text-left px-4 py-2 font-normal">Ticker</th>
                    <th className="text-left px-4 py-2 font-normal">Company</th>
                    <th className="text-left px-4 py-2 font-normal">Rating</th>
                    <th className="text-left px-4 py-2 font-normal">Entered</th>
                    <th className="text-right px-4 py-2 font-normal">Price</th>
                    <th className="text-right px-4 py-2 font-normal">Stock</th>
                    <th className="text-right px-4 py-2 font-normal">FTSE</th>
                    <th
                      className="text-right px-4 py-2 font-normal"
                      title="Stock return minus FTSE return over the same window, in percentage points"
                    >
                      vs FTSE
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPicks.map((pick) => {
                    const beatPick = pick.alpha_pp >= 0;
                    return (
                      <tr
                        key={pick.dealing_id}
                        className="border-t border-separator/50"
                      >
                        <td className="px-4 py-2 font-mono">
                          <Link
                            className="hover:text-[#7a6552]"
                            to={`/dealings/${pick.dealing_id}`}
                          >
                            {pick.ticker}
                          </Link>
                        </td>
                        <td className="px-4 py-2 truncate max-w-[16rem]">
                          {pick.company}
                        </td>
                        <td className="px-4 py-2">
                          <RatingBadge rating={pick.rating as Rating} />
                        </td>
                        <td className="px-4 py-2 text-muted">
                          {pick.trade_date}
                        </td>
                        <td className="text-right px-4 py-2 text-muted whitespace-nowrap">
                          {pence(pick.entry_price_pence)} →{" "}
                          {pence(pick.current_price_pence)}
                        </td>
                        <td
                          className={`text-right px-4 py-2 ${
                            pick.return_pct >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {pct(pick.return_pct)}
                        </td>
                        <td
                          className={`text-right px-4 py-2 ${
                            pick.ftse_return_pct >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {pct(pick.ftse_return_pct)}
                        </td>
                        <td
                          className={`text-right px-4 py-2 font-medium ${
                            beatPick ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {pp(pick.alpha_pp)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </DefaultLayout>
  );
}

function PortfolioSkeleton() {
  return (
    <section className="py-8 space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-3/4 max-w-lg" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <div className="border border-separator rounded-lg bg-surface/40 p-6 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-3/4 max-w-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-separator rounded-lg bg-surface/40 p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="border border-separator rounded-lg bg-surface/40 p-4">
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-56 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="border border-separator rounded-lg overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 border-t border-separator/50 first:border-t-0"
            >
              <Skeleton className="h-4 w-12 shrink-0" />
              <Skeleton className="h-4 w-40 shrink-0" />
              <Skeleton className="h-5 w-16 shrink-0" />
              <div className="flex-1" />
              <Skeleton className="h-4 w-14 shrink-0" />
              <Skeleton className="h-4 w-14 shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  sub?: string;
}) {
  return (
    <div className="border border-separator rounded-lg bg-surface/40 p-4">
      <div className="text-xs text-muted uppercase">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          tone === "pos"
            ? "text-green-400"
            : tone === "neg"
              ? "text-red-400"
              : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
