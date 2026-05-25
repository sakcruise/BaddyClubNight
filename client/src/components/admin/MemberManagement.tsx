import { useState, useEffect } from "react";
import { membersApi } from "../../services/api";
import { useMemberStore } from "../../store";
import Avatar from "../shared/Avatar";
import { UserPlus, Trash2, Check, X, Pencil } from "lucide-react";
import type { MemberType } from "../../types";

const TYPE_OPTIONS: { value: MemberType; label: string; color: string }[] = [
  { value: "male",   label: "♂ Male",   color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "female", label: "♀ Female", color: "bg-pink-100 text-pink-700 border-pink-300" },
];

export default function MemberManagement() {
  const { members, setMembers, addMember, updateMember, deleteMember } = useMemberStore();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<MemberType>("male");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<MemberType>("male");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    membersApi.list().then((res) => setMembers(res.members));
  }, [setMembers]);

  // Only show permanent members (not guests)
  const roster = Object.values(members)
    .filter((m) => m.member_type !== "guest")
    .sort((a, b) => a.name.localeCompare(b.name));

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const { member } = await membersApi.create(newName.trim(), newType);
      addMember(member);
      setNewName("");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(id: string, name: string, type: MemberType) {
    setEditingId(id);
    setEditName(name);
    setEditType(type);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    await membersApi.update(id, { name: editName.trim(), member_type: editType });
    updateMember(id, { name: editName.trim(), member_type: editType });
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await membersApi.delete(id);
      deleteMember(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-black text-brand-900">
          Club Roster
        </h2>
        <span className="bg-orange-100 text-orange-700 text-xs font-display font-bold px-3 py-1 rounded-full">
          {roster.length} members
        </span>
      </div>

      {/* Add member */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col gap-3">
        <p className="text-xs font-display font-bold text-orange-700 uppercase tracking-wider">Add Member</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Full name…"
            className="flex-1 border-2 border-orange-200 rounded-xl px-3 py-2.5 font-body text-sm
                       focus:outline-none focus:border-orange-400 bg-white"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || adding}
            className="bg-orange-500 text-white px-4 rounded-xl font-display font-bold text-sm
                       hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1"
          >
            <UserPlus size={15} />
            {adding ? "…" : "Add"}
          </button>
        </div>
        {/* Type selector */}
        <div className="flex gap-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setNewType(opt.value)}
              className={`flex-1 py-2 rounded-xl border-2 text-xs font-display font-bold transition-all
                ${newType === opt.value ? opt.color + " border-current" : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {roster.map((member) => {
          const isEditing = editingId === member.id;
          const isDeleting = deletingId === member.id;

          return (
            <div
              key={member.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              {isEditing ? (
                /* Edit mode */
                <div className="p-3 flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(member.id)}
                    className="border-2 border-orange-300 rounded-xl px-3 py-2 font-body text-sm
                               focus:outline-none focus:border-orange-500 w-full"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    {TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setEditType(opt.value)}
                        className={`flex-1 py-1.5 rounded-xl border-2 text-xs font-display font-bold transition-all
                          ${editType === opt.value ? opt.color + " border-current" : "bg-gray-50 text-gray-400 border-gray-200"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      onClick={() => saveEdit(member.id)}
                      className="px-3 py-1.5 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 active:scale-95"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-500 text-xs font-bold hover:bg-gray-200 active:scale-95"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="flex items-center gap-3 p-3">
                  <Avatar name={member.name} memberType={member.member_type} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-sm text-gray-900 truncate">
                      {member.name}
                    </div>
                    <div className={`text-xs font-display font-semibold
                      ${member.member_type === "female" ? "text-pink-500" : "text-blue-500"}`}>
                      {member.member_type === "female" ? "♀ Female" : "♂ Male"}
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(member.id, member.name, member.member_type)}
                    className="p-2 rounded-xl text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(member.id)}
                    disabled={isDeleting}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {roster.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-4xl">🏸</span>
            <p className="text-gray-400 font-display font-bold text-sm">No members yet — add some above!</p>
          </div>
        )}
      </div>
    </div>
  );
}
