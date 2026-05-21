// Discretion mode — gates the public website to drive iOS app installs.
// When enabled (default), the deals list is capped to 3 suggested deals and
// only the FIRST drawer opened today shows full analysis; subsequent drawers
// render dummy text under a CSS blur with an "open the app" CTA. Performance
// data (price chart + position card) is never blurred.
//
// State is persisted per market and resets at that market's midnight. Toggle
// the whole feature with VITE_DISCRETION_MODE=off.

import { useEffect, useState } from "react";

const STORAGE_KEY_PREFIX = "ddbx.discretion.viewState";
const EVENT_NAME = "ddbx:discretion:change";
const DEFAULT_MARKET_ID = "uk";
const DEFAULT_TIME_ZONE = "Europe/London";

export const LIST_CAP = 3;
export const FREE_DRAWER_QUOTA = 1;
export const DISCRETION_ENABLED =
  (import.meta.env.VITE_DISCRETION_MODE as string | undefined) !== "off";

interface ViewState {
  date: string;
  viewedDealIds: string[];
}

function storageKey(marketId: string): string {
  return `${STORAGE_KEY_PREFIX}.${marketId}`;
}

/** YYYY-MM-DD in a market timezone. en-CA gives ISO order without locale-specific punctuation. */
export function getTodayInTimeZone(timeZone = DEFAULT_TIME_ZONE): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

/** Back-compat helper for UK callers. */
export function getTodayUK(): string {
  return getTodayInTimeZone(DEFAULT_TIME_ZONE);
}

function emptyState(date = getTodayInTimeZone()): ViewState {
  return { date, viewedDealIds: [] };
}

function isViewState(v: unknown): v is ViewState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;

  if (typeof o.date !== "string") return false;
  if (!Array.isArray(o.viewedDealIds)) return false;

  return o.viewedDealIds.every((x) => typeof x === "string");
}

function readState(
  marketId = DEFAULT_MARKET_ID,
  timeZone = DEFAULT_TIME_ZONE,
): ViewState {
  if (typeof window === "undefined") return emptyState();
  const today = getTodayInTimeZone(timeZone);

  try {
    const raw =
      window.localStorage.getItem(storageKey(marketId)) ??
      (marketId === DEFAULT_MARKET_ID
        ? window.localStorage.getItem(STORAGE_KEY_PREFIX)
        : null);

    if (!raw) return emptyState(today);
    const parsed: unknown = JSON.parse(raw);

    if (!isViewState(parsed)) return emptyState(today);
    if (parsed.date !== today) return emptyState(today);

    return parsed;
  } catch {
    return emptyState(today);
  }
}

function writeState(state: ViewState, marketId = DEFAULT_MARKET_ID): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(marketId), JSON.stringify(state));
  } catch {
    // localStorage unavailable / quota — fall through; gating becomes per-tab only.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function recordView(
  dealId: string,
  marketId = DEFAULT_MARKET_ID,
  timeZone = DEFAULT_TIME_ZONE,
): void {
  const state = readState(marketId, timeZone);

  if (state.viewedDealIds.includes(dealId)) return;
  writeState(
    { ...state, viewedDealIds: [...state.viewedDealIds, dealId] },
    marketId,
  );
}

export interface Discretion {
  enabled: boolean;
  listCap: number;
  viewedDealIds: string[];
  recordView: (dealId: string) => void;
  /** True if the deal is the first opened today (the freebie) — or if discretion is disabled. */
  hasFullAccess: (dealId: string) => boolean;
}

export function useDiscretion({
  marketId = DEFAULT_MARKET_ID,
  timeZone = DEFAULT_TIME_ZONE,
}: {
  marketId?: string;
  timeZone?: string;
} = {}): Discretion {
  const [state, setState] = useState<ViewState>(() =>
    readState(marketId, timeZone),
  );

  useEffect(() => {
    const refresh = () => setState(readState(marketId, timeZone));

    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [marketId, timeZone]);

  return {
    enabled: DISCRETION_ENABLED,
    listCap: LIST_CAP,
    viewedDealIds: state.viewedDealIds,
    recordView: (dealId) => recordView(dealId, marketId, timeZone),
    hasFullAccess: (dealId: string) => {
      if (!DISCRETION_ENABLED) return true;
      const first = state.viewedDealIds[0];

      // If nothing has been viewed yet, the next open is the freebie.
      if (first === undefined) return true;

      return first === dealId;
    },
  };
}
