import { Route, Routes } from "react-router";
import AppShell from "./components/AppShell";
import { plannedModules } from "./navigation";
import NotFoundPage from "./pages/NotFoundPage";
import PlannedModulePage from "./pages/PlannedModulePage";
import TodayPage from "./pages/TodayPage";

/**
 * Routing and layout only.
 *
 * Every module route below is a deliberate placeholder: it exists so the
 * navigation is complete and honest, not so the shell can imply a feature
 * works. Real screens replace these one prompt at a time.
 */
export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        {plannedModules.map((module) => (
          <Route
            key={module.path}
            path={module.path}
            element={<PlannedModulePage module={module} />}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
