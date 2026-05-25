import { Routes, Route, Navigate } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import MainView from "./pages/MainView";
import SessionHistoryView from "./pages/SessionHistoryView";

export default function App() {
  return (
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
  );
}
