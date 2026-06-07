import { useEffect, useState } from "react";
import { useAuthStore } from "../store";
import { authApi } from "../services/api";
import LoginView from "../pages/LoginView";

type Status = "loading" | "login" | "ok";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, setProfile, clearProfile } = useAuthStore();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) {
      setStatus("login");
      return;
    }
    authApi.me()
      .then(({ club }) => {
        setProfile(club.club_name, club.admin_name, club.email);
        setStatus("ok");
      })
      .catch(() => {
        clearProfile();
        setStatus("login");
      });
  }, [token]);

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
