// Generic Today-empty-state for any market with a session + holiday source.
// MarketPage falls back to this when a config provides session+holidays but
// no bespoke TodayEmpty slot — so US/SE inherit the LSE-style "Closed for
// X" / "Markets reopen at HH:MM" copy without each writing its own wrapper.

import { TodayEmptyState } from "@/components/today-empty-state";
import { useExchangeHolidays, type HolidaySource } from "@/lib/bank-holidays";
import { marketStatus, type MarketSession } from "@/lib/market-status";

export function MarketTodayEmpty({
  session,
  holidays: holidaySource,
}: {
  session: MarketSession;
  holidays: HolidaySource;
}) {
  const holidays = useExchangeHolidays(holidaySource);
  const status = marketStatus(session, new Date(), holidays);

  return <TodayEmptyState session={session} status={status} variant="inline" />;
}
