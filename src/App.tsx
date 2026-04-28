import { Route, Routes, useLocation } from "react-router-dom";

import { DocumentTitle } from "@/components/document-title";
import { TodayDrawer } from "@/components/today-drawer";
import DashboardPage from "@/pages/dashboard";
import PerformancePage from "@/pages/performance";
import DirectorPage from "@/pages/director";

// Routes that should NOT show the right-hand TodayDrawer. Everything else
// gets it. Mounting the drawer here (above Routes) keeps its data + scroll
// state across page changes — Performance ↔ Dashboard no longer remounts
// the drawer's deals/news fetches.
const HIDE_DRAWER_PREFIXES = ["/directors/"];

function App() {
  const { pathname } = useLocation();
  const showDrawer = !HIDE_DRAWER_PREFIXES.some((p) => pathname.startsWith(p));

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
      {showDrawer && <TodayDrawer />}
    </>
  );
}

export default App;
