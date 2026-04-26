export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  /** Short brand — browser tab / sharing prefix */
  brand: "ddbx",
  name: "Director Dealings",
  /** Primary `<title>`: brand · product — tagline */
  documentTitle: "ddbx · Director Dealings — UK Insider Transactions",
  description:
    "Opinionated analysis of UK director (PDMR) share purchases, with evidence tables and tracked performance.",
  navItems: [
    { label: "Dashboard", href: "/" },
    { label: "Performance", href: "/portfolio" },
  ],
  navMenuItems: [
    { label: "Dashboard", href: "/" },
    { label: "Performance", href: "/portfolio" },
  ],
  links: {
    source: "https://www.sharecast.com/uk_shares/director_dealings",
  },
};
