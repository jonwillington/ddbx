// /us and /us-preview render the shared MarketPage shell driven by the
// UsMarket config. Anything market-specific (Form 4 row chips, the detail
// body with footnotes/derivative table/co-reporters, the SPY benchmark
// wiring) lives in src/lib/markets/us.tsx. Anything pan-market (page
// layout, hero card, today drawer, monthly grouping, modal detail drawer
// chrome) lives in src/components/market/.
//
// New markets land as a sibling MarketConfig + a similar one-line page
// shim — see investigations/multi-market/strategy.md.
import { MarketPage } from "@/components/market/market-page";
import { UsMarket } from "@/lib/markets/us";

export default function UsPreviewPage() {
  return <MarketPage config={UsMarket} />;
}
