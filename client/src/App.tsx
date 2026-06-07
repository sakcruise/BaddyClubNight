import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import MainView from "./pages/MainView";
import SessionHistoryView from "./pages/SessionHistoryView";
import PublicView from "./pages/PublicView";
import { useSessionStore } from "./store";
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

export default function App() {
  // On Vercel (web): show public read-only view — no login needed
  if (isWeb()) {
    return (
      <Routes>
        <Route path="*" element={<PublicView />} />
      </Routes>
    );
  }

  // On Pi (localhost): full admin app with auth
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
