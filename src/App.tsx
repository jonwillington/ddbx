import { Route, Routes } from "react-router-dom";

import { BetaTag } from "@/components/market/beta-tag";
import { DocumentTitle } from "@/components/document-title";
import PerformancePage from "@/pages/performance";
import DirectorPage from "@/pages/director";
import NetherlandsPreviewPage from "@/pages/netherlands-preview";
import SwedenPreviewPage from "@/pages/sweden-preview";
import UsPreviewPage from "@/pages/us-preview";
import UkPreviewPage from "@/pages/uk-preview";

function App() {
  return (
    <div className="relative">
      <DocumentTitle />
      <BetaTag />
      <Routes>
        <Route element={<UkPreviewPage />} path="/" />
        <Route element={<UkPreviewPage />} path="/dealings/:id" />
        <Route element={<UkPreviewPage />} path="/contact" />
        <Route element={<UkPreviewPage />} path="/privacy" />
        <Route element={<UkPreviewPage />} path="/cookies" />
        <Route element={<UkPreviewPage />} path="/terms" />
        <Route element={<PerformancePage />} path="/portfolio" />
        <Route element={<PerformancePage />} path="/performance" />
        <Route element={<PerformancePage />} path="/us/performance" />
        <Route element={<PerformancePage />} path="/se/performance" />
        <Route element={<PerformancePage />} path="/nl/performance" />
        <Route element={<DirectorPage />} path="/directors/:id" />
        <Route element={<DirectorPage />} path="/us/directors/:id" />
        <Route element={<DirectorPage />} path="/se/directors/:id" />
        <Route element={<DirectorPage />} path="/nl/directors/:id" />
        <Route element={<UsPreviewPage />} path="/us-preview" />
        <Route element={<UsPreviewPage />} path="/us" />
        <Route element={<SwedenPreviewPage />} path="/se-preview" />
        <Route element={<SwedenPreviewPage />} path="/se" />
        <Route element={<NetherlandsPreviewPage />} path="/nl-preview" />
        <Route element={<NetherlandsPreviewPage />} path="/nl" />
        <Route element={<UkPreviewPage />} path="/uk-preview" />
      </Routes>
    </div>
  );
}

export default App;
