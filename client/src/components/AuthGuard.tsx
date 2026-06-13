import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore, useGroupStore } from "../store";
import { supabase } from "../lib/supabase";

/**
 * Derive the app mode from the account type.
 * user_metadata is the fast path; the accounts table is the authoritative source.
 * We always query the table so stale/wrong metadata can't override it.
 */
async function applyAccountMode(userId: string, meta: Record<string, any>) {
  // Start with the metadata hint so the store is set immediately (no flash)
  const metaMode = meta?.account_type === "group" ? "friends" : "club";
  useGroupStore.getState().setAppMode(metaMode);

  // Then verify against the accounts table (source of truth)
  try {
    const { data } = await supabase
      .from("accounts")
      .select("account_type")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      const dbMode = data.account_type === "group" ? "friends" : "club";
      if (dbMode !== metaMode) {
        useGroupStore.getState().setAppMode(dbMode);
      }
    }
  } catch {
    // network error — stick with metadata hint
  }
}
import LoginView from "../pages/LoginView";
import ResetPasswordView from "../pages/ResetPasswordView";

type Status = "loading" | "login" | "reset" | "ok";

function redirectPendingInvite(navigate: ReturnType<typeof useNavigate>) {
  const token = sessionStorage.getItem("pending_invite");
  if (token) {
    sessionStorage.removeItem("pending_invite");
    navigate(`/groups/join/${token}`, { replace: true });
  }
}

/**
 * After a club account logs in, if the browser URL happens to be /groups
 * (stale from a previous friends session), send them to / instead.
 */
function redirectClubHome(mode: "club" | "friends", navigate: ReturnType<typeof useNavigate>) {
  if (mode === "club" && window.location.pathname.startsWith("/groups")) {
    navigate("/", { replace: true });
  }
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const meta = session.user.user_metadata ?? {};
        const mode = meta?.account_type === "group" ? "friends" : "club";
        applyAccountMode(session.user.id, meta); // fire-and-forget; fast path already set
        setAuth(
          session.access_token,
          meta.username ?? "",
          meta.display_name ?? meta.club_name ?? session.user.email ?? "",
          meta.admin_name ?? "",
          session.user.email ?? ""
        );
        setStatus("ok");
        redirectPendingInvite(navigate);
        redirectClubHome(mode, navigate);
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
        const mode = meta?.account_type === "group" ? "friends" : "club";
        applyAccountMode(session.user.id, meta); // fire-and-forget; fast path already set
        setAuth(
          session.access_token,
          meta.username ?? "",
          meta.display_name ?? meta.club_name ?? session.user.email ?? "",
          meta.admin_name ?? "",
          session.user.email ?? ""
        );
        setStatus("ok");
        redirectPendingInvite(navigate);
        redirectClubHome(mode, navigate);
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
