// /se and /se-preview render the shared MarketPage shell driven by the
// SwedenMarket config. Anything Sweden-specific (MAR flags, native-currency
// rendering, Swedish→English nature/role mapping) lives in
// src/lib/markets/sweden.tsx.
import { MarketPage } from "@/components/market/market-page";
import { SwedenMarket } from "@/lib/markets/sweden";

export default function SwedenPreviewPage() {
  return <MarketPage config={SwedenMarket} />;
}
