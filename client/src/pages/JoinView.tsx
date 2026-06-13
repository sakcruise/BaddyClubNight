import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { groupsApi } from "../services/groups";
import { useGroupStore } from "../store";
import type { MemberType } from "../types";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

const TYPE_DOT: Record<MemberType, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  guest: "bg-purple-500",
};

/** Public page: a friend opens an invite link, enters their name, and joins. */
export default function JoinView() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ id: string; name: string; member_count: number } | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<MemberType>("male");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    groupsApi.getByInvite(token)
      .then(setPreview)
      .catch((e) => setError(e?.message ?? "Could not load invite"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleJoin() {
    if (!name.trim() || !token || joining) return;
    setJoining(true);
    setError("");
    try {
      const groupId = await groupsApi.join(token, name, type);
      // If the joiner is signed in, take them straight into the group.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        useGroupStore.getState().setAppMode("friends");
        navigate(`/groups/${groupId}`, { replace: true });
      } else {
        setJoined(true);
      }
    } catch (e: any) {
      setError(e?.message ?? "Couldn't join — try again");
    } finally {
      setJoining(false);
    }
  }

  const bg = "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="w-9 h-9 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ background: bg }}>
      <div className="flex flex-col items-center gap-3">
        <div className="bg-white/15 rounded-3xl p-4 backdrop-blur-sm border border-white/20 shadow-2xl">
          <ShuttlecockIcon size={48} />
        </div>
      </div>

      {!preview ? (
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center flex flex-col gap-3">
          <p className="font-display font-black text-gray-900 text-xl">Invite not found</p>
          <p className="text-gray-500 text-sm font-display">This invite link is invalid or has expired.</p>
        </div>
      ) : joined ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <Check size={28} className="text-green-600" />
          </div>
          <p className="font-display font-black text-gray-900 text-xl">You're in! 🏸</p>
          <p className="text-gray-500 text-sm font-display">
            You've joined <span className="font-bold text-gray-700">{preview.name}</span>. See you on court!
          </p>
        </motion.div>
      ) : (
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-purple-500 to-purple-400 flex items-center justify-center mb-2">
              <Users size={24} className="text-white" />
            </div>
            <h1 className="font-display font-black text-gray-900 text-xl">Join {preview.name}</h1>
            <p className="text-gray-500 text-sm font-display mt-0.5">
              {preview.member_count} {preview.member_count === 1 ? "member" : "members"} so far
            </p>
          </div>

          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1 block uppercase tracking-widest">Your Name</label>
            <input
              autoFocus type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="e.g. Arjun"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 font-display font-bold text-gray-900 focus:outline-none focus:border-purple-400 transition-colors"
            />
          </div>

          <div className="flex gap-1.5">
            {(["male", "female", "guest"] as MemberType[]).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 h-9 rounded-lg font-display font-bold text-xs capitalize transition-all border-2 flex items-center justify-center gap-1.5
                  ${type === t ? "border-purple-400 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500"}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${TYPE_DOT[t]}`} /> {t}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 font-display font-bold">{error}</div>
          )}

          <button onClick={handleJoin} disabled={!name.trim() || joining}
            className="w-full py-3 rounded-xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-purple-500/20">
            {joining ? "Joining…" : "Join Group"}
          </button>
        </div>
      )}
    </div>
  );
}
