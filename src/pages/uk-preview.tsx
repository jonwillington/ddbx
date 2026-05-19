// /uk-preview is the Phase-1 staging route for the UK port onto the
// shared MarketPage shell. The live UK page lives at `/` (DashboardPage)
// until parity is confirmed here; the production routes flip in Phase 3.
//
// Background: ddbx-site sibling lib/markets/uk.tsx + system map in
// ~/CLAUDE.md.
import { MarketPage } from "@/components/market/market-page";
import { UkMarket } from "@/lib/markets/uk";

export default function UkPreviewPage() {
  return <MarketPage config={UkMarket} />;
}
