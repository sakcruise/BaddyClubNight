import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import MainView from "./pages/MainView";
import SessionHistoryView from "./pages/SessionHistoryView";
import AnalyticsView from "./pages/AnalyticsView";
import ModeChooser from "./pages/ModeChooser";
import GroupsHomeView from "./pages/GroupsHomeView";
import GroupDetailView from "./pages/GroupDetailView";
import { useSessionStore, useGroupStore } from "./store";
import { applyTheme } from "./styles/themes";
import type { ThemeKey } from "./styles/themes";
import { isWeb } from "./lib/isWeb";

function ThemeApplier() {
  const themeKey = useSessionStore(s => s.clubConfig.themeKey) ?? "orange";
  useEffect(() => {
    applyTheme(themeKey as ThemeKey);
  }, [themeKey]);
  applyTheme(themeKey as ThemeKey);
  return null;
}

function AppRoutes() {
  const appMode = useGroupStore((s) => s.appMode);
  const session = useSessionStore((s) => s.session);

  // First run (or after "switch mode"): ask club vs friends.
  // An active group session counts as having chosen friends mode.
  if (appMode === null && !session?.group_id) return <ModeChooser />;

  return (
    <Routes>
      <Route path="/" element={<MainView />} />
      <Route path="/history" element={<SessionHistoryView />} />
      <Route path="/analytics" element={<AnalyticsView />} />
      <Route path="/groups" element={<GroupsHomeView />} />
      <Route path="/groups/:id" element={<GroupDetailView />} />
      {/* Catch-all redirects for old/unused routes */}
      <Route path="/leaderboard" element={<Navigate to="/" replace />} />
      <Route path="/kiosk" element={<Navigate to="/" replace />} />
      <Route path="/mobile" element={<Navigate to="/" replace />} />
      <Route path="/admin" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Same app everywhere — login required, works on web + Pi
  // isWeb() is used only for behaviour differences (e.g. offline mode display)
  return (
    <>
      <ThemeApplier />
      <AuthGuard>
        <AppRoutes />
      </AuthGuard>
    </>
  );
}
