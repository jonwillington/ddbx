import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";

export const Navbar = () => {
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-separator bg-[#f5f0e8]/90 dark:bg-background/70 backdrop-blur-lg">
      <header className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-3 px-4 md:gap-4 md:px-6">
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
        <div className="flex items-center gap-3 md:gap-4">
          <ThemeSwitch />
        </div>
      </header>
    </nav>
  );
};
