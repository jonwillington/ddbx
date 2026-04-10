export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "Director Dealings",
  description:
    "Opinionated analysis of UK director (PDMR) share purchases, with evidence tables and tracked performance.",
  navItems: [
    { label: "Dashboard", href: "/" },
    { label: "Portfolio", href: "/portfolio" },
  ],
  navMenuItems: [
    { label: "Dashboard", href: "/" },
    { label: "Portfolio", href: "/portfolio" },
  ],
  links: {
    source: "https://www.sharecast.com/uk_shares/director_dealings",
  },
};
