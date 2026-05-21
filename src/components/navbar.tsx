import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import { MarketSwitcher } from "@/components/market-switcher";
import { marketForPath } from "@/lib/markets/registry";

export const Navbar = () => {
  const location = useLocation();
  const market = marketForPath(location.pathname);
  // Dashboard and Performance both route within the active market. The
  // dashboard sits at the market's root (/, /us, /se); performance lives
  // under it (/portfolio for UK historical reasons, /:market/performance
  // otherwise).
  const dashboardHref = market.route;
  const performanceHref =
    market.id === "uk" ? "/portfolio" : `${market.route}/performance`;

  const navItems = [
    {
      label: "Dashboard",
      href: dashboardHref,
      match: (p: string) =>
        p === dashboardHref || (market.id === "uk" && p === "/"),
    },
    {
      label: "Performance",
      href: performanceHref,
      match: (p: string) =>
        p === performanceHref || (market.id === "uk" && p === "/portfolio"),
    },
  ];

  return (
    <nav className="w-full border-b border-separator bg-[#f5f0e8]/90 dark:bg-background/70 backdrop-blur-lg">
      <header className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-3 px-4 md:gap-4 md:px-6">
        <div className="flex items-center gap-6">
          <Link className="shrink-0" to={market.route}>
            <img
              alt={siteConfig.name}
              className="h-7 max-w-[56px] dark:invert"
              src="/logo.svg"
            />
          </Link>
          <MarketSwitcher />
          <ul className="flex gap-4">
            {navItems.map((item) => {
              const active = item.match(location.pathname);

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
        <div className="flex items-center gap-3 md:gap-4">
          <ThemeSwitch />
        </div>
      </header>
    </nav>
  );
};
