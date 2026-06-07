import { useState } from "react";
import { supabase } from "../lib/supabase";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

export default function ResetPasswordView() {
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      // AuthGuard's onAuthStateChange will fire and transition to "ok" automatically
    } catch (err: any) {
      setError(err.message ?? "Reset failed — try requesting a new link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(160deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 80%, rgb(var(--p-500)) 100%)" }}
    >
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="bg-white/15 rounded-3xl p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
          <ShuttlecockIcon size={56} />
        </div>
        <h1 className="font-display font-black text-white text-3xl tracking-tight">Badminton Club</h1>
        <p className="text-orange-200 font-display font-semibold text-sm">Club Night Manager</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">✓</div>
            <h2 className="font-display font-black text-gray-900 text-xl">Password updated!</h2>
            <p className="text-gray-500 text-sm font-display">You're now signed in. Taking you home…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <h2 className="font-display font-black text-gray-900 text-xl">Set new password 🔑</h2>
              <p className="text-gray-500 text-sm font-display mt-0.5">Choose a new password for your club account.</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-display font-bold text-gray-600 mb-1 block">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  autoFocus
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm
                             focus:outline-none focus:border-orange-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm
                             focus:outline-none focus:border-orange-400 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full py-3 rounded-2xl font-display font-black text-white text-base
                         bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600
                         disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-orange-500/30"
            >
              {loading ? "Updating…" : "Update Password 🔑"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
