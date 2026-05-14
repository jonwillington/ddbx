// LSE trading-hours state machine. TypeScript port of
// ddbx-ios-app/MarketStatus.swift. Pure — no React, no DOM.
//
// All decisions are made in Europe/London regardless of the user's wall-clock
// timezone, because what matters for "are buy disclosures landing right now"
// is the LSE session, not the visitor's locale.

export type NextOpen = { kind: "tomorrow" } | { kind: "named"; day: string };

export type ClosureReason =
  | { kind: "weekend" }
  | { kind: "afterHours" }
  | { kind: "holiday"; name: string };

export type MarketStatus =
  | { kind: "preOpen"; opensInMs: number; earlyCloseToday: string | null }
  | { kind: "open"; earlyCloseToday: string | null }
  | { kind: "closed"; reopens: NextOpen; reason: ClosureReason };

export const LSE = {
  timeZone: "Europe/London",
  openMinute: 8 * 60,
  closeMinute: 16 * 60 + 30,
  halfDayCloseMinute: 12 * 60 + 30,
};

interface DateParts {
  year: number;
  month: number;   // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 Sun … 6 Sat
}

/** Wall-clock parts of a Date evaluated in Europe/London. */
function londonParts(d: Date): DateParts {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: LSE.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function isoDate(parts: DateParts): string {
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${parts.year}-${m}-${d}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOfIso(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function namedWeekday(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

/** Iterates forward to find the next LSE session day (skipping weekends + holidays). */
function nextOpen(todayIso: string, holidays: Record<string, string>): NextOpen {
  let candidate = todayIso;
  for (let i = 0; i < 14; i++) {
    candidate = addDaysIso(candidate, 1);
    const wd = weekdayOfIso(candidate);
    const isWeekday = wd >= 1 && wd <= 5;
    if (!isWeekday) continue;
    if (holidays[candidate]) continue;
    const tomorrow = addDaysIso(todayIso, 1);
    if (candidate === tomorrow) return { kind: "tomorrow" };
    return { kind: "named", day: namedWeekday(candidate) };
  }
  return { kind: "tomorrow" };
}

/** Dec 24 (Christmas Eve) and Dec 31 (NYE) — half-day closes per LSE schedule. */
function earlyCloseName(parts: DateParts): string | null {
  if (parts.month !== 12) return null;
  if (parts.day === 24) return "Christmas Eve";
  if (parts.day === 31) return "New Year’s Eve";
  return null;
}

export function lseStatus(
  now: Date = new Date(),
  holidays: Record<string, string> = {},
): MarketStatus {
  const parts = londonParts(now);
  const today = isoDate(parts);
  const minutes = parts.hour * 60 + parts.minute;
  const isWeekday = parts.weekday >= 1 && parts.weekday <= 5;

  const holiday = holidays[today];
  if (holiday) {
    return {
      kind: "closed",
      reopens: nextOpen(today, holidays),
      reason: { kind: "holiday", name: holiday },
    };
  }

  if (!isWeekday) {
    return {
      kind: "closed",
      reopens: nextOpen(today, holidays),
      reason: { kind: "weekend" },
    };
  }

  const earlyName = earlyCloseName(parts);
  const todaysClose = earlyName != null ? LSE.halfDayCloseMinute : LSE.closeMinute;

  if (minutes < LSE.openMinute) {
    // Build "today at 08:00 London" as a real Date by combining a UTC ISO with
    // an estimated offset — close enough for a countdown; we don't render
    // sub-minute precision.
    const opensAt = new Date(now.getTime() + (LSE.openMinute - minutes) * 60_000);
    return {
      kind: "preOpen",
      opensInMs: Math.max(0, opensAt.getTime() - now.getTime()),
      earlyCloseToday: earlyName,
    };
  }

  if (minutes < todaysClose) {
    return { kind: "open", earlyCloseToday: earlyName };
  }

  return {
    kind: "closed",
    reopens: nextOpen(today, holidays),
    reason: { kind: "afterHours" },
  };
}

export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatCloseTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Contextual subtitle for "no deals yet today" — port of iOS noDealsSubtitle. */
export function noDealsSubtitle(now: Date = new Date()): string {
  const parts = londonParts(now);
  const isWeekend = parts.weekday === 0 || parts.weekday === 6;
  if (isWeekend) return "Markets closed for the weekend. Get some sunlight.";
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes < LSE.openMinute) return "Pour your coffee, the market opens soon.";
  if (minutes < LSE.closeMinute) return "Market's open. Waiting on the first disclosure.";
  return "Check back tomorrow, get some sleep.";
}

export function reopensPhrase(reopens: NextOpen): string {
  return reopens.kind === "tomorrow" ? "tomorrow" : `on ${reopens.day}`;
}
