import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Link2, Check, Play, Users } from "lucide-react";
import { useGroupStore, useSessionStore, useMemberStore } from "../store";
import { groupsApi } from "../services/groups";
import type { MemberType, Member, Session } from "../types";
import { v4 as uuid } from "uuid";

const TYPE_DOT: Record<MemberType, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  guest: "bg-purple-500",
};

const isGuest = () => localStorage.getItem("friends-guest") === "true";

export default function GroupDetailView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { groups, addGroupMember, removeGroupMember, deleteGroup, upsertGroup, setGroups } = useGroupStore();
  const { setSession, setCourts } = useSessionStore();
  const { setMembers } = useMemberStore();

  const group = groups.find((g) => g.id === id);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<MemberType>("male");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(!isGuest() && !group);
  const [busy, setBusy] = useState(false);

  // Account users: pull the latest group + members from Supabase.
  useEffect(() => {
    if (isGuest() || !id) return;
    groupsApi.get(id)
      .then((g) => { if (g) upsertGroup(g); })
      .catch((e) => console.error("Failed to load group:", e))
      .finally(() => setLoading(false));
  }, [id]);

  // For accounts, re-fetch after a write so the list stays in sync with the DB.
  async function refresh() {
    if (isGuest() || !id) return;
    const g = await groupsApi.get(id);
    if (g) upsertGroup(g);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, rgb(var(--p-900)), rgb(var(--p-600)))" }}>
        <div className="w-9 h-9 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6"
        style={{ background: "linear-gradient(135deg, rgb(var(--p-900)), rgb(var(--p-600)))" }}>
        <p className="text-white font-display font-black text-xl">Group not found</p>
        <button onClick={() => navigate("/groups")} className="px-4 py-2 rounded-xl bg-white text-purple-600 font-display font-bold">
          Back to groups
        </button>
      </div>
    );
  }

  const inviteLink = `${window.location.origin}/groups/join/${group.invite_token}`;

  function copyInvite() {
    navigator.clipboard?.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function handleAdd() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      if (isGuest()) {
        addGroupMember(group!.id, newName, newType);
      } else {
        await groupsApi.addMember(group!.id, newName, newType);
        await refresh();
      }
      setNewName("");
    } catch (e: any) {
      alert(`Couldn't add member: ${e?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (isGuest()) { removeGroupMember(group!.id, memberId); return; }
    try {
      await groupsApi.removeMember(memberId);
      await refresh();
    } catch (e: any) {
      alert(`Couldn't remove member: ${e?.message ?? "unknown error"}`);
    }
  }

  async function handleDeleteGroup() {
    if (!confirm(`Delete "${group!.name}"? This can't be undone.`)) return;
    if (isGuest()) { deleteGroup(group!.id); navigate("/groups"); return; }
    try {
      await groupsApi.remove(group!.id);
      setGroups(useGroupStore.getState().groups.filter((g) => g.id !== group!.id));
      navigate("/groups");
    } catch (e: any) {
      alert(`Couldn't delete group: ${e?.message ?? "unknown error"}`);
    }
  }

  function handleStartSession() {
    const g = group!;
    // Hydrate the local engine with this group's members…
    const members: Member[] = g.members.map((m) => ({
      id: m.id,
      name: m.name,
      member_type: m.member_type,
      email: "",
      created_at: m.created_at,
    }));
    setMembers(members);

    // …and open a local, group-scoped session (routed to the local engine via group_id).
    const session: Session = {
      id: uuid(),
      club_name: g.name,
      num_courts: g.num_courts,
      date: new Date().toISOString().split("T")[0],
      status: "active",
      group_id: g.id,
      created_at: new Date().toISOString(),
    };
    setSession(session);
    setCourts(Array.from({ length: g.num_courts }, (_, i) => ({ id: i + 1, status: "idle" as const })));
    navigate("/");
  }

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)" }}>

      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-4 flex-shrink-0">
        <button onClick={() => navigate("/groups")} className="p-2 rounded-xl bg-white/15 border border-white/20 text-white">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-black text-white text-lg leading-tight truncate">{group.name}</h1>
          <p className="text-orange-200 text-xs font-display">
            {group.members.length} members · {group.num_courts} court{group.num_courts > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={handleDeleteGroup}
          className="p-2 rounded-xl bg-white/10 border border-white/20 text-white/70"
          title="Delete group"
        >
          <Trash2 size={16} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-28 max-w-xl w-full mx-auto flex flex-col gap-4">
        {/* Invite link */}
        <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={15} className="text-white" />
            <span className="text-white font-display font-bold text-sm">Invite link</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/20 rounded-xl px-3 py-2 text-orange-100 text-xs font-mono truncate">{inviteLink}</div>
            <button onClick={copyInvite}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-purple-600 font-display font-bold text-xs active:scale-95 transition-all">
              {copied ? <><Check size={14} /> Copied</> : <>Copy</>}
            </button>
          </div>
        </div>

        {/* Members */}
        <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-purple-600" />
            <span className="font-display font-black text-gray-900 text-base">Members</span>
            <span className="ml-auto text-xs font-display font-bold text-gray-400">{group.members.length}</span>
          </div>

          {/* Add row */}
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="Add a friend…"
                className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 font-display font-bold text-gray-900 text-sm focus:outline-none focus:border-purple-400 transition-colors"
              />
              <button onClick={handleAdd} disabled={!newName.trim()}
                className="px-3 rounded-xl bg-purple-600 text-white disabled:opacity-40 active:scale-95 transition-all">
                <Plus size={18} />
              </button>
            </div>
            <div className="flex gap-1.5">
              {(["male", "female", "guest"] as MemberType[]).map((t) => (
                <button key={t} onClick={() => setNewType(t)}
                  className={`flex-1 h-8 rounded-lg font-display font-bold text-xs capitalize transition-all border-2 flex items-center justify-center gap-1.5
                    ${newType === t ? "border-purple-400 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500"}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${TYPE_DOT[t]}`} /> {t}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {group.members.length === 0 ? (
            <p className="text-gray-400 text-sm font-display text-center py-4">No members yet — add your friends above.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {group.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-1.5">
                  <span className={`w-8 h-8 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-sm`}>
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 font-display font-bold text-gray-800 text-sm truncate">{m.name}</span>
                  <button onClick={() => handleRemoveMember(m.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Start session */}
      <div className="fixed bottom-0 left-0 right-0 p-4 max-w-xl mx-auto">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleStartSession}
          disabled={group.members.length < 4}
          className="w-full py-4 rounded-2xl font-display font-black text-white text-base bg-gradient-to-r from-purple-600 to-purple-500 disabled:opacity-50 active:scale-95 transition-all shadow-2xl shadow-purple-500/30 flex items-center justify-center gap-2"
        >
          <Play size={20} />
          {group.members.length < 4 ? "Add at least 4 to start" : "Start a Session"}
        </motion.button>
      </div>
    </div>
  );
}
