// Discretion mode — gates the public website to drive iOS app installs.
// When enabled (default), the deals list is capped to 3 suggested deals and
// only the FIRST drawer opened today shows full analysis; subsequent drawers
// render dummy text under a CSS blur with an "open the app" CTA. Performance
// data (price chart + position card) is never blurred.
//
// State is persisted to localStorage under "ddbx.discretion.viewState" and
// resets at UK midnight. Toggle the whole feature with VITE_DISCRETION_MODE=off.

import { useEffect, useState } from "react";

const STORAGE_KEY = "ddbx.discretion.viewState";
const EVENT_NAME = "ddbx:discretion:change";

export const LIST_CAP = 3;
export const FREE_DRAWER_QUOTA = 1;
export const DISCRETION_ENABLED =
  (import.meta.env.VITE_DISCRETION_MODE as string | undefined) !== "off";

interface ViewState {
  date: string;
  viewedDealIds: string[];
}

/** YYYY-MM-DD in Europe/London. en-CA gives ISO order without locale-specific punctuation. */
export function getTodayUK(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function emptyState(date = getTodayUK()): ViewState {
  return { date, viewedDealIds: [] };
}

function isViewState(v: unknown): v is ViewState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;

  if (typeof o.date !== "string") return false;
  if (!Array.isArray(o.viewedDealIds)) return false;

  return o.viewedDealIds.every((x) => typeof x === "string");
}

function readState(): ViewState {
  if (typeof window === "undefined") return emptyState();
  const today = getTodayUK();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return emptyState(today);
    const parsed: unknown = JSON.parse(raw);

    if (!isViewState(parsed)) return emptyState(today);
    if (parsed.date !== today) return emptyState(today);

    return parsed;
  } catch {
    return emptyState(today);
  }
}

function writeState(state: ViewState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable / quota — fall through; gating becomes per-tab only.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function recordView(dealId: string): void {
  const state = readState();

  if (state.viewedDealIds.includes(dealId)) return;
  writeState({ ...state, viewedDealIds: [...state.viewedDealIds, dealId] });
}

export interface Discretion {
  enabled: boolean;
  listCap: number;
  viewedDealIds: string[];
  recordView: (dealId: string) => void;
  /** True if the deal is the first opened today (the freebie) — or if discretion is disabled. */
  hasFullAccess: (dealId: string) => boolean;
}

export function useDiscretion(): Discretion {
  const [state, setState] = useState<ViewState>(() => readState());

  useEffect(() => {
    const refresh = () => setState(readState());

    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return {
    enabled: DISCRETION_ENABLED,
    listCap: LIST_CAP,
    viewedDealIds: state.viewedDealIds,
    recordView,
    hasFullAccess: (dealId: string) => {
      if (!DISCRETION_ENABLED) return true;
      const first = state.viewedDealIds[0];

      // If nothing has been viewed yet, the next open is the freebie.
      if (first === undefined) return true;

      return first === dealId;
    },
  };
}
