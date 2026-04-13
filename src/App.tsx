import { Route, Routes } from "react-router-dom";

import { DocumentTitle } from "@/components/document-title";
import DashboardPage from "@/pages/dashboard";
import PortfolioPage from "@/pages/portfolio";
import DirectorPage from "@/pages/director";

function App() {
  return (
    <>
      <DocumentTitle />
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<DashboardPage />} path="/dealings/:id" />
        <Route element={<PortfolioPage />} path="/portfolio" />
        <Route element={<DirectorPage />} path="/directors/:id" />
      </Routes>
    </>
  );
}

export default App;
