// Per-director profile page. Market-aware: /directors/:id stays a UK-only
// alias for back-compat; /:market/directors/:id is the canonical path going
// forward. UK + US + SE all live as of 2026-05-20.
import type { MarketDealing } from "@/lib/markets/types";

import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { MarketDetailDrawer } from "@/components/market/market-detail-drawer";
import { MarketRow, MarketRowHeader } from "@/components/market/market-row";
import { Skeleton } from "@/components/skeleton";
import DefaultLayout from "@/layouts/default";
import { useDashboardMetricMode } from "@/lib/dashboard-metric-mode";
import { subtitle, title } from "@/components/primitives";
import {
  api,
  type DirectorDetail,
  type EuDirectorDetail,
  type UsDirectorDetail,
} from "@/lib/api";
import {
  marketForPath,
  type MarketRegistryEntry,
} from "@/lib/markets/registry";
import { toMarketDealing as toUkMarketDealing } from "@/lib/markets/uk";
import {
  groupRows as groupUsRows,
  toMarketDealing as toUsMarketDealing,
} from "@/lib/markets/us";
import {
  groupRows as groupSeRows,
  toMarketDealing as toSeMarketDealing,
} from "@/lib/markets/sweden";

type AnyDirectorDetail =
  | DirectorDetail
  | UsDirectorDetail
  | EuDirectorDetail;

function isUsDetail(d: AnyDirectorDetail): d is UsDirectorDetail {
  // UsDirectorDetail.prior_picks carries UsDealing rows (filing_id +
  // transaction_code); Dealing / EuDealing rows don't.
  const first = d.prior_picks[0] as { filing_id?: string } | undefined;

  return first != null && typeof first.filing_id === "string";
}

function isSeDetail(d: AnyDirectorDetail): d is EuDirectorDetail {
  // EuDirectorDetail carries `market` on the response shape; UK/US don't.
  return (d as { market?: string }).market != null;
}

function pct(n: number | null) {
  if (n == null) return "—";

  return `${(n * 100).toFixed(1)}%`;
}

/** Per-market adapter for `prior_picks → MarketDealing[]`. UK maps 1:1 from
 *  Dealing; US + SE fold tranche-split legs into RowGroups first, then map. */
function toMarketDealings(
  market: MarketRegistryEntry,
  detail: AnyDirectorDetail,
): MarketDealing[] {
  if (market.id === "uk" && !isUsDetail(detail) && !isSeDetail(detail)) {
    return detail.prior_picks.map(toUkMarketDealing);
  }
  if (market.id === "us" && isUsDetail(detail)) {
    return groupUsRows(detail.prior_picks).map(toUsMarketDealing);
  }
  if (market.id === "se" && isSeDetail(detail)) {
    return groupSeRows(detail.prior_picks).map(toSeMarketDealing);
  }

  return [];
}

export default function DirectorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const market = marketForPath(location.pathname);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [d, setD] = useState<AnyDirectorDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const metric = useDashboardMetricMode(market.id);
  const useGating = market.config.useGating;
  const gating = useGating ? useGating() : undefined;
  const chartMode = useMemo(
    () => ({ axis: metric.comparison, anchor: metric.anchor }),
    [metric.comparison, metric.anchor],
  );

  useEffect(() => {
    if (!id) return;
    const fetcher =
      market.id === "us"
        ? api.usDirector(id)
        : market.id === "se"
          ? api.seDirector(id)
          : api.director(id);

    fetcher
      .then((r) => setD(r as AnyDirectorDetail))
      .catch((e) => setErr((e as Error).message));
  }, [id, market.id]);

  const dealings = useMemo(
    () => (d ? toMarketDealings(market, d) : []),
    [market, d],
  );
  const selectedDealing = useMemo(
    () => dealings.find((x) => x.key === selectedKey) ?? null,
    [dealings, selectedKey],
  );

  if (err) return <DefaultLayout>Error: {err}</DefaultLayout>;
  if (!d)
    return (
      <DefaultLayout>
        <DirectorSkeleton />
      </DefaultLayout>
    );

  return (
    <DefaultLayout>
      <section className="py-8 space-y-8 animate-content-in">
        <div>
          <h1 className={title({ size: "sm" })}>{d.name}</h1>
          <p className={subtitle({ class: "mt-2" })}>
            {d.role} · {d.company}
            {d.age_band && ` · ${d.age_band}`}
            {d.tenure_years != null && ` · ${d.tenure_years}y tenure`}
          </p>
        </div>

        {d.profile && (
          <div className="border border-separator rounded-lg bg-surface/40 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold mb-1">Biography</h3>
              <p className="text-sm text-foreground/90">
                {d.profile.biography}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1">Track record</h3>
              <p className="text-sm text-foreground/90">
                {d.profile.track_record_summary}
              </p>
            </div>
            {d.profile.flags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1 text-red-500">
                  Flags
                </h3>
                <ul className="text-sm list-disc pl-5 text-red-500/90">
                  {d.profile.flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Hit rate" value={`${d.hit_rate_pct.toFixed(0)}%`} />
          <Stat
            label="Avg 3m"
            value={pct(d.avg_return_by_horizon["3m"] ?? null)}
          />
          <Stat
            label="Avg 6m"
            value={pct(d.avg_return_by_horizon["6m"] ?? null)}
          />
          <Stat
            label="Avg 12m"
            value={pct(d.avg_return_by_horizon["12m"] ?? null)}
          />
          <Stat
            label="Avg 24m"
            value={pct(d.avg_return_by_horizon["24m"] ?? null)}
          />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Prior picks</h2>
          {dealings.length === 0 ? (
            <p className="text-sm text-muted">No prior picks on record yet.</p>
          ) : (
            <div className="bg-[#faf7f2] dark:bg-surface rounded-xl overflow-hidden">
              <MarketRowHeader
                benchmarkLabel={market.config.benchmarkLabel}
                chartMode={chartMode}
              />
              <div className="divide-y divide-black/[0.06] dark:divide-separator">
                {dealings.map((dealing) => (
                  <MarketRow
                    key={dealing.key}
                    RowActionCell={market.config.RowActionCell}
                    benchmarkLabel={market.config.benchmarkLabel}
                    chartMode={chartMode}
                    dealing={dealing}
                    formatTickerDisplay={market.config.formatTickerDisplay}
                    fmt={market.config.priceFormat}
                    isMuted={market.config.isRowMuted}
                    locale={market.config.locale}
                    selected={selectedKey === dealing.key}
                    showLogo={market.config.enableLogos !== false}
                    onSelect={() => setSelectedKey(dealing.key)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      <MarketDetailDrawer
        AnalysisOverlay={market.config.AnalysisOverlay}
        DetailBody={market.config.DetailBody}
        DetailPosition={market.config.DetailPosition}
        DummyDetailBody={market.config.DummyDetailBody}
        dealing={selectedDealing}
        formatTickerDisplay={market.config.formatTickerDisplay}
        fmt={market.config.priceFormat}
        gating={gating}
        showLogo={market.config.enableLogos !== false}
        onClose={() => setSelectedKey(null)}
      />
    </DefaultLayout>
  );
}

function DirectorSkeleton() {
  return (
    <section className="py-8 space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="border border-separator rounded-lg bg-surface/40 p-4 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-9/12" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-10/12" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border border-separator rounded-lg bg-surface/40 p-3 space-y-2"
          >
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border border-separator/50 rounded-lg p-4 flex gap-4"
          >
            <Skeleton className="h-10 w-16 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-separator rounded-lg bg-surface/40 p-3">
      <div className="text-xs text-muted uppercase">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
