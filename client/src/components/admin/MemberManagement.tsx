import { useState, useEffect } from "react";
import { membersApi, syncApi } from "../../services/api";
import { useMemberStore } from "../../store";
import Avatar from "../shared/Avatar";
import { UserPlus, Archive, Check, X, Pencil, CloudDownload, RotateCcw, Search } from "lucide-react";
import type { MemberType } from "../../types";
import { LEVEL_LABELS, LEVELS } from "../../types";

const TYPE_OPTIONS: { value: MemberType; label: string; color: string }[] = [
  { value: "male",   label: "♂ Male",   color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "female", label: "♀ Female", color: "bg-pink-100 text-pink-700 border-pink-300" },
];

const LEVEL_OPTIONS = LEVELS;
const LEVEL_COLORS: Record<number, string> = {
  1: "bg-gray-100 text-gray-600 border-gray-300",
  2: "bg-green-100 text-green-700 border-green-300",
  3: "bg-blue-100 text-blue-700 border-blue-300",
  4: "bg-violet-100 text-violet-700 border-violet-300",
  5: "bg-orange-100 text-orange-700 border-orange-300",
  6: "bg-red-100 text-red-700 border-red-300",
};

export default function MemberManagement() {
  const { members, setMembers, addMember, updateMember } = useMemberStore();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<MemberType>("male");
  const [newLevel, setNewLevel] = useState(2);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<MemberType>("male");
  const [editLevel, setEditLevel] = useState(2);
  const [editRank, setEditRank] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  useEffect(() => {
    membersApi.list().then((res) => {
      // list() excludes guests; keep any already in the store so tonight's checked-in guests still resolve.
      const guests = Object.values(useMemberStore.getState().members).filter((m) => m.member_type === "guest");
      setMembers([...res.members, ...guests]);
    });
  }, [setMembers]);

  async function handleImport() {
    setImporting(true);
    setImportMsg("");
    try {
      const { imported } = await syncApi.pullMembers();
      const res = await membersApi.list();
      setMembers(res.members);
      setImportMsg(`✓ Imported ${imported} members from cloud`);
    } catch {
      setImportMsg("⚠ Import failed — check Supabase config");
    } finally {
      setImporting(false);
    }
  }

  // Only show permanent, active members (not guests, not archived)
  const roster = Object.values(members)
    .filter((m) => m.member_type !== "guest" && m.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
  const archived = Object.values(members)
    .filter((m) => m.member_type !== "guest" && m.active === false)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Filters / sort for the list
  const [query, setQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | MemberType>("all");
  const [levelFilter, setLevelFilter] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "rank" | "level">("name");
  const toggleLevelFilter = (lvl: number) =>
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  const visible = roster
    .filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()))
    .filter((m) => genderFilter === "all" || m.member_type === genderFilter)
    .filter((m) => levelFilter.size === 0 || levelFilter.has(m.level ?? 2))
    .sort((a, b) => {
      if (sortBy === "rank") return (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name);
      if (sortBy === "level") return (b.level ?? 2) - (a.level ?? 2) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  const filtersActive = !!query || genderFilter !== "all" || levelFilter.size > 0;

  // Members can't be hard-deleted once they've played (matches reference them), so
  // "remove" archives: hidden from every roster, still named in old results.
  async function handleArchive(id: string, active: boolean) {
    setDeletingId(id);
    try {
      await membersApi.update(id, { active });
      updateMember(id, { active });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const { member } = await membersApi.create(newName.trim(), newType, undefined, newLevel);
      addMember(member);
      setNewName("");
      setNewLevel(2);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(id: string, name: string, type: MemberType, level: number, rank: number | null | undefined) {
    setEditingId(id);
    setEditName(name);
    setEditType(type);
    setEditLevel(level);
    setEditRank(rank == null ? "" : String(rank));
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const rank = editRank.trim() === "" ? null : Math.max(1, parseInt(editRank, 10) || 1);
    const patch = { name: editName.trim(), member_type: editType, level: editLevel };
    await membersApi.update(id, patch);
    updateMember(id, patch);
    if ((members[id]?.rank ?? null) !== rank) {
      // Re-sequence the whole club order so nobody shares a rank.
      const { changes } = await membersApi.setRank(id, rank);
      changes.forEach((c) => updateMember(c.id, { rank: c.rank }));
    }
    setEditingId(null);
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

      {/* Import from cloud */}
      {roster.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-sm font-display font-bold text-blue-800">Your member roster is empty</p>
          <p className="text-xs text-blue-600 font-display">Import your existing members from Supabase to get started.</p>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm
                       font-display font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 self-start"
          >
            <CloudDownload size={14} />
            {importing ? "Importing…" : "Import from Cloud"}
          </button>
          {importMsg && <p className="text-xs font-display font-bold text-blue-700">{importMsg}</p>}
        </div>
      )}

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
        {/* Level selector */}
        <div>
          <p className="text-[10px] font-display font-bold text-orange-600 uppercase tracking-wider mb-1.5">Skill Level</p>
          <div className="flex gap-1.5">
            {LEVEL_OPTIONS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setNewLevel(lvl)}
                title={LEVEL_LABELS[lvl]}
                className={`flex-1 py-1.5 rounded-xl border-2 text-xs font-display font-bold transition-all
                  ${newLevel === lvl ? LEVEL_COLORS[lvl] + " border-current" : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}
              >
                L{lvl}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 font-display mt-1 text-center">{LEVEL_LABELS[newLevel]}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names…"
              className="w-full pl-8 pr-8 py-2 rounded-xl border-2 border-gray-200 text-sm font-body focus:outline-none focus:border-orange-400"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400" aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border-2 border-gray-200 text-xs font-display font-bold px-2 bg-white focus:outline-none focus:border-orange-400"
            aria-label="Sort by"
          >
            <option value="name">A–Z</option>
            <option value="rank">By rank</option>
            <option value="level">By level</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: "all", label: "All" },
            { key: "male", label: "♂ Male" },
            { key: "female", label: "♀ Female" },
          ] as const).map((g) => (
            <button
              key={g.key}
              onClick={() => setGenderFilter(g.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-display font-bold border-2 transition-colors
                ${genderFilter === g.key ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-200 text-gray-500"}`}
            >
              {g.label}
            </button>
          ))}
          <span className="w-px h-5 bg-gray-200 mx-1" />
          {LEVEL_OPTIONS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => toggleLevelFilter(lvl)}
              title={LEVEL_LABELS[lvl]}
              className={`px-2 py-1 rounded-lg text-xs font-display font-bold border-2 transition-colors
                ${levelFilter.has(lvl) ? LEVEL_COLORS[lvl] + " border-current" : "bg-white border-gray-200 text-gray-400"}`}
            >
              L{lvl}
            </button>
          ))}
          {filtersActive && (
            <button
              onClick={() => { setQuery(""); setGenderFilter("all"); setLevelFilter(new Set()); }}
              className="ml-auto text-xs font-display font-bold text-orange-600"
            >
              Clear
            </button>
          )}
        </div>
        {filtersActive && (
          <p className="text-[11px] font-body text-gray-400">Showing {visible.length} of {roster.length}</p>
        )}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y space-y-2 pr-1 min-h-0">
        {visible.length === 0 && roster.length > 0 && (
          <p className="text-sm font-body text-gray-400 text-center py-6">No members match these filters.</p>
        )}
        {visible.map((member) => {
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
                  </div>
                  {/* Level selector in edit mode */}
                  <div>
                    <p className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider mb-1">Skill Level</p>
                    <div className="flex gap-1">
                      {LEVEL_OPTIONS.map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setEditLevel(lvl)}
                          title={LEVEL_LABELS[lvl]}
                          className={`flex-1 py-1 rounded-lg border-2 text-xs font-display font-bold transition-all
                            ${editLevel === lvl ? LEVEL_COLORS[lvl] + " border-current" : "bg-gray-50 text-gray-400 border-gray-200"}`}
                        >
                          L{lvl}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 font-display mt-0.5 text-center">{LEVEL_LABELS[editLevel]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider mb-1">Club rank</p>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={editRank}
                        onChange={(e) => setEditRank(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(member.id)}
                        placeholder="Unranked"
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-1.5 font-body text-sm tabular-nums focus:outline-none focus:border-orange-400"
                      />
                    </div>
                    <p className="flex-1 text-[10px] font-body text-gray-400 leading-snug">1 = strongest. Breaks ties between players on the same level when drafting.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(member.id)}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 active:scale-95 flex items-center justify-center gap-1"
                    >
                      <Check size={14} /> Save
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
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-xs font-display font-semibold
                        ${member.member_type === "female" ? "text-pink-500" : "text-blue-500"}`}>
                        {member.member_type === "female" ? "♀ Female" : "♂ Male"}
                      </span>
                      <span className={`text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border
                        ${LEVEL_COLORS[member.level ?? 2]}`}>
                        L{member.level ?? 2}
                      </span>
                      <span className={`text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border tabular-nums
                        ${member.rank != null ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-white text-gray-300 border-dashed border-gray-200"}`}>
                        {member.rank != null ? `#${member.rank}` : "unranked"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(member.id, member.name, member.member_type, member.level ?? 2, member.rank)}
                    className="p-2 rounded-xl text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleArchive(member.id, false)}
                    disabled={isDeleting}
                    title="Archive - remove from the roster, keep their results"
                    className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    <Archive size={14} />
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

        {archived.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-display font-bold text-gray-400 uppercase tracking-widest px-1">
              Archived ({archived.length})
            </summary>
            <div className="mt-2 flex flex-col gap-1">
              {archived.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 opacity-70">
                  <Avatar name={member.name} url={member.avatar_url} memberType={member.member_type} size="sm" />
                  <span className="flex-1 font-display font-bold text-gray-600 text-sm">{member.name}</span>
                  <button
                    onClick={() => handleArchive(member.id, true)}
                    disabled={deletingId === member.id}
                    className="flex items-center gap-1 text-xs font-display font-bold text-violet-600 px-2 py-1.5 rounded-lg hover:bg-violet-50 disabled:opacity-40"
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
