import { useState } from "react";
import { motion } from "framer-motion";
import { useMemberStore, useQueueStore, useSessionStore } from "../../store";
import { queueApi, membersApi } from "../../services/api";
import { UserPlus, Search } from "lucide-react";

export default function CheckInGrid() {
  const { members, addMember } = useMemberStore();
  const { queue, setQueue, activeMemberIds } = useQueueStore();
  const { session } = useSessionStore();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);
  const [search, setSearch] = useState("");

  const queuedIds = new Set(queue.map((q) => q.member_id));

  // All non-guest members sorted alphabetically, filtered by search
  const allMembers = Object.values(members)
    .filter((m) => m.member_type !== "guest")
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Guests checked in tonight
  const guests = Object.values(members).filter(
    (m) => m.member_type === "guest" && queuedIds.has(m.id)
  );

  async function toggle(memberId: string) {
    if (!session || loadingId) return;
    setLoadingId(memberId);
    try {
      if (queuedIds.has(memberId)) {
        const res = await queueApi.remove(session.id, memberId);
        setQueue(res.queue);
      } else {
        const res = await queueApi.checkIn(session.id, memberId);
        setQueue(res.queue);
      }
    } finally {
      setLoadingId(null);
    }
  }

  async function addGuest() {
    if (!guestName.trim() || !session) return;
    setAddingGuest(true);
    try {
      const { member } = await membersApi.create(guestName.trim(), "guest");
      addMember(member);
      const res = await queueApi.checkIn(session.id, member.id);
      setQueue(res.queue);
      setGuestName("");
      setShowGuestInput(false);
    } finally {
      setAddingGuest(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search + Guest button row */}
      <div className="flex gap-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs font-body
                       focus:outline-none focus:border-orange-400 bg-white"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">✕</button>
          )}
        </div>
        <button
          onClick={() => setShowGuestInput(!showGuestInput)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-display font-bold
                     text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors"
        >
          <UserPlus size={12} /> Guest
        </button>
      </div>

      {/* Guest input */}
      {showGuestInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGuest()}
            placeholder="Guest name…"
            autoFocus
            className="flex-1 border-2 border-purple-200 rounded-xl px-3 py-1.5 font-body text-sm
                       focus:outline-none focus:border-purple-400 bg-white"
          />
          <button
            onClick={addGuest}
            disabled={!guestName.trim() || addingGuest}
            className="bg-purple-500 text-white px-4 rounded-xl font-display font-bold text-sm
                       disabled:opacity-50 hover:bg-purple-600 active:scale-95 transition-all"
          >
            {addingGuest ? "…" : "Add"}
          </button>
          <button
            onClick={() => { setShowGuestInput(false); setGuestName(""); }}
            className="text-gray-400 px-2 rounded-xl hover:bg-gray-100 transition-colors text-sm"
          >✕</button>
        </div>
      )}

      {/* Member grid — 10 columns */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
        {allMembers.map((member) => {
          const checked = queuedIds.has(member.id);
          const onCourt = activeMemberIds.has(member.id);
          const loading = loadingId === member.id;

          return (
            <motion.button
              key={member.id}
              whileTap={{ scale: 0.93 }}
              onClick={() => !onCourt && toggle(member.id)}
              disabled={onCourt || !!loading}
              title={member.name}
              className={`relative py-2 px-1 rounded-xl text-[11px] font-display font-bold text-center
                transition-all leading-tight truncate
                ${onCourt
                  ? "bg-green-100 text-green-700 border-2 border-green-200 opacity-60 cursor-not-allowed"
                  : checked
                    ? member.member_type === "female"
                      ? "bg-pink-300 text-pink-900 border-2 border-pink-300 shadow-sm"
                      : "bg-sky-300 text-sky-900 border-2 border-sky-300 shadow-sm"
                    : "bg-gray-100 text-gray-500 border-2 border-transparent hover:border-gray-300 hover:bg-gray-200"
                }`}
            >
              {loading ? "…" : member.name.split(" ")[0]}
              {checked && !onCourt && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full
                                 flex items-center justify-center text-white text-[8px] font-black">✓</span>
              )}
            </motion.button>
          );
        })}

        {/* Guests tonight */}
        {guests.map((member) => (
          <motion.button
            key={member.id}
            whileTap={{ scale: 0.93 }}
            onClick={() => toggle(member.id)}
            disabled={!!loadingId}
            title={member.name + " (Guest)"}
            className="relative py-2 px-1 rounded-xl text-[11px] font-display font-bold text-center
                       transition-all leading-tight truncate
                       bg-purple-500 text-white border-2 border-purple-400 shadow-sm"
          >
            {member.name.split(" ")[0]}
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full
                             flex items-center justify-center text-white text-[8px] font-black">✓</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
