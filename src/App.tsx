import { Route, Routes } from "react-router-dom";

import { DocumentTitle } from "@/components/document-title";
import DashboardPage from "@/pages/dashboard";
import PerformancePage from "@/pages/performance";
import DirectorPage from "@/pages/director";

function App() {
  return (
    <>
      <DocumentTitle />
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<DashboardPage />} path="/dealings/:id" />
        <Route element={<DashboardPage />} path="/contact" />
        <Route element={<DashboardPage />} path="/privacy" />
        <Route element={<DashboardPage />} path="/cookies" />
        <Route element={<DashboardPage />} path="/terms" />
        <Route element={<PerformancePage />} path="/portfolio" />
        <Route element={<PerformancePage />} path="/performance" />
        <Route element={<DirectorPage />} path="/directors/:id" />
      </Routes>
    </>
  );
}

export default App;
