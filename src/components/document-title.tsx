import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { siteConfig } from "@/config/site";

/** Keeps `document.title` in sync with the route (SPA). */
export function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname === "/portfolio") {
      document.title = `${siteConfig.brand} · Portfolio — ${siteConfig.name}`;
    } else if (pathname.startsWith("/directors/")) {
      document.title = `${siteConfig.brand} · Director — ${siteConfig.name}`;
    } else {
      document.title = siteConfig.documentTitle;
    }
  }, [pathname]);

  return null;
}
