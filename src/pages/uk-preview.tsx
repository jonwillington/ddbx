// Router-aware wrapper around <MarketPage config={UkMarket} />. Reads :id
// from the URL so /dealings/:id deep-links into the drawer, and writes back
// to the URL when the user selects a row. Mounted at multiple routes —
// the static-page routes share this same component so the layout stays
// stable when the navbar moves between sections.
import { useNavigate, useParams } from "react-router-dom";

import { MarketPage } from "@/components/market/market-page";
import { UkMarket } from "@/lib/markets/uk";

export default function UkPreviewPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  return (
    <MarketPage
      config={UkMarket}
      selectedKey={id ?? null}
      onSelectionChange={(key) => {
        if (key) navigate(`/dealings/${key}`);
        else navigate("/");
      }}
    />
  );
}
