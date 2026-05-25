import { useState } from "react";
import { authApi } from "../services/api";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

export default function SetupView({ onBack }: { onBack?: () => void }) {
  const [clubName, setClubName]   = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail]         = useState("");
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
      await authApi.register({ club_name: clubName.trim(), admin_name: adminName.trim(), email: email.trim(), password });
      setDone(true); // Supabase may require email confirmation
    } catch (err: any) {
      setError(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: "linear-gradient(160deg, #7c2d12 0%, #c2410c 40%, #ea580c 80%, #f59e0b 100%)" }}>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="font-display font-black text-gray-900 text-xl">Account Created!</h2>
          <p className="text-gray-500 text-sm font-display">
            Check your email <strong>{email}</strong> to confirm your account, then come back and sign in.
          </p>
          {onBack && (
            <button onClick={onBack}
              className="w-full py-3 rounded-2xl font-display font-black text-white
                         bg-gradient-to-r from-orange-600 to-orange-500 active:scale-95 transition-all">
              Back to Login
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(160deg, #7c2d12 0%, #c2410c 40%, #ea580c 80%, #f59e0b 100%)" }}>
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
          {[
            { label: "Club Name", value: clubName, set: setClubName, placeholder: "e.g. Smash Badminton Club", type: "text" },
            { label: "Your Name", value: adminName, set: setAdminName, placeholder: "e.g. Alex", type: "text" },
            { label: "Email",     value: email,     set: setEmail,     placeholder: "you@example.com", type: "email" },
            { label: "Password",  value: password,  set: setPassword,  placeholder: "Min. 6 characters", type: "password" },
            { label: "Confirm Password", value: confirm, set: setConfirm, placeholder: "Repeat password", type: "password" },
          ].map(({ label, value, set, placeholder, type }) => (
            <div key={label}>
              <label className="text-xs font-display font-bold text-gray-600 mb-1 block">{label}</label>
              <input type={type} value={value} onChange={(e) => set(e.target.value)}
                placeholder={placeholder} required
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-body text-sm
                           focus:outline-none focus:border-orange-400 transition-colors" />
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">{error}</div>
        )}

        <button type="submit"
          disabled={loading || !clubName.trim() || !adminName.trim() || !email.trim() || !password || !confirm}
          className="w-full py-3 rounded-2xl font-display font-black text-white text-base
                     bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600
                     disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-orange-500/30">
          {loading ? "Creating account…" : "Create Account 🚀"}
        </button>

        {onBack && (
          <div className="border-t border-gray-100 pt-3 text-center">
            <button type="button" onClick={onBack}
              className="text-xs text-gray-400 font-display font-bold hover:text-orange-500 transition-colors">
              ← Back to login
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
