// Performance tab — the dd-site equivalent of ddbx-app/PerformanceView.swift.
// Fetches all dealings once and feeds them into usePerformance(); the hook
// owns the strategy config, price/benchmark/FX caches, and recompute loop.
// This component is purely orchestration: data wiring + sheet state.

import { useEffect, useMemo, useState } from "react";

import DefaultLayout from "@/layouts/default";
import { Skeleton } from "@/components/skeleton";
import { title } from "@/components/primitives";
import { api, type Dealing } from "@/lib/api";
import {
  AMOUNTS,
  BENCHMARKS,
  EXIT_RULES,
  TIME_WINDOWS,
  UNIVERSES,
  type MarketBenchmark,
  type PerformanceAmount,
  type PerformanceExitRule,
  type PerformanceTimeWindow,
  type PerformanceUniverse,
} from "@/lib/performance/types";
import { usePerformance } from "@/hooks/use-performance";
import { ContributorsList } from "@/components/performance/contributors-list";
import {
  CriteriaSheet,
  type CriteriaOption,
} from "@/components/performance/criteria-sheet";
import {
  HeroCard,
  type CriterionKind,
} from "@/components/performance/hero-card";
import {
  MetricSheet,
  type MetricKind,
} from "@/components/performance/metric-sheet";
import {
  PerformanceChart,
  pctAtIndex,
} from "@/components/performance/performance-chart";
import { ViewModeToggle } from "@/components/performance/view-mode-toggle";

function buildOptions<T extends string>(
  map: Record<
    T,
    { displayName?: string; longName?: string; description?: string | null }
  >,
  preferLong = true,
): CriteriaOption<T>[] {
  return (Object.keys(map) as T[]).map((tag) => {
    const info = map[tag];
    const label =
      (preferLong ? info.longName : info.displayName) ??
      info.displayName ??
      tag;
    const description = info.description ?? undefined;

    return { tag, label, description };
  });
}

export default function PerformancePage() {
  const [dealings, setDealings] = useState<Dealing[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isTradingDay = useMemo(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5;
  }, []);

  useEffect(() => {
    api
      .dealings()
      .then(setDealings)
      .catch((e: unknown) => setFetchError((e as Error).message));
  }, []);

  const perf = usePerformance(dealings);

  const [activeCriterion, setActiveCriterion] = useState<CriterionKind | null>(
    null,
  );
  const [activeMetric, setActiveMetric] = useState<MetricKind | null>(null);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  const universeOptions = useMemo(
    () => buildOptions<PerformanceUniverse>(UNIVERSES, false),
    [],
  );
  const windowOptions = useMemo(
    () => buildOptions<PerformanceTimeWindow>(TIME_WINDOWS, true),
    [],
  );
  const exitOptions = useMemo(
    () => buildOptions<PerformanceExitRule>(EXIT_RULES, true),
    [],
  );
  const amountOptions = useMemo(
    () => buildOptions<PerformanceAmount>(AMOUNTS, true),
    [],
  );
  const benchmarkOptions = useMemo<CriteriaOption<MarketBenchmark>[]>(() => {
    return (Object.keys(BENCHMARKS) as MarketBenchmark[]).map((tag) => ({
      tag,
      label: BENCHMARKS[tag].displayName,
      description: BENCHMARKS[tag].description,
    }));
  }, []);

  const scrubPicksPct =
    scrubIdx != null ? pctAtIndex(perf.result, scrubIdx, "strategy") : null;
  const scrubBenchPct =
    scrubIdx != null ? pctAtIndex(perf.result, scrubIdx, "benchmark") : null;
  const scrubDate =
    scrubIdx != null ? (perf.result.strategy[scrubIdx]?.date ?? null) : null;

  if (fetchError) {
    return (
      <DefaultLayout drawerRight={isTradingDay}>
        <section className="py-8">
          <p className="text-sm text-red-500">
            Error loading performance: {fetchError}
          </p>
        </section>
      </DefaultLayout>
    );
  }

  return (
    <DefaultLayout drawerRight={isTradingDay}>
      <section className="py-8 space-y-6 animate-content-in">
        <h1 className={`${title({ size: "sm" })} !block mb-8`}>Performance</h1>

        {dealings == null ? (
          <PerformanceSkeleton />
        ) : (
          <>
            <HeroCard
              config={perf.config}
              error={perf.error}
              isComputing={perf.isComputing}
              result={perf.result}
              scrubBenchPct={scrubBenchPct}
              scrubDate={scrubDate}
              scrubPicksPct={scrubPicksPct}
              onOpenCriterion={setActiveCriterion}
              onOpenMetric={setActiveMetric}
            />

            <div className="flex items-center justify-between">
              <ViewModeToggle
                value={perf.config.viewMode}
                onChange={(viewMode) =>
                  perf.setConfig((prev) => ({ ...prev, viewMode }))
                }
              />
            </div>

            <div
              className={`rounded-xl border border-separator bg-surface/40 p-3 ${perf.isComputing ? "opacity-70" : ""} transition-opacity`}
            >
              <PerformanceChart
                result={perf.result}
                viewMode={perf.config.viewMode}
                onScrub={setScrubIdx}
              />
            </div>

            <ContributorsList
              excludedDealIds={perf.config.excludedDealIds}
              isComputing={perf.isComputing}
              rows={perf.result.contributors}
              onExclude={perf.excludeDeal}
              onResetExclusions={perf.resetExclusions}
            />
          </>
        )}
      </section>

      <CriteriaSheet
        open={activeCriterion === "universe"}
        options={universeOptions}
        selection={perf.config.universe}
        title="Universe"
        onClose={() => setActiveCriterion(null)}
        onSelect={(universe) =>
          perf.setConfig((prev) => ({ ...prev, universe }))
        }
      />
      <CriteriaSheet
        open={activeCriterion === "window"}
        options={windowOptions}
        selection={perf.config.timeWindow}
        title="Window"
        onClose={() => setActiveCriterion(null)}
        onSelect={(timeWindow) =>
          perf.setConfig((prev) => ({ ...prev, timeWindow }))
        }
      />
      <CriteriaSheet
        open={activeCriterion === "exit"}
        options={exitOptions}
        selection={perf.config.exitRule}
        title="Hold period"
        onClose={() => setActiveCriterion(null)}
        onSelect={(exitRule) =>
          perf.setConfig((prev) => ({ ...prev, exitRule }))
        }
      />
      <CriteriaSheet
        open={activeCriterion === "amount"}
        options={amountOptions}
        selection={perf.config.amount}
        title="Per deal"
        onClose={() => setActiveCriterion(null)}
        onSelect={(amount) => perf.setConfig((prev) => ({ ...prev, amount }))}
      />
      <CriteriaSheet
        open={activeCriterion === "benchmark"}
        options={benchmarkOptions}
        selection={perf.config.benchmark}
        title="Benchmark"
        onClose={() => setActiveCriterion(null)}
        onSelect={(benchmark) =>
          perf.setConfig((prev) => ({ ...prev, benchmark }))
        }
      />

      <MetricSheet
        config={perf.config}
        kind={activeMetric}
        open={activeMetric != null}
        onClose={() => setActiveMetric(null)}
      />
    </DefaultLayout>
  );
}

function PerformanceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-separator bg-surface/40 p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="flex-1 space-y-2 text-right">
            <Skeleton className="ml-auto h-3 w-24" />
            <Skeleton className="ml-auto h-9 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
      <Skeleton className="h-[220px] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </div>
  );
}
