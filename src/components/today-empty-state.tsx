import { CalendarIcon, ClockIcon } from "@heroicons/react/24/outline";

import type { MarketStatus } from "@/lib/market-status";
import { noDealsSubtitle, reopensPhrase } from "@/lib/market-status";

/**
 * Empty state for the "Today" section when no deals have come in yet. Mirrors
 * iOS `emptyTodayCard` — calendar icon for weekend/holiday closures, clock
 * icon for in-session "still waiting" states.
 */
export function TodayEmptyState({
  status,
  now = new Date(),
  variant = "card",
}: {
  status: MarketStatus;
  now?: Date;
  variant?: "card" | "inline";
}) {
  const { icon, headline, subtitle } = describe(status, now);

  if (variant === "inline") {
    return (
      <div className="px-5 py-5 text-center">
        <div className="flex items-center justify-center mb-2 text-muted">
          {icon === "calendar" ? (
            <CalendarIcon className="w-5 h-5" />
          ) : (
            <ClockIcon className="w-5 h-5" />
          )}
        </div>
        <div className="text-sm font-semibold">{headline}</div>
        <div className="text-xs text-muted mt-1">{subtitle}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface/60 border border-separator/60 px-4 py-7 m-4 flex flex-col items-center text-center gap-2">
      <div className="text-muted">
        {icon === "calendar" ? (
          <CalendarIcon className="w-6 h-6" />
        ) : (
          <ClockIcon className="w-6 h-6" />
        )}
      </div>
      <div className="text-sm font-semibold">{headline}</div>
      <div className="text-xs text-muted leading-relaxed max-w-xs">{subtitle}</div>
    </div>
  );
}

function describe(
  status: MarketStatus,
  now: Date,
): { icon: "calendar" | "clock"; headline: string; subtitle: string } {
  if (status.kind === "closed" && status.reason.kind === "holiday") {
    return {
      icon: "calendar",
      headline: `Closed for ${status.reason.name}`,
      subtitle: `Reopens ${reopensPhrase(status.reopens)}.`,
    };
  }
  if (status.kind === "closed" && status.reason.kind === "weekend") {
    return {
      icon: "calendar",
      headline: "Markets closed for the weekend",
      subtitle: "Enjoy your time off.",
    };
  }
  return {
    icon: "clock",
    headline: "No deals have happened yet today",
    subtitle: noDealsSubtitle(now),
  };
}
