import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { membersApi, queueApi, matchesApi } from "../../services/api";
import { useMemberStore, useQueueStore, useSessionStore, useMatchStore } from "../../store";
import Avatar from "../shared/Avatar";
import { UserPlus, UserMinus, Search, UserCheck, X, Play } from "lucide-react";

export default function CheckInPanel() {
  const { members, addMember } = useMemberStore();
  const { queue, setQueue, picker, closePicker, setPickerId, togglePick, removeFromQueue, activeMemberIds, setActiveMemberIds, openPicker } = useQueueStore();
  const { session, updateCourtStatus, courts } = useSessionStore();
  const { addMatch } = useMatchStore();

  const [search, setSearch] = useState("");
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const isPicking = picker.isOpen;
  const queuedIds = new Set(queue.map((q) => q.member_id));

  // Full sorted queue (all queued players, including on-court — used in picking mode)
  const sortedQueue = [...queue].sort((a, b) => a.position - b.position);

  // Queue visible in normal mode — exclude players currently on court
  const visibleQueue = sortedQueue.filter((q) => !activeMemberIds.has(q.member_id));

  // First eligible player (not on court) — auto-picker
  const firstInQueue = sortedQueue.find((q) => !activeMemberIds.has(q.member_id) && members[q.member_id]);
  const firstMember = firstInQueue ? members[firstInQueue.member_id] : null;
  const freeCourt = courts.find((c) => c.status === "idle");
  const readyToGo = !!firstMember && !!freeCourt &&
    sortedQueue.filter((q) => !activeMemberIds.has(q.member_id)).length >= 4;

  const allMembers = Object.values(members)
    .filter((m) => !activeMemberIds.has(m.id))
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const roster = [
    // Everyone checked in (members + guests) sorted by queue position
    ...allMembers
      .filter((m) => queuedIds.has(m.id))
      .sort((a, b) => {
        const posA = queue.find((q) => q.member_id === a.id)?.position ?? 999;
        const posB = queue.find((q) => q.member_id === b.id)?.position ?? 999;
        return posA - posB;
      }),
    // Non-guest members not yet checked in: alphabetical
    ...allMembers
      .filter((m) => !queuedIds.has(m.id) && m.member_type !== "guest")
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];

  // Members currently on a court (playing)
  const onCourtMembers = !isPicking
    ? Object.values(members).filter((m) => activeMemberIds.has(m.id))
    : [];

  // Guests currently checked in tonight
  const guestsInQueue = queue
    .filter((q) => members[q.member_id]?.member_type === "guest")
    .map((q) => ({ ...q, member: members[q.member_id] }))
    .filter((q) => q.member);

  async function toggleCheckIn(memberId: string) {
    if (!session) return;
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
      setShowGuestForm(false);
    } finally {
      setAddingGuest(false);
    }
  }

  async function handleStartMatch() {
    if (!picker.picker_id || picker.picked.length !== 3 || !picker.target_court || !session) return;
    setConfirming(true);
    try {
      const [p1, p2] = [picker.picker_id, picker.picked[0]];
      const [p3, p4] = [picker.picked[1], picker.picked[2]];
      const allFour = [p1, p2, p3, p4];

      const { match } = await matchesApi.start(session.id, {
        court_id: picker.target_court,
        team_a: [p1, p2],
        team_b: [p3, p4],
      });

      addMatch(match);
      updateCourtStatus(picker.target_court, "playing", match.id);
      allFour.forEach(removeFromQueue);
      setActiveMemberIds(new Set([...activeMemberIds, ...allFour]));
      closePicker();
    } finally {
      setConfirming(false);
    }
  }

  function handlePass() {
    const currentIdx = sortedQueue.findIndex((q) => q.member_id === picker.picker_id);
    const eligible = sortedQueue.filter((q) => !activeMemberIds.has(q.member_id) && members[q.member_id]);
    // Find the next eligible player after the current picker
    const next =
      eligible.find((q, _, arr) => {
        const idx = sortedQueue.findIndex((s) => s.member_id === q.member_id);
        return idx > currentIdx && q.member_id !== picker.picker_id;
      }) ??
      // Wrap around: pick first eligible who isn't the current picker
      eligible.find((q) => q.member_id !== picker.picker_id);
    if (next) setPickerId(next.member_id);
  }

  function handleGo(pickerId: string) {
    // Find the first free court
    const freeCourt = courts.find((c) => c.status === "idle");
    if (!freeCourt) { alert("No free courts right now!"); return; }

    const candidates = [...queue]
      .filter((q) => !activeMemberIds.has(q.member_id) && members[q.member_id])
      .sort((a, b) => a.position - b.position);

    if (candidates.length < 4) {
      alert(`Need at least 4 players in the queue (have ${candidates.length}).`);
      return;
    }

    openPicker(pickerId, candidates.filter((q) => q.member_id !== pickerId), freeCourt.id);

  }

  function queuePos(memberId: string) {
    return queue.find((q) => q.member_id === memberId)?.position ?? null;
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  // ── PICKING MODE ──────────────────────────────────────────────────────────────
  if (isPicking) {
    const hasPicker = !!picker.picker_id;
    const pickerMember = hasPicker ? members[picker.picker_id!] : null;
    const picked = picker.picked;
    const canStart = hasPicker && picked.length === 3;

    return (
      <div className="flex flex-col gap-3 flex-1 min-h-0">

        {/* Header */}
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between bg-orange-500">
          <div>
            <div className="text-white font-display font-black text-sm">
              Court {picker.target_court} — Pick 3 Players
            </div>
            <div className="text-white/80 text-xs font-display font-semibold mt-0.5">
              {pickerMember ? `${pickerMember.name.split(" ")[0]} is picking · ${picked.length}/3 selected` : `${picked.length}/3 selected`}
            </div>
          </div>
          <button
            onClick={closePicker}
            className="p-1.5 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Picker identity card */}
        {pickerMember && (
          <div className="flex items-center gap-3 bg-orange-50 border-2 border-orange-300 rounded-2xl px-3 py-2.5">
            <Avatar name={pickerMember.name} memberType={pickerMember.member_type} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="font-display font-black text-sm text-orange-800 truncate">
                👑 {pickerMember.name}
              </div>
              <div className="text-xs text-orange-500 font-display">Picking the team</div>
            </div>
            <button
              onClick={handlePass}
              className="text-xs border border-orange-300 text-orange-600 px-2.5 py-1 rounded-lg
                         font-display font-bold hover:bg-orange-100 active:scale-95 transition-all"
            >
              Pass ↓
            </button>
          </div>
        )}

        {/* Progress dots */}
        <div className="flex gap-2 px-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-all duration-300
                ${i < picked.length ? "bg-orange-500" : "bg-gray-200"}`}
            />
          ))}
        </div>

        {/* Queue list — scrollable */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 scroll-smooth">
          {sortedQueue.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No players in queue</p>
          ) : (
            sortedQueue.map((q, idx) => {
              const member = members[q.member_id];
              if (!member) return null;

              // Hide the picker from the selectable list — they're shown in the card above
              const isThisPicker = q.member_id === picker.picker_id;
              if (isThisPicker) return null;
              const isSelected = picked.includes(q.member_id);
              const canSelect = isSelected || picked.length < 3;

              return (
                <motion.div
                  key={q.member_id}
                  layout
                  onClick={() => canSelect && togglePick(q.member_id)}
                  className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all
                    ${isSelected
                      ? "bg-orange-500 border-orange-400 cursor-pointer"
                      : canSelect
                        ? "bg-white border-gray-200 hover:border-orange-300 cursor-pointer"
                        : "bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed"
                    }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                    font-display font-black text-xs
                    ${isSelected ? "bg-white/30 text-white" : "bg-gray-100 text-gray-500"}`}
                  >
                    {idx + 1}
                  </div>
                  <Avatar name={member.name} memberType={member.member_type} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className={`font-display font-bold text-sm truncate ${isSelected ? "text-white" : "text-gray-900"}`}>
                      {member.name}
                    </div>
                    <div className={`text-xs font-display ${isSelected ? "text-orange-100" : "text-gray-400"}`}>
                      {formatTime(q.checked_in_at)}
                    </div>
                  </div>
                  {isSelected && <span className="text-white text-lg flex-shrink-0">✓</span>}
                </motion.div>
              );
            })
          )}
        </div>

        {/* Start Match button — sticky so it's always visible with long queues */}
        <div className="sticky bottom-0 pt-2 pb-1 bg-white/90 backdrop-blur-sm">
          <button
            onClick={handleStartMatch}
            disabled={!canStart || confirming}
            className={`w-full py-3.5 rounded-2xl font-display font-black text-base flex items-center justify-center gap-2
              transition-all active:scale-95
              ${canStart && !confirming
                ? "bg-gradient-to-r from-green-500 to-green-400 text-white shadow-lg shadow-green-500/30 hover:from-green-600 hover:to-green-500"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
          >
            {confirming ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Starting…
              </>
            ) : (
              <>
                <Play size={16} />
                {canStart ? "Start Match 🏸" : `Pick ${3 - picked.length} more player${3 - picked.length !== 1 ? "s" : ""}…`}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── NORMAL CHECK-IN MODE ──────────────────────────────────────────────────────
  const checkedInCount = queue.length;
  const onCourtCount = activeMemberIds.size;
  const total = checkedInCount + onCourtCount;

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">

      {/* Stats — In Queue / On Court / Total */}
      <div className="flex gap-2 flex-shrink-0">
        {[
          { label: "In Queue", value: checkedInCount, color: "text-gray-800" },
          { label: "On Court", value: onCourtCount,   color: "text-green-600" },
          { label: "Total",    value: total,           color: "text-orange-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex-1 rounded-2xl bg-gray-50 border border-gray-100 px-2 py-2 text-center">
            <div className={`text-2xl font-display font-black ${color}`}>{value}</div>
            <div className="text-[10px] text-gray-400 font-display font-bold leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* "Pick your team" banner */}
      {readyToGo && firstMember && freeCourt && (
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl overflow-hidden shadow-lg shadow-orange-500/25"
          style={{ background: "linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)" }}
        >
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-lg">🔥</span>
              <span className="text-white/80 text-[10px] font-display font-black uppercase tracking-widest">
                Court {freeCourt.id} is free!
              </span>
            </div>
            <div className="text-white font-display font-black text-xl leading-tight">
              {firstMember.name.split(" ")[0]}, pick your team!
            </div>
            <div className="text-orange-100 text-xs font-display font-semibold mt-0.5 mb-3">
              ⚡ You're up — choose 3 legends to smash with
            </div>
            <button
              onClick={() => handleGo(firstMember.id)}
              className="w-full py-2.5 rounded-xl bg-white text-orange-600 font-display font-black text-sm
                         hover:bg-orange-50 active:scale-95 transition-all shadow-sm mb-3"
            >
              🏸 Let's Go!
            </button>
          </div>
        </motion.div>
      )}

      {/* Queue list — scrollable, shows who's next to play (excludes on-court players) */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
        {visibleQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-40">
            <span className="text-3xl">🏸</span>
            <p className="text-gray-500 font-display font-bold text-sm">No one checked in yet</p>
          </div>
        ) : (
          visibleQueue.map((q, idx) => {
            const member = members[q.member_id];
            if (!member) return null;
            const isFirst = idx === 0;

            return (
              <div key={q.member_id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors
                  ${isFirst
                    ? "bg-orange-50 border-orange-200"
                    : member.member_type === "female"
                      ? "bg-pink-50 border-pink-100"
                      : member.member_type === "guest"
                        ? "bg-purple-50 border-purple-100"
                        : "bg-sky-50 border-sky-100"
                  }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-display font-black text-xs flex-shrink-0
                  ${isFirst ? "bg-orange-400 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {idx + 1}
                </div>
                <Avatar name={member.name} memberType={member.member_type} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-sm text-gray-900 truncate leading-tight">{member.name}</div>
                  <div className="text-[10px] text-gray-400 font-display">
                    {formatTime(q.checked_in_at)}
                    {member.member_type === "guest" && <span className="ml-1 text-purple-400 font-black">GUEST</span>}
                  </div>
                </div>
                <button
                  onClick={() => toggleCheckIn(member.id)}
                  disabled={loadingId === member.id}
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Remove from queue"
                >
                  <UserMinus size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
