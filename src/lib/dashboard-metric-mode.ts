import { useCallback, useEffect, useState } from "react";

/**
 * Dashboard metric mode — what number renders in the row's performance cell.
 * Two axes:
 *   - comparison: stock alone (raw) vs stock minus FTSE (market alpha)
 *   - anchor: trade date (information edge) vs disclosure date (the
 *     copycat-replicable window)
 * Mirrors `DashboardMetricMode` in the iOS app — defaults to
 * `performanceSinceDisclosure` because it's the most honest read of the
 * signal's value.
 */

export type DashboardComparison = "raw" | "market";
export type DashboardAnchor = "trade" | "disclosure";

export type DashboardMetricMode =
  | "performanceSinceDisclosure"
  | "performanceSinceTrade"
  | "vsMarketSinceDisclosure"
  | "vsMarketSinceTrade";

const STORAGE_KEY = "ddbx.dashboardMetricMode";
const DEFAULT_MODE: DashboardMetricMode = "performanceSinceDisclosure";

const ALL_MODES: readonly DashboardMetricMode[] = [
  "performanceSinceDisclosure",
  "performanceSinceTrade",
  "vsMarketSinceDisclosure",
  "vsMarketSinceTrade",
];

export function isVsMarket(mode: DashboardMetricMode): boolean {
  return mode === "vsMarketSinceDisclosure" || mode === "vsMarketSinceTrade";
}

export function anchorsOnDisclosure(mode: DashboardMetricMode): boolean {
  return mode === "performanceSinceDisclosure" || mode === "vsMarketSinceDisclosure";
}

export function comparisonOf(mode: DashboardMetricMode): DashboardComparison {
  return isVsMarket(mode) ? "market" : "raw";
}

export function anchorOf(mode: DashboardMetricMode): DashboardAnchor {
  return anchorsOnDisclosure(mode) ? "disclosure" : "trade";
}

export function modeFromAxes(
  comparison: DashboardComparison,
  anchor: DashboardAnchor,
): DashboardMetricMode {
  if (comparison === "raw" && anchor === "trade") return "performanceSinceTrade";
  if (comparison === "raw" && anchor === "disclosure") return "performanceSinceDisclosure";
  if (comparison === "market" && anchor === "trade") return "vsMarketSinceTrade";
  return "vsMarketSinceDisclosure";
}

/** Compact label for the dashboard chip — comparison axis only. */
export function shortLabel(mode: DashboardMetricMode): string {
  return isVsMarket(mode) ? "Market" : "Raw";
}

function readStored(): DashboardMetricMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (ALL_MODES as readonly string[]).includes(raw)) {
      return raw as DashboardMetricMode;
    }
  } catch {
    // ignore — falls through to default
  }
  return DEFAULT_MODE;
}

export function useDashboardMetricMode() {
  const [mode, setModeState] = useState<DashboardMetricMode>(readStored);

  // Sync across tabs that change the same key.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setModeState(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = useCallback((next: DashboardMetricMode) => {
    setModeState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* quota / SSR */ }
  }, []);

  const setComparison = useCallback((c: DashboardComparison) => {
    setMode(modeFromAxes(c, anchorOf(mode)));
  }, [mode, setMode]);

  const setAnchor = useCallback((a: DashboardAnchor) => {
    setMode(modeFromAxes(comparisonOf(mode), a));
  }, [mode, setMode]);

  return {
    mode,
    comparison: comparisonOf(mode),
    anchor: anchorOf(mode),
    isVsMarket: isVsMarket(mode),
    anchorsOnDisclosure: anchorsOnDisclosure(mode),
    shortLabel: shortLabel(mode),
    setMode,
    setComparison,
    setAnchor,
  } as const;
}
