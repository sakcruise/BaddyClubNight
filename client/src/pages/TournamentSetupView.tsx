import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMemberStore, useQueueStore } from "../store";
import { tournamentsApi } from "../services/tournaments";
import { queueApi, membersApi } from "../services/api";
import Avatar from "../components/shared/Avatar";
import Button from "../components/shared/Button";
import { LEVEL_LABELS } from "../types";
import { Trophy, ChevronLeft, Search, UserPlus, Check, UserCheck, X, PartyPopper } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

const LEVEL_DOT: Record<number, string> = {
  1: "bg-gray-400", 2: "bg-green-500", 3: "bg-blue-500", 4: "bg-violet-500", 5: "bg-orange-500", 6: "bg-red-500",
};

type Pairs = [string, string][][];

// Swaps whoever's in (groupIndex, pairIndex, slot) with newMemberId, searching
// every group (not just this one) — so a pair can be rebalanced across group
// boundaries, not just reshuffled within the same group.
function swapInto(pairsByGroup: Pairs, groupIndex: number, pairIndex: number, slot: 0 | 1, newMemberId: string): Pairs {
  const oldMemberId = pairsByGroup[groupIndex][pairIndex][slot];
  if (oldMemberId === newMemberId) return pairsByGroup;
  const next = pairsByGroup.map((g) => g.map((p) => [...p] as [string, string]));
  for (const group of next) {
    for (let pi = 0; pi < group.length; pi++) {
      for (let si = 0; si < 2; si++) {
        if (group[pi][si] === newMemberId) {
          group[pi][si] = oldMemberId;
          next[groupIndex][pairIndex][slot] = newMemberId;
          return next;
        }
      }
    }
  }
  return next;
}

