// /nl and /nl-preview render the shared MarketPage shell driven by the
// NetherlandsMarket config. Anything NL-specific (MAR flags, EUR
// rendering, Dutch→English nature/role mapping, AFM detail-page parse
// flavour) lives in src/lib/markets/netherlands.tsx.
import { MarketPage } from "@/components/market/market-page";
import { NetherlandsMarket } from "@/lib/markets/netherlands";

export default function NetherlandsPreviewPage() {
  return <MarketPage config={NetherlandsMarket} />;
}
