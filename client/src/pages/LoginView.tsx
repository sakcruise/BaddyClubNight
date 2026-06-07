import { useState } from "react";
import { supabase } from "../lib/supabase";
import { clubsApi } from "../services/api";
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
  const [resetSent, setResetSent] = useState(false);

  if (showSetup) return <SetupView onBack={() => setShowSetup(false)} />;

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
      setError(err.message ?? "Login failed — check your Club ID and password");
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
      const email = await clubsApi.findEmail(username);
      if (!email) throw new Error("No account found with that Club ID");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
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
  }

  const bg = "linear-gradient(160deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 80%, rgb(var(--p-500)) 100%)";
  const inputCls = "w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm focus:outline-none focus:border-orange-400 transition-colors";
  const btnCls   = "w-full py-3 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-orange-500/30";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: bg }}>

      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="bg-white/15 rounded-3xl p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
          <ShuttlecockIcon size={56} />
        </div>
        <h1 className="font-display font-black text-white text-3xl tracking-tight">Badminton Club</h1>
        <p className="text-orange-200 font-display font-semibold text-sm">Club Night Manager</p>
      </div>

      {/* ── Sign In ── */}
      {mode === "login" && (
        <form onSubmit={handleSignIn}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-display font-black text-gray-900 text-xl">Sign In 👋</h2>
            <p className="text-gray-500 text-sm font-display mt-0.5">Use your Club ID and password.</p>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Club ID</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. oasisbadminton" autoFocus required autoCapitalize="none"
                className={inputCls} />
              <p className="text-[10px] text-gray-400 font-display mt-1">Your unique login ID — set when you created the account</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-display font-bold text-gray-600">Password</label>
                <button type="button" onClick={() => switchMode("forgot")}
                  className="text-xs font-display font-bold text-orange-500 hover:text-orange-600 transition-colors">
                  Forgot password?
                </button>
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password" required className={inputCls} />
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
            <button type="button" onClick={() => setShowSetup(true)}
              className="text-xs font-display font-bold text-orange-500 hover:text-orange-600 transition-colors">
              New club? Create your free account →
            </button>
          </div>
        </form>
      )}

      {/* ── Forgot Password ── */}
      {mode === "forgot" && (
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
          {resetSent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">✉️</div>
              <h2 className="font-display font-black text-gray-900 text-xl">Check your email</h2>
              <p className="text-gray-500 text-sm font-display">
                We sent a password reset link to the email address on your account.<br />
                Click it to set a new password.
              </p>
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
                  Enter your Club ID and we'll email you a reset link.
                </p>
              </div>

              <div>
                <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Club ID</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. oasisbadminton" autoFocus required autoCapitalize="none"
                  className={inputCls} />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !username.trim()} className={btnCls}>
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
