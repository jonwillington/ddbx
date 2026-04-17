import { Route, Routes, useLocation } from "react-router-dom";

import { DocumentTitle } from "@/components/document-title";
import DashboardPage from "@/pages/dashboard";
import PortfolioPage from "@/pages/portfolio";
import DirectorPage from "@/pages/director";

function App() {
  const location = useLocation();
  const state = location.state as { background?: { pathname: string; search: string } } | null;
  const background = state?.background;
  // When a footer drawer is open, preserve the underlying page by routing against the stored background.
  const routingLocation = background
    ? { ...location, pathname: background.pathname, search: background.search }
    : location;

  return (
    <>
      <DocumentTitle />
      <Routes location={routingLocation}>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<DashboardPage />} path="/dealings/:id" />
        <Route element={<DashboardPage />} path="/contact" />
        <Route element={<DashboardPage />} path="/privacy" />
        <Route element={<DashboardPage />} path="/cookies" />
        <Route element={<DashboardPage />} path="/terms" />
        <Route element={<PortfolioPage />} path="/portfolio" />
        <Route element={<DirectorPage />} path="/directors/:id" />
      </Routes>
    </>
  );
}

export default App;
