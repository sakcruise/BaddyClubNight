import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import { clubsApi } from "../services/api"; // used for username availability check
import { useAuthStore, useGroupStore } from "../store";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

type AccountType = "club" | "group";

export default function SetupView({ onBack, accountType = "club" }: { onBack?: () => void; accountType?: AccountType }) {
  const isGroup = accountType === "group";

  const [userId, setUserId]           = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [userIdOk, setUserIdOk]       = useState<boolean | null>(null);
  const [showPwd, setShowPwd]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { setAuth } = useAuthStore();

  async function checkUserId() {
    const u = userId.toLowerCase().trim();
    if (!u || u.length < 3) return;
    const taken = await clubsApi.isUsernameTaken(u);
    setUserIdOk(!taken);
    if (taken) setError("That User ID is already taken — choose another");
    else setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const u = userId.toLowerCase().trim();
    if (u.length < 3)                    { setError("User ID must be at least 3 characters"); return; }
    if (!/^[a-z0-9_-]+$/.test(u))       { setError("User ID can only contain letters, numbers, _ and -"); return; }
    if (!displayName.trim())             { setError("Display name is required"); return; }
    if (password !== confirm)            { setError("Passwords don't match"); return; }
    if (password.length < 6)            { setError("Password must be at least 6 characters"); return; }

    setLoading(true);
    try {
      const taken = await clubsApi.isUsernameTaken(u);
      if (taken) { setError("That User ID is already taken — choose another"); return; }

      // All accounts use a synthetic Supabase auth email so any real email
      // can be reused freely across different accounts.
      const authEmail = `${u}@baddyapp.internal`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: authEmail,
        password,
        options: {
          data: {
            username: u,
            display_name: displayName.trim(),
            account_type: accountType,
            real_email: email.trim(), // stored by the DB trigger into accounts.email
          },
        },
      });
      if (signUpError) throw signUpError;

      if (!data.user?.id) throw new Error("Signup succeeded but no user ID returned");

      useGroupStore.getState().setAppMode(isGroup ? "friends" : "club");

      if (data.session) {
        setAuth(data.session.access_token, u, displayName.trim(), "", email.trim());
      }
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
        <h1 className="font-display font-black text-white text-3xl tracking-tight">
          {isGroup ? "Badminton" : "Badminton Club"}
        </h1>
        <p className="text-orange-200 font-display font-semibold text-sm">
          {isGroup ? "Create your account" : "Create your club account"}
        </p>
      </div>

      <form onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-black text-gray-900 text-xl">Welcome! 🏸</h2>
          <p className="text-gray-500 text-sm font-display mt-0.5">
            {isGroup
              ? "Set up your account to create groups and invite friends."
              : "Each club gets their own private account."}
          </p>
        </div>

        <div className="flex flex-col gap-3">

          {/* User ID — unique login identifier */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">
              User ID <span className="text-gray-400 font-normal">(used to log in)</span>
            </label>
            <div className="relative">
              <input
                type="text" value={userId}
                onChange={(e) => { setUserId(e.target.value.toLowerCase()); setUserIdOk(null); setError(""); }}
                onBlur={checkUserId}
                placeholder={isGroup ? "e.g. jsmith" : "e.g. rivermead-badminton"}
                autoCapitalize="none" required
                className={`${inputCls} ${userIdOk === true ? "border-green-400" : userIdOk === false ? "border-red-400" : ""}`}
              />
              {userIdOk === true && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓ available</span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 font-display mt-1">
              Lowercase letters, numbers, _ and - only. Min 3 characters.
            </p>
          </div>

          {/* Display name */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">
              {isGroup ? "Display Name" : "Club Display Name"}{" "}
              <span className="text-gray-400 font-normal">(shown in the app)</span>
            </label>
            <input
              type="text" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={isGroup ? "e.g. Jane Smith" : "e.g. Rivermead Badminton Club"}
              required className={inputCls}
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">
              Email <span className="text-gray-400 font-normal">(for password reset)</span>
            </label>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required className={inputCls}
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Password</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters" required
                className={`${inputCls} pr-10`}
              />
              <button type="button" tabIndex={-1}
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password" required
                className={`${inputCls} pr-10`}
              />
              <button type="button" tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">
            {error}
          </div>
        )}

        <button type="submit"
          disabled={loading || !userId.trim() || !displayName.trim() || !email.trim() || !password || !confirm}
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
