import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import { clubsApi, authApi } from "../services/api";
import { useGroupStore } from "../store";
import { Building2, Users } from "lucide-react";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import SetupView from "./SetupView";

type Mode = "login" | "forgot";

export default function LoginView() {
  const [mode, setMode]           = useState<Mode>("login");
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupType, setSetupType] = useState<"club" | "group">("club");
  const [chooseType, setChooseType] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [personalResetLink, setPersonalResetLink] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    const mode = sessionStorage.getItem("pending_auth_mode");
    if (mode === "signup_group") {
      sessionStorage.removeItem("pending_auth_mode");
      setSetupType("group");
      setShowSetup(true);
    }
  }, []);

  const bg = "linear-gradient(160deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 80%, rgb(var(--p-500)) 100%)";
  const inputCls = "w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm focus:outline-none focus:border-orange-400 transition-colors";
  const btnCls   = "w-full py-3 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-orange-500/30";

  if (showSetup) return <SetupView accountType={setupType} onBack={() => { setShowSetup(false); setChooseType(true); }} />;

  // ── Play with friends (no account) ─────────────────────────────────────────
  // Friends-group mode is fully local, so it needs no Supabase login.
  function enterFriends() {
    localStorage.setItem("friends-guest", "true");
    useGroupStore.getState().setAppMode("friends");
    window.location.href = window.location.origin + "/groups";
  }

  // ── Account type chooser (shown before account creation) ───────────────────
  if (chooseType) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8" style={{ background: bg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white/15 rounded-3xl p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
            <ShuttlecockIcon size={48} />
          </div>
          <h1 className="font-display font-black text-white text-2xl tracking-tight">Get started</h1>
          <p className="text-orange-200 font-display font-semibold text-sm">What are you setting up?</p>
          <p className="text-white/50 font-display text-xs text-center max-w-xs">One account works for both — you can switch modes any time after signing in.</p>
        </div>

        <div className="w-full max-w-sm flex flex-col gap-3">
          <button onClick={() => { setSetupType("club"); setChooseType(false); setShowSetup(true); }}
            className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-2xl shadow-black/20 text-left active:scale-95 transition-transform">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center flex-shrink-0">
              <Building2 size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-black text-gray-900 text-lg">A Club</div>
              <div className="text-gray-500 text-sm font-display">Fixed venue & nights, permanent roster</div>
            </div>
          </button>

          <button onClick={() => { setSetupType("group"); setChooseType(false); setShowSetup(true); }}
            className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-2xl shadow-black/20 text-left active:scale-95 transition-transform">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-400 flex items-center justify-center flex-shrink-0">
              <Users size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-black text-gray-900 text-lg">A Group of Friends</div>
              <div className="text-gray-500 text-sm font-display">Casual play any day, split the costs & invite friends</div>
            </div>
          </button>
        </div>

        <button type="button" onClick={() => setChooseType(false)}
          className="text-xs text-white/70 font-display font-bold hover:text-white transition-colors">
          ← Back to sign in
        </button>
      </div>
    );
  }

  // ── Sign In ───────────────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Resolve username → email via clubs table; fall back to treating input as email
      const resolvedEmail = await clubsApi.findEmail(username) ?? username.trim();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });
      if (authError) throw authError;
      // AuthGuard's onAuthStateChange fires → transitions to "ok" automatically
    } catch (err: any) {
      setError(err.message ?? "Login failed — check your username and password");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot Password ───────────────────────────────────────────────────────
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // All accounts use synthetic auth emails — reset always goes server-side.
      const link = await authApi.forgotPersonal(username, forgotEmail);
      setPersonalResetLink(link);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message ?? "Could not send reset email");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setResetSent(false);
    setPassword("");
    setForgotEmail("");
    setPersonalResetLink(null);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: bg }}>

      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="bg-white/15 rounded-3xl p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
          <ShuttlecockIcon size={56} />
        </div>
        <h1 className="font-display font-black text-white text-3xl tracking-tight">Badminton</h1>
        <p className="text-orange-200 font-display font-semibold text-sm">Game night, sorted</p>
      </div>

      {/* ── Sign In ── */}
      {mode === "login" && (
        <form onSubmit={handleSignIn}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-display font-black text-gray-900 text-xl">Sign In 👋</h2>
            <p className="text-gray-500 text-sm font-display mt-0.5">Enter your login details.</p>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-display font-bold text-gray-600 mb-1 block">User ID</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="User ID" autoFocus required autoCapitalize="none"
                className={inputCls} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-display font-bold text-gray-600">Password</label>
                <button type="button" onClick={() => switchMode("forgot")}
                  className="text-xs font-display font-bold text-orange-500 hover:text-orange-600 transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password" required className={`${inputCls} pr-10`} />
                <button type="button" tabIndex={-1} onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !username.trim() || !password} className={btnCls}>
            {loading ? "Signing in…" : "Sign In 🏸"}
          </button>

          <div className="border-t border-gray-100 pt-3 text-center">
            <button type="button" onClick={() => setChooseType(true)}
              className="text-xs font-display font-bold text-orange-500 hover:text-orange-600 transition-colors">
              New here? Create a free account →
            </button>
          </div>

          <button type="button" onClick={enterFriends}
            className="w-full py-3 rounded-2xl font-display font-black text-purple-700 text-sm bg-purple-50 border-2 border-purple-200 hover:bg-purple-100 active:scale-95 transition-all">
            🏸 Just exploring? Continue as guest →
          </button>
        </form>
      )}

      {/* ── Forgot Password ── */}
      {mode === "forgot" && (
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
          {resetSent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              {personalResetLink ? (
                <>
                  <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center text-2xl">🔑</div>
                  <h2 className="font-display font-black text-gray-900 text-xl">Reset your password</h2>
                  <p className="text-gray-500 text-sm font-display">
                    Click the button below to set a new password. This link is single-use and expires soon.
                  </p>
                  <a href={personalResetLink}
                    className="w-full py-3 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 text-center block active:scale-95 transition-all shadow-lg shadow-purple-500/20 mt-1">
                    Set new password →
                  </a>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">✉️</div>
                  <h2 className="font-display font-black text-gray-900 text-xl">Check your email</h2>
                  <p className="text-gray-500 text-sm font-display">
                    We sent a password reset link to the email address on your account.<br />
                    Click it to set a new password.
                  </p>
                </>
              )}
              <button type="button" onClick={() => switchMode("login")}
                className="text-xs font-display font-bold text-orange-500 hover:text-orange-600 transition-colors mt-2">
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="flex flex-col gap-4">
              <div>
                <h2 className="font-display font-black text-gray-900 text-xl">Reset password 🔑</h2>
                <p className="text-gray-500 text-sm font-display mt-0.5">
                  Enter your User ID and registered email.
                </p>
              </div>

              <div>
                <label className="text-xs font-display font-bold text-gray-600 mb-1 block">User ID</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="your user ID" autoFocus required autoCapitalize="none"
                  className={inputCls} />
              </div>

              <div>
                <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Email</label>
                <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="the email you registered with"
                  required className={inputCls} />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !username.trim() || !forgotEmail.trim()} className={btnCls}>
                {loading ? "Sending…" : "Send Reset Link 📧"}
              </button>

              <div className="border-t border-gray-100 pt-3 text-center">
                <button type="button" onClick={() => switchMode("login")}
                  className="text-xs text-gray-400 font-display font-bold hover:text-orange-500 transition-colors">
                  ← Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
