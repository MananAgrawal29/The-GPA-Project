import { Route, Routes } from "react-router";
import AppShell from "./components/AppShell";
import { plannedModules } from "./navigation";
import AcademicsPage from "./pages/AcademicsPage";
import CalendarPage from "./pages/CalendarPage";
import NotFoundPage from "./pages/NotFoundPage";
import PlannedModulePage from "./pages/PlannedModulePage";
import SubjectsPage from "./pages/SubjectsPage";
import TimetablePage from "./pages/TimetablePage";
import TodayPage from "./pages/TodayPage";

/**
 * Routing and layout only.
 *
 * `/academics` and its nested subject routes are real screens backed by
 * the API; every other module route below is a deliberate placeholder
 * that exists so the navigation
 * is complete and honest. Real screens replace these one prompt at a
 * time.
 */
export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/academics" element={<AcademicsPage />} />
        <Route path="/academics/subjects" element={<SubjectsPage />} />
        <Route path="/timetable" element={<TimetablePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route
          path="/academics/subjects/:subjectId"
          element={<SubjectsPage />}
        />
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
