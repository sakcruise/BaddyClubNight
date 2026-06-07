import { useState } from "react";
import { supabase } from "../lib/supabase";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

export default function LoginView() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      // AuthGuard's onAuthStateChange fires → transitions to "ok" automatically
    } catch (err: any) {
      setError(err.message ?? "Login failed");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(160deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 80%, rgb(var(--p-500)) 100%)" }}>
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="bg-white/15 rounded-3xl p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
          <ShuttlecockIcon size={56} />
        </div>
        <h1 className="font-display font-black text-white text-3xl tracking-tight">Badminton Club</h1>
        <p className="text-orange-200 font-display font-semibold text-sm">Club Night Manager</p>
      </div>

      <form onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display font-black text-gray-900 text-xl">Sign In 👋</h2>
          <p className="text-gray-500 text-sm font-display mt-0.5">Enter your club email and password.</p>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus required
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm
                         focus:outline-none focus:border-orange-400 transition-colors" />
          </div>
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password" required
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm
                         focus:outline-none focus:border-orange-400 transition-colors" />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading || !email.trim() || !password}
          className="w-full py-3 rounded-2xl font-display font-black text-white text-base
                     bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600
                     disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-orange-500/30">
          {loading ? "Signing in…" : "Sign In 🏸"}
        </button>

        <p className="text-center text-xs text-gray-400 font-display">
          Contact your club admin to get access.
        </p>
      </form>
    </div>
  );
}
