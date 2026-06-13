import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, RefreshCw, ShieldAlert, Building2, Users } from "lucide-react";
import { useAuthStore } from "../store";
import { supabase } from "../lib/supabase";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

interface AccountRow {
  username: string;
  display_name: string;
  email: string;
  recovery_email?: string;
  user_id: string;
  account_type: "club" | "group" | "unknown";
  auth_created_at?: string;
}

const MASTER_USERNAME = "sakthi"; // must match server MASTER_USERNAME env var

async function apiFetch(path: string, opts?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Request failed");
  return json;
}

export default function MasterAdminView() {
  const navigate = useNavigate();
  const { username } = useAuthStore();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const isMaster = username === MASTER_USERNAME;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/admin/accounts");
      setAccounts(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isMaster) load(); }, [isMaster]);

  async function handleDelete(userId: string, uname: string) {
    if (!confirm(`Delete account "${uname}"? This permanently removes the user and all their data.`)) return;
    setDeleting(userId);
    try {
      await apiFetch(`/api/admin/accounts/${userId}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.user_id !== userId));
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  }

  if (!isMaster) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6"
        style={{ background: "linear-gradient(160deg, #1e1e2e 0%, #2d1b69 100%)" }}>
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-white font-display font-black text-xl">Access denied</p>
        <button onClick={() => navigate("/")}
          className="px-4 py-2 rounded-xl bg-white/10 text-white font-display font-bold text-sm">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #1e1e2e 0%, #2d1b69 100%)" }}>

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 rounded-xl p-2">
            <ShuttlecockIcon size={24} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-lg leading-tight">Master Admin</h1>
            <p className="text-white/50 text-xs font-display">All accounts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 transition-all disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => navigate("/")}
            className="px-3 py-2 rounded-xl bg-white/10 text-white/70 font-display font-bold text-xs hover:bg-white/20 transition-all">
            ← Back
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto">
        {error && (
          <div className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 text-red-300 font-display font-bold text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center mt-20">
            <div className="w-9 h-9 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-white/40 text-center mt-20 font-display">No accounts found.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-white/40 text-xs font-display mb-2">{accounts.length} account{accounts.length !== 1 ? "s" : ""}</p>
            {accounts.map((a) => (
              <div key={a.user_id}
                className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-4 flex items-center gap-4">

                {/* Type icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                  ${a.account_type === "club" ? "bg-orange-500/20" : "bg-purple-500/20"}`}>
                  {a.account_type === "club"
                    ? <Building2 size={18} className="text-orange-400" />
                    : <Users size={18} className="text-purple-400" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-black text-white text-sm">{a.username}</span>
                    <span className={`text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md
                      ${a.account_type === "club" ? "bg-orange-500/20 text-orange-300" : "bg-purple-500/20 text-purple-300"}`}>
                      {a.account_type}
                    </span>
                  </div>
                  {a.display_name && a.display_name !== a.username && (
                    <p className="text-white/60 text-xs font-display truncate">{a.display_name}</p>
                  )}
                  <p className="text-white/30 text-xs font-mono truncate">
                    {a.email?.endsWith("@baddyapp.internal") ? (
                      <>
                        <span className="line-through opacity-50">{a.email}</span>
                        {a.recovery_email && <span className="ml-1 text-white/50 no-underline">→ {a.recovery_email}</span>}
                      </>
                    ) : a.email}
                  </p>
                  {a.auth_created_at && (
                    <p className="text-white/20 text-[10px] font-display mt-0.5">
                      Created {new Date(a.auth_created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(a.user_id, a.username)}
                  disabled={deleting === a.user_id || a.username === MASTER_USERNAME}
                  title={a.username === MASTER_USERNAME ? "Cannot delete master account" : "Delete account"}
                  className="p-2 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20 flex-shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
