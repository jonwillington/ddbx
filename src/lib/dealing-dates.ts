/** Sort key: newest disclosure (or trade) first. */
export function compareDealingsNewestFirst(a: { disclosed_date: string; trade_date: string }, b: { disclosed_date: string; trade_date: string }): number {
  const ka = a.disclosed_date || a.trade_date;
  const kb = b.disclosed_date || b.trade_date;
  const c = kb.localeCompare(ka);
  if (c !== 0) return c;
  return b.trade_date.localeCompare(a.trade_date);
}

/** Human-readable disclosure line(s) for list UI. */
export function formatDisclosedParts(iso: string): {
  dateLabel: string;
  timePart?: string;
} {
  const raw = iso?.trim() || "";
  const hasTime = /T\d{2}:\d{2}/.test(raw);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { dateLabel: "—" };
  const dateLabel = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
  let timePart: string | undefined;
  if (hasTime) {
    timePart = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    });
  }
  return { dateLabel, timePart };
}

/** One compact line for drawers / tight layouts. */
export function formatDisclosedCompact(iso: string): string {
  const { dateLabel, timePart } = formatDisclosedParts(iso);
  return timePart ? `${dateLabel} · ${timePart}` : dateLabel;
}
