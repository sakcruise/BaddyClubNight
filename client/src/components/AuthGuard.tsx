import { useEffect, useState } from "react";
import { useAuthStore } from "../store";
import { supabase } from "../lib/supabase";
import LoginView from "../pages/LoginView";

type Status = "loading" | "login" | "ok";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { setAuth, clearProfile, token } = useAuthStore();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    // If offline flag is set and we have a cached token, let them in
    const offlineMode = localStorage.getItem("offline-mode") === "true";
    if (offlineMode && token) {
      setStatus("ok");
      return;
    }

    // Check Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const meta = session.user.user_metadata;
        setAuth(
          session.access_token,
          meta?.club_name ?? session.user.email ?? "",
          meta?.admin_name ?? "",
          session.user.email ?? ""
        );
        setStatus("ok");
      } else if (offlineMode && token) {
        // Offline + cached token — allow in
        setStatus("ok");
      } else {
        clearProfile();
        setStatus("login");
      }
    }).catch(() => {
      // Network error — if we have a cached token, allow offline access
      if (token) {
        setStatus("ok");
      } else {
        setStatus("login");
      }
    });

    // Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const meta = session.user.user_metadata;
        setAuth(
          session.access_token,
          meta?.club_name ?? session.user.email ?? "",
          meta?.admin_name ?? "",
          session.user.email ?? ""
        );
        setStatus("ok");
      } else if (localStorage.getItem("offline-mode") !== "true") {
        clearProfile();
        setStatus("login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(160deg, #7c2d12 0%, #ea580c 80%, #f59e0b 100%)" }}>
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "login") return <LoginView />;
  return <>{children}</>;
}