export default function TournamentSetupView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { members } = useMemberStore();

  const { addMember, setMembers } = useMemberStore();
  // Check-in is the session queue - the same one club night uses - so whoever is
  // checked in here is checked in for the night, and vice versa.
  const { queue, setQueue } = useQueueStore();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    queueApi.get(sessionId).then((res) => setQueue(res.queue)).catch(() => {});
    // Fresh roster so archived members drop out and new ones appear, even on a direct load.
    membersApi.list()
      .then((res) => {
        // list() excludes guests; keep any already in the store so checked-in guests still resolve.
        const guests = Object.values(useMemberStore.getState().members).filter((m) => m.member_type === "guest");
        setMembers([...res.members, ...guests]);
      })
      .catch(() => {});
  }, [sessionId, setQueue, setMembers]);

  const selected = useMemo(() => new Set(queue.map((q) => q.member_id).filter((id) => members[id])), [queue, members]);
  const checkedIn = useMemo(
    () => Array.from(selected).map((id) => members[id]).sort((a, b) => a.name.localeCompare(b.name)),
    [selected, members]
  );
  const notYet = useMemo(
    () =>
      Object.values(members)
        .filter((m) => !selected.has(m.id) && m.member_type !== "guest" && m.active !== false)
        .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
        .filter((m) => !letter || m.name.trim().toUpperCase().startsWith(letter))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members, selected, search, letter]
  );
  const activeTotal = useMemo(
    () => Object.values(members).filter((m) => m.member_type !== "guest" && m.active !== false).length + checkedIn.filter((m) => m.member_type === "guest").length,
    [members, checkedIn]
  );
  const letters = useMemo(() => {
    const s = new Set<string>();
    for (const m of Object.values(members)) if (m.member_type !== "guest" && m.active !== false) s.add(m.name.trim()[0]?.toUpperCase() ?? "");
    return Array.from(s).filter(Boolean).sort();
  }, [members]);

  async function toggleCheckIn(memberId: string) {
    if (!sessionId) return;
    setLoadingId(memberId);
    try {
      const res = selected.has(memberId) ? await queueApi.remove(sessionId, memberId) : await queueApi.checkIn(sessionId, memberId);
      setQueue(res.queue);
      if (memberId === sitOut) setSitOut("");
    } finally {
      setLoadingId(null);
    }
  }

  async function addGuest() {
    if (!guestName.trim() || !sessionId) return;
    setAddingGuest(true);
    try {
      const { member } = await membersApi.create(guestName.trim(), "guest");
      addMember(member);
      const res = await queueApi.checkIn(sessionId, member.id);
      setQueue(res.queue);
      setGuestName("");
      setShowGuestForm(false);
    } finally {
      setAddingGuest(false);
    }
  }

  const [step, setStep] = useState<"select" | "review">("select");
  const [numGroups, setNumGroups] = useState(4);
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
  const [pairsByGroup, setPairsByGroup] = useState<Pairs>([]);
  const [reserves, setReserves] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Odd headcount needs someone to sit out — let the admin pick who, rather
  // than have the draft algorithm silently choose one for them.
  const [sitOut, setSitOut] = useState<string>("");
  // Tap-to-swap: first tap highlights a player, second tap (anywhere) swaps them.
  const [selectedSlot, setSelectedSlot] = useState<{ groupIndex: number; pairIndex: number; slot: 0 | 1 } | null>(null);

  const count = selected.size;
  const isOdd = count % 2 === 1;
  const playingCount = isOdd && sitOut ? count - 1 : count;
  const canDraft = numGroups >= 1 && (!isOdd || !!sitOut) && playingCount >= numGroups * 2;

  function handleDraft() {
    if (!canDraft) return;
    const participantIds = Array.from(selected).filter((id) => id !== sitOut);
    const { pairsByGroup: drafted, reserves: draftedReserves } = tournamentsApi.draft(participantIds, numGroups);
    setPairsByGroup(drafted);
    setReserves(sitOut ? [...draftedReserves, sitOut] : draftedReserves);
    setStep("review");
  }

  async function handleConfirm() {
    if (!sessionId) return;
    setCreating(true);
    setError(null);
    try {
      const tournament = await tournamentsApi.create(sessionId, pairsByGroup, reserves, advancePerGroup);
      navigate(`/tournament/${tournament.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the tournament");
    } finally {
      setCreating(false);
    }
  }

  const name = (id: string) => members[id]?.name ?? "?";
  // "Points" here means each player's skill level (1-5, see LEVEL_LABELS) —
  // averaging it per group/pair is how the draft balances strength, so
  // showing it lets the admin confirm groups/pairs actually came out even.
  const avgLevel = (ids: string[]) => ids.reduce((sum, id) => sum + (members[id]?.level ?? 2), 0) / ids.length;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 flex-shrink-0">
        <button
          onClick={() => (step === "review" ? setStep("select") : navigate("/"))}
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center flex-shrink-0">
          <Trophy size={18} className="text-white" />
        </div>
        <div>
          <h1 className="font-display font-black text-gray-900 text-lg leading-tight">
            {step === "select" ? "Tournament Check-in" : "Review Groups & Pairs"}
          </h1>
          <p className="text-gray-500 text-xs font-display">
            {step === "select" ? "Tap players as they arrive - once everyone's in, start the tournament" : "Swap anyone into a different pair before you start"}
          </p>
        </div>
      </header>

      {step === "select" && (
        <main className="flex-1 min-h-0 overflow-y-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 w-full">
          {/* Check-in board */}
          <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 flex flex-col gap-5 min-h-0">
            {/* Headline + progress */}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <motion.span
                    key={count}
                    initial={{ scale: 1.4, color: "#059669" }}
                    animate={{ scale: 1, color: "#111827" }}
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="font-display font-black text-4xl leading-none tabular-nums"
                  >
                    {count}
                  </motion.span>
                  <span className="font-display font-bold text-gray-400 text-sm">of {activeTotal} checked in</span>
                </div>
                <div className="mt-2 h-2 w-64 max-w-full rounded-full bg-gray-100 overflow-hidden">
                  <motion.div
                    animate={{ width: `${activeTotal ? Math.min(100, (count / activeTotal) * 100) : 0}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                  />
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setLetter(null); }}
                    placeholder="Search a name…"
                    className="pl-8 pr-8 h-11 rounded-xl border-2 border-gray-200 text-sm font-display font-bold w-56 focus:outline-none focus:border-violet-400"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400" aria-label="Clear search">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowGuestForm((v) => !v)}
                  className={`h-11 flex items-center gap-1.5 px-3 rounded-xl border-2 text-sm font-display font-bold transition-colors
                    ${showGuestForm ? "bg-violet-600 border-violet-600 text-white" : "border-violet-200 text-violet-600 active:bg-violet-50"}`}
                >
                  <UserPlus size={16} /> Guest
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showGuestForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-2 p-3 rounded-2xl bg-violet-50 border border-violet-100">
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addGuest()}
                      placeholder="Guest's name"
                      className="flex-1 h-11 px-3 rounded-xl border-2 border-violet-200 text-sm font-display font-bold focus:outline-none focus:border-violet-400 bg-white"
                      autoFocus
                    />
                    <Button size="md" disabled={!guestName.trim() || addingGuest} onClick={addGuest}>
                      {addingGuest ? "Adding…" : "Check in guest"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <LayoutGroup>
              {/* Checked in */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck size={14} className="text-emerald-600" />
                  <p className="text-[11px] font-display font-black text-emerald-600 uppercase tracking-widest">Checked in</p>
                  <span className="text-[11px] font-display text-gray-400">— tap to check out</span>
                </div>
                <motion.div layout className="grid gap-2 min-h-[56px] p-2 rounded-2xl bg-emerald-50/60 border border-emerald-100" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  <AnimatePresence initial={false}>
                    {checkedIn.map((m) => (
                      <motion.button
                        key={m.id}
                        layout
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        onClick={() => toggleCheckIn(m.id)}
                        disabled={loadingId === m.id}
                        className="min-h-[48px] w-full flex items-center gap-2 pl-1.5 pr-3 rounded-xl bg-white border-2 border-emerald-400 text-gray-900 font-display font-bold text-sm shadow-sm text-left disabled:opacity-50"
                      >
                        <span className="relative">
                          <Avatar name={m.name} url={m.avatar_url} memberType={m.member_type} size="sm" />
                          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white flex items-center justify-center">
                            <Check size={10} className="text-white" strokeWidth={3} />
                          </span>
                        </span>
                        <span>{m.name}</span>
                        <span className={`w-2 h-2 rounded-full ${LEVEL_DOT[m.level ?? 2]}`} title={LEVEL_LABELS[m.level ?? 2]} />
                      </motion.button>
                    ))}
                  </AnimatePresence>
                  {checkedIn.length === 0 && (
                    <p className="self-center px-2 text-sm font-display text-emerald-700/60">Nobody yet — tap a name below as they walk in.</p>
                  )}
                </motion.div>
              </div>

              {/* Not here yet */}
              <div className="flex flex-col gap-2 min-h-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-display font-black text-gray-500 uppercase tracking-widest">Not here yet</p>
                  <span className="text-[11px] font-display text-gray-400">— {notYet.length} to go, tap to check in</span>
                </div>
                {/* A–Z quick jump */}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setLetter(null)}
                    className={`h-9 min-w-[36px] px-2 rounded-lg text-xs font-display font-black transition-colors
                      ${letter === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 active:bg-gray-200"}`}
                  >
                    All
                  </button>
                  {letters.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLetter(letter === l ? null : l)}
                      className={`h-9 min-w-[36px] rounded-lg text-xs font-display font-black transition-colors
                        ${letter === l ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-500 active:bg-gray-200"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <motion.div layout className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  <AnimatePresence initial={false}>
                    {notYet.map((m) => (
                      <motion.button
                        key={m.id}
                        layout
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        onClick={() => toggleCheckIn(m.id)}
                        disabled={loadingId === m.id}
                        className="min-h-[48px] w-full flex items-center gap-2 pl-1.5 pr-3 rounded-xl bg-white border-2 border-gray-200 text-gray-700 font-display font-bold text-sm text-left hover:border-emerald-300 disabled:opacity-50"
                      >
                        <Avatar name={m.name} url={m.avatar_url} memberType={m.member_type} size="sm" />
                        <span>{m.name}</span>
                        <span className={`w-2 h-2 rounded-full ${LEVEL_DOT[m.level ?? 2]}`} title={LEVEL_LABELS[m.level ?? 2]} />
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </motion.div>
                {notYet.length === 0 && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-emerald-50 border border-violet-100"
                  >
                    <PartyPopper size={22} className="text-violet-600" />
                    <p className="text-sm font-display font-bold text-gray-700">
                      {search || letter
                        ? "No one matches — try another letter or clear the search."
                        : Object.keys(members).length === 0
                          ? "No members yet — add some from the Members panel first."
                          : "Everyone's here! Set the groups and start the tournament."}
                    </p>
                  </motion.div>
                )}
              </div>
            </LayoutGroup>
          </section>

          {/* Tournament settings + start */}
          <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 self-start lg:sticky lg:top-0">
            <div>
              <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">Groups</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setNumGroups((n) => Math.max(1, n - 1))} className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600 hover:bg-violet-200 active:scale-95 transition-all">−</button>
                <div className="flex-1 h-11 rounded-xl border-2 border-violet-300 text-center flex items-center justify-center font-display font-black text-2xl text-violet-600">{numGroups}</div>
                <button onClick={() => setNumGroups((n) => Math.min(8, n + 1))} className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600 hover:bg-violet-200 active:scale-95 transition-all">+</button>
              </div>
            </div>

            <div>
              <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">Pairs advancing to knockout, per group</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setAdvancePerGroup((n) => Math.max(1, n - 1))} className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600 hover:bg-violet-200 active:scale-95 transition-all">−</button>
                <div className="flex-1 h-11 rounded-xl border-2 border-violet-300 text-center flex items-center justify-center font-display font-black text-2xl text-violet-600">{advancePerGroup}</div>
                <button onClick={() => setAdvancePerGroup((n) => Math.min(4, n + 1))} className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600 hover:bg-violet-200 active:scale-95 transition-all">+</button>
              </div>
            </div>

            {isOdd && count > 0 && (
              <div>
                <label className="text-xs font-display font-bold text-amber-600 mb-1.5 block uppercase tracking-widest">
                  Odd headcount — who's sitting out?
                </label>
                <select
                  value={sitOut}
                  onChange={(e) => setSitOut(e.target.value)}
                  className="w-full text-sm font-display font-bold border-2 border-amber-300 rounded-xl px-3 py-2.5 bg-amber-50"
                >
                  <option value="">Choose a player…</option>
                  {Array.from(selected).map((id) => (
                    <option key={id} value={id}>{name(id)}</option>
                  ))}
                </select>
              </div>
            )}

            {playingCount > 0 && playingCount < numGroups * 2 && (
              <p className="text-xs font-display font-bold text-amber-600">
                Need at least {numGroups * 2} playing for {numGroups} groups (so every group can pair off). Check in more players or use fewer groups.
              </p>
            )}

            <Button size="lg" fullWidth disabled={!canDraft} onClick={handleDraft}>
              <Trophy size={18} /> Start Tournament · Draft Groups
            </Button>
            {count === 0 && <p className="text-xs font-display text-gray-400 text-center">Check players in as they arrive.</p>}
          </section>
        </main>
      )}

      {step === "review" && (
        <main className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 w-full">
          {error && <p className="text-sm font-display font-bold text-red-600">{error}</p>}
          <p className="text-xs font-display text-gray-500">
            {selectedSlot
              ? <>Now tap who <strong>{name(pairsByGroup[selectedSlot.groupIndex][selectedSlot.pairIndex][selectedSlot.slot])}</strong> should swap with — any group. Tap them again to cancel.</>
              : "Tap a player, then tap another (same group or a different one) to swap them. Everyone stays paired, nothing gets lost."}
          </p>

          {/* Two equal rows across the full width: 6 groups → 3 + 3, 4 → 2 + 2, 5 → 3 + 2. */}
          <div
            className="grid gap-4 items-start"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(pairsByGroup.length / 2))}, minmax(0, 1fr))` }}
          >
            {pairsByGroup.map((pairs, g) => {
              const groupMemberIds = pairs.flat();
              return (
                <section key={g} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="font-display font-black text-gray-900 text-sm">Group {g + 1}</h2>
                    <span className="text-[10px] font-display font-bold text-violet-500 bg-violet-50 rounded-full px-2 py-0.5">
                      Avg {avgLevel(groupMemberIds).toFixed(1)}
                    </span>
                  </div>
                  {pairs.map((pair, pairIndex) => (
                    <div key={pairIndex} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-xl px-2 py-1.5">
                      <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        {([0, 1] as const).map((slot) => {
                          const isSelected =
                            selectedSlot?.groupIndex === g && selectedSlot.pairIndex === pairIndex && selectedSlot.slot === slot;
                          return (
                            <button
                              key={slot}
                              onClick={() => {
                                if (!selectedSlot) { setSelectedSlot({ groupIndex: g, pairIndex, slot }); return; }
                                if (isSelected) { setSelectedSlot(null); return; }
                                setPairsByGroup((prev) =>
                                  swapInto(prev, selectedSlot.groupIndex, selectedSlot.pairIndex, selectedSlot.slot, pair[slot])
                                );
                                setSelectedSlot(null);
                              }}
                              className={`flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all active:scale-95
                                ${isSelected
                                  ? "bg-violet-600 border-violet-600 text-white shadow-md ring-2 ring-violet-300"
                                  : selectedSlot
                                    ? "bg-white border-dashed border-violet-300 text-gray-800 hover:bg-violet-50 hover:border-violet-500"
                                    : "bg-white border-gray-200 text-gray-800 hover:border-violet-400 hover:bg-violet-50"}`}
                            >
                              <Avatar name={members[pair[slot]]?.name ?? "?"} size="xs" memberType={members[pair[slot]]?.member_type} />
                              <span className="text-xs font-display font-bold truncate">
                                {name(pair[slot]).split(" ")[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-[10px] font-display font-bold text-gray-400 flex-shrink-0 tabular-nums">
                        {avgLevel(pair).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>

          {reserves.length > 0 && (
            <p className="text-xs font-display font-bold text-gray-500">
              Sitting out this round (odd headcount): {reserves.map(name).join(", ")}
            </p>
          )}

          <Button size="lg" fullWidth disabled={creating} onClick={handleConfirm}>
            {creating ? "Starting…" : "Confirm & Start Tournament →"}
          </Button>
        </main>
      )}
    </div>
  );
}
