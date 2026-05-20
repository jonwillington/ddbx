import { Route, Routes } from "react-router-dom";

import { DocumentTitle } from "@/components/document-title";
import PerformancePage from "@/pages/performance";
import DirectorPage from "@/pages/director";
import EuPreviewPage from "@/pages/eu-preview";
import SwedenPreviewPage from "@/pages/sweden-preview";
import UsPreviewPage from "@/pages/us-preview";
import UkPreviewPage from "@/pages/uk-preview";

function App() {
  return (
    <>
      <DocumentTitle />
      <Routes>
        <Route element={<UkPreviewPage />} path="/" />
        <Route element={<UkPreviewPage />} path="/dealings/:id" />
        <Route element={<UkPreviewPage />} path="/contact" />
        <Route element={<UkPreviewPage />} path="/privacy" />
        <Route element={<UkPreviewPage />} path="/cookies" />
        <Route element={<UkPreviewPage />} path="/terms" />
        <Route element={<PerformancePage />} path="/portfolio" />
        <Route element={<PerformancePage />} path="/performance" />
        <Route element={<DirectorPage />} path="/directors/:id" />
        <Route element={<UsPreviewPage />} path="/us-preview" />
        <Route element={<UsPreviewPage />} path="/us" />
        <Route element={<EuPreviewPage />} path="/eu-preview" />
        <Route element={<EuPreviewPage />} path="/eu" />
        <Route element={<SwedenPreviewPage />} path="/se-preview" />
        <Route element={<SwedenPreviewPage />} path="/se" />
        <Route element={<UkPreviewPage />} path="/uk-preview" />
      </Routes>
    </>
  );
}

export default App;
