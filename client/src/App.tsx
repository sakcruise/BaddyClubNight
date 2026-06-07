import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import MainView from "./pages/MainView";
import SessionHistoryView from "./pages/SessionHistoryView";
import { useSessionStore } from "./store";
import { applyTheme } from "./styles/themes";
import type { ThemeKey } from "./styles/themes";

function ThemeApplier() {
  const themeKey = useSessionStore(s => s.clubConfig.themeKey) ?? "orange";
  // Apply immediately on every render where themeKey changes, including first mount
  useEffect(() => {
    applyTheme(themeKey as ThemeKey);
  }, [themeKey]);
  // Also apply synchronously before first paint to avoid flash
  applyTheme(themeKey as ThemeKey);
  return null;
}

export default function App() {
  return (
    <>
      <ThemeApplier />
      <AuthGuard>
        <Routes>
          <Route path="/" element={<MainView />} />
          <Route path="/history" element={<SessionHistoryView />} />
          {/* Legacy redirects */}
          <Route path="/kiosk" element={<Navigate to="/" replace />} />
          <Route path="/mobile" element={<Navigate to="/" replace />} />
          <Route path="/admin" element={<Navigate to="/" replace />} />
          <Route path="/leaderboard" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGuard>
    </>
  );
}
