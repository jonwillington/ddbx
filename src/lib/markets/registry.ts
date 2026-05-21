// Central registry of every market the site knows about. Both the
// MarketSwitcher (route → flag/label) and DocumentTitle (route → page title)
// read from here so we have one place to declare a market exists.
//
// Adding a new market:
//   1. Write its MarketConfig at src/lib/markets/<id>.tsx
//   2. Add an entry below with its route prefix
//   3. Mount a page shim at src/pages/<id>-preview.tsx (1 line) and wire
//      routes in src/App.tsx
import type { MarketConfig } from "./types";

import { GB, NL, SE, US, type FlagComponent } from "country-flag-icons/react/3x2";

import { NetherlandsMarket } from "./netherlands";
import { SwedenMarket } from "./sweden";
import { UkMarket } from "./uk";
import { UsMarket } from "./us";

export interface MarketRegistryEntry {
  /** MarketConfig.id — "uk" | "us" | "se" | "nl". */
  id: string;
  /** Short code for the switcher chip. */
  code: string;
  /** Display label in the switcher dropdown. */
  label: string;
  /** Route the switcher links to. */
  route: string;
  /** Flag icon component. */
  Flag: FlagComponent;
  /** The MarketConfig itself — what MarketPage consumes. */
  config: MarketConfig;
}

export const MARKETS: MarketRegistryEntry[] = [
  {
    id: "uk",
    code: "UK",
    label: "UK",
    route: "/",
    Flag: GB,
    config: UkMarket as MarketConfig,
  },
  {
    id: "us",
    code: "US",
    label: "US",
    route: "/us",
    Flag: US,
    config: UsMarket as MarketConfig,
  },
  {
    id: "se",
    code: "SE",
    label: "SE",
    route: "/se",
    Flag: SE,
    config: SwedenMarket as MarketConfig,
  },
  {
    id: "nl",
    code: "NL",
    label: "NL",
    route: "/nl",
    Flag: NL,
    config: NetherlandsMarket as MarketConfig,
  },
];

/** Resolve a route to its owning market. UK is the default for paths that
 *  don't match a more specific market prefix. */
export function marketForPath(pathname: string): MarketRegistryEntry {
  const uk = MARKETS.find((m) => m.id === "uk");

  if (!uk) throw new Error("UK market must be registered");
  if (pathname.startsWith("/us-preview"))
    return MARKETS.find((m) => m.id === "us") ?? uk;
  if (pathname.startsWith("/se-preview") || pathname.startsWith("/eu"))
    return MARKETS.find((m) => m.id === "se") ?? uk;
  if (pathname.startsWith("/nl-preview"))
    return MARKETS.find((m) => m.id === "nl") ?? uk;

  const match = MARKETS.filter((m) => m.route !== "/")
    .sort((a, b) => b.route.length - a.route.length)
    .find((m) => pathname === m.route || pathname.startsWith(`${m.route}/`));

  if (match) return match;

  return uk;
}
