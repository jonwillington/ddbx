import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { siteConfig } from "@/config/site";
import { marketForPath } from "@/lib/markets/registry";

/** Keeps `document.title` in sync with the route (SPA). Per-market title
 *  comes from MarketConfig.documentTitle; Portfolio / Director pages get
 *  their own treatment because they're cross-market in their final form. */
export function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const market = marketForPath(pathname);

    if (pathname === "/portfolio" || pathname.endsWith("/performance")) {
      document.title = `${siteConfig.brand} · Portfolio (${market.label}) — ${siteConfig.name}`;
    } else if (
      pathname.startsWith("/directors/") ||
      /\/directors\//.test(pathname)
    ) {
      document.title = `${siteConfig.brand} · Director (${market.label}) — ${siteConfig.name}`;
    } else {
      document.title = market.config.documentTitle;
    }
  }, [pathname]);

  return null;
}
