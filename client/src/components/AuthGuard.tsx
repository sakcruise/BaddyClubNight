import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store";
import { authApi } from "../services/api";
import LoginView from "../pages/LoginView";

type Status = "loading" | "login" | "ok";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { setProfile, clearProfile } = useAuthStore();
  const [status, setStatus] = useState<Status>("loading");

  async function loadProfile() {
    try {
      const profile = await authApi.getClubProfile();
      const { data: { user } } = await supabase.auth.getUser();
      setProfile(profile.club_name, profile.admin_name, user?.email ?? "");
      setStatus("ok");
    } catch {
      setStatus("login");
    }
  }

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadProfile();
      } else {
        setStatus("login");
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadProfile();
      } else {
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
