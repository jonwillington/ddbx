import { useMemo } from "react";
import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";

function useMarketStatus() {
  return useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const isWeekday = dow >= 1 && dow <= 5;

    const londonHour = parseInt(
      now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }),
    );
    const londonMin = parseInt(
      now.toLocaleString("en-GB", { timeZone: "Europe/London", minute: "2-digit" }),
    );
    const londonMins = londonHour * 60 + londonMin;
    const open = isWeekday && londonMins >= 480 && londonMins < 990;

    let next: string | null = null;
    if (!open) {
      const d = new Date(now);
      if (!isWeekday) {
        d.setDate(d.getDate() + (dow === 0 ? 1 : 2));
      } else if (londonMins >= 990) {
        d.setDate(d.getDate() + (dow === 5 ? 3 : 1));
      }
      if (d.getDate() !== now.getDate() || !isWeekday) {
        next = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      }
    }

    return { marketOpen: open, nextMarketOpen: next };
  }, []);
}

export const Navbar = () => {
  const location = useLocation();
  const { marketOpen, nextMarketOpen } = useMarketStatus();

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-separator bg-[#f5f0e8]/90 dark:bg-background/70 backdrop-blur-lg">
      <header className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="shrink-0">
            <img src="/logo.svg" alt={siteConfig.name} className="h-7 max-w-[56px] dark:invert" />
          </Link>
          <ul className="flex gap-4">
            {siteConfig.navItems.map((item) => {
              const active = location.pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    className={clsx(
                      "text-sm transition-colors",
                      active
                        ? "text-[#6b5038] font-medium"
                        : "text-foreground hover:text-[#6b5038]",
                    )}
                    to={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex items-center justify-center w-4 h-4 shrink-0">
              <span className={`absolute inset-0 rounded-full ${marketOpen ? "bg-green-500/15" : "bg-red-500/15"}`} />
              <span className={`relative w-1.5 h-1.5 rounded-full ${marketOpen ? "bg-green-500" : "bg-red-500/60"}`} />
            </span>
            <span className="text-xs text-muted">
              {marketOpen ? "Market open" : "Market closed"}
              {!marketOpen && nextMarketOpen && ` · Reopens ${nextMarketOpen}`}
            </span>
          </div>
          <ThemeSwitch />
        </div>
      </header>
    </nav>
  );
};
