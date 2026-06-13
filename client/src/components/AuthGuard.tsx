import { useEffect, useState } from "react";
import { useAuthStore, useGroupStore } from "../store";
import { supabase } from "../lib/supabase";

/**
 * Set the starting mode for a fresh login. If the user already has a persisted
 * appMode we respect it — one account can freely switch between club and friends.
 */
function applyAccountMode(meta: Record<string, any>) {
  const current = useGroupStore.getState().appMode;
  if (current !== null) return; // user already chose — don't override
  if (meta?.account_type === "group") useGroupStore.getState().setAppMode("friends");
  else if (meta?.account_type === "club") useGroupStore.getState().setAppMode("club");
}
import LoginView from "../pages/LoginView";
import ResetPasswordView from "../pages/ResetPasswordView";

type Status = "loading" | "login" | "reset" | "ok";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { setAuth, clearProfile, token } = useAuthStore();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    // If the URL hash contains a Supabase recovery token (user clicked a reset link),
    // go straight to the reset view — don't let getSession() race ahead to "ok".
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get("type") === "recovery") {
      setStatus("reset");
      return;
    }

    // Friends-group "guest" mode runs entirely locally (no Supabase) — let them in
    // without a club login.
    if (localStorage.getItem("friends-guest") === "true") {
      setStatus("ok");
      return;
    }

    // If offline flag is set and we have a cached token, let them in
    const offlineMode = localStorage.getItem("offline-mode") === "true";
    if (offlineMode && token) {
      setStatus("ok");
      return;
    }

    // Check Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const meta = session.user.user_metadata ?? {};
        applyAccountMode(meta);
        setAuth(
          session.access_token,
          meta.username ?? "",
          meta.display_name ?? meta.club_name ?? session.user.email ?? "",
          meta.admin_name ?? "",
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

    // Listen for auth state changes (login / logout / password recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("reset");
        return;
      }
      if (session) {
        const meta = session.user.user_metadata ?? {};
        applyAccountMode(meta);
        setAuth(
          session.access_token,
          meta.username ?? "",
          meta.display_name ?? meta.club_name ?? session.user.email ?? "",
          meta.admin_name ?? "",
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
  if (status === "reset") return <ResetPasswordView />;
  return <>{children}</>;
}
