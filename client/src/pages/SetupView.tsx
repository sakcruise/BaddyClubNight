import { useState } from "react";
import { supabase } from "../lib/supabase";
import { clubsApi } from "../services/api";
import { useAuthStore } from "../store";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

export default function SetupView({ onBack }: { onBack?: () => void }) {
  const [username, setUsername]       = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adminName, setAdminName]     = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [usernameOk, setUsernameOk]   = useState<boolean | null>(null);

  const { setAuth } = useAuthStore();

  // ── Check username availability on blur ───────────────────────────────────
  async function checkUsername() {
    const u = username.toLowerCase().trim();
    if (!u || u.length < 3) return;
    const taken = await clubsApi.isUsernameTaken(u);
    setUsernameOk(!taken);
    if (taken) setError("That Club ID is already taken — choose another");
    else setError("");
  }

  // ── Register ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const u = username.toLowerCase().trim();
    if (u.length < 3) { setError("Club ID must be at least 3 characters"); return; }
    if (!/^[a-z0-9_-]+$/.test(u)) { setError("Club ID can only contain letters, numbers, _ and -"); return; }
    if (password !== confirm)     { setError("Passwords don't match"); return; }
    if (password.length < 6)     { setError("Password must be at least 6 characters"); return; }

    setLoading(true);
    try {
      // Check username isn't taken
      const taken = await clubsApi.isUsernameTaken(u);
      if (taken) { setError("That Club ID is already taken — choose another"); return; }

      // Create Supabase auth user — store all profile info in user_metadata
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: u,
            display_name: displayName.trim(),
            admin_name: adminName.trim(),
          },
        },
      });
      if (signUpError) throw signUpError;

      const userId = data.user?.id;
      if (!userId) throw new Error("Signup succeeded but no user ID returned");

      // Create clubs row for username → email lookup
      await clubsApi.create(userId, u, displayName.trim(), email.trim());

      // Update store immediately if session was returned
      if (data.session) {
        setAuth(data.session.access_token, u, displayName.trim(), adminName.trim(), email.trim());
      }
      // AuthGuard's onAuthStateChange will fire and transition to "ok"
    } catch (err: any) {
      setError(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm focus:outline-none focus:border-orange-400 transition-colors";
  const btnCls   = "w-full py-3 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-orange-500/30";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(160deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 80%, rgb(var(--p-500)) 100%)" }}>

      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="bg-white/15 rounded-3xl p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
          <ShuttlecockIcon size={56} />
        </div>
        <h1 className="font-display font-black text-white text-3xl tracking-tight">Badminton Club</h1>
        <p className="text-orange-200 font-display font-semibold text-sm">Create your club account</p>
      </div>

      <form onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-black text-gray-900 text-xl">Welcome! 🏸</h2>
          <p className="text-gray-500 text-sm font-display mt-0.5">Each club gets their own private account.</p>
        </div>

        <div className="flex flex-col gap-3">

          {/* Club ID — used to log in */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">
              Club ID <span className="text-gray-400 font-normal">(used to log in)</span>
            </label>
            <div className="relative">
              <input
                type="text" value={username}
                onChange={(e) => { setUsername(e.target.value.toLowerCase()); setUsernameOk(null); setError(""); }}
                onBlur={checkUsername}
                placeholder="e.g. oasisbadminton"
                autoCapitalize="none" required
                className={`${inputCls} ${usernameOk === true ? "border-green-400" : usernameOk === false ? "border-red-400" : ""}`}
              />
              {usernameOk === true && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓ available</span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 font-display mt-1">
              Lowercase letters, numbers, _ and - only. Min 3 characters.
            </p>
          </div>

          {/* Display name — shown in the app header */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">
              Club Display Name <span className="text-gray-400 font-normal">(shown in the app)</span>
            </label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Oasis Badminton Club" required className={inputCls} />
          </div>

          {/* Admin name */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">
              Your Name <span className="text-gray-400 font-normal">(admin)</span>
            </label>
            <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g. Sakthi" required className={inputCls} />
          </div>

          {/* Email — for password reset only */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">
              Email <span className="text-gray-400 font-normal">(for password reset only)</span>
            </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@yourclub.com" required className={inputCls} />
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters" required className={inputCls} />
          </div>

          {/* Confirm */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Confirm Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password" required className={inputCls} />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">
            {error}
          </div>
        )}

        <button type="submit"
          disabled={loading || !username.trim() || !displayName.trim() || !adminName.trim() || !email.trim() || !password || !confirm}
          className={btnCls}>
          {loading ? "Creating account…" : "Create Account 🚀"}
        </button>

        {onBack && (
          <div className="border-t border-gray-100 pt-3 text-center">
            <button type="button" onClick={onBack}
              className="text-xs text-gray-400 font-display font-bold hover:text-orange-500 transition-colors">
              ← Back to sign in
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
