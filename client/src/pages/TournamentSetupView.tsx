import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMemberStore } from "../store";
import { tournamentsApi } from "../services/tournaments";
import Avatar from "../components/shared/Avatar";
import Button from "../components/shared/Button";
import { LEVEL_LABELS } from "../types";
import { Trophy, ChevronLeft, ArrowLeftRight } from "lucide-react";

type Pairs = [string, string][][];

function swapInto(pairsByGroup: Pairs, groupIndex: number, pairIndex: number, slot: 0 | 1, newMemberId: string): Pairs {
  const oldMemberId = pairsByGroup[groupIndex][pairIndex][slot];
  if (oldMemberId === newMemberId) return pairsByGroup;
  const next = pairsByGroup.map((g) => g.map((p) => [...p] as [string, string]));
  const group = next[groupIndex];
  for (let pi = 0; pi < group.length; pi++) {
    for (let si = 0; si < 2; si++) {
      if (group[pi][si] === newMemberId) {
        group[pi][si] = oldMemberId;
        group[pairIndex][slot] = newMemberId;
        return next;
      }
    }
  }
  return next;
}

export default function TournamentSetupView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { members } = useMemberStore();

  const roster = useMemo(
    () => Object.values(members).filter((m) => m.member_type !== "guest").sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const [step, setStep] = useState<"select" | "review">("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [numGroups, setNumGroups] = useState(4);
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
  const [pairsByGroup, setPairsByGroup] = useState<Pairs>([]);
  const [reserves, setReserves] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const count = selected.size;
  const canDraft = count >= numGroups * 2 && numGroups >= 1;

  function handleDraft() {
    if (!canDraft) return;
    const { pairsByGroup: drafted, reserves: draftedReserves } = tournamentsApi.draft(Array.from(selected), numGroups);
    setPairsByGroup(drafted);
    setReserves(draftedReserves);
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
            {step === "select" ? "Set Up Tournament" : "Review Groups & Pairs"}
          </h1>
          <p className="text-gray-500 text-xs font-display">
            {step === "select" ? "Pick who's playing tonight" : "Swap anyone into a different pair before you start"}
          </p>
        </div>
      </header>

      {step === "select" && (
        <main className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5 max-w-2xl w-full mx-auto">
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-display font-bold text-gray-600 uppercase tracking-widest">
                Players ({count} selected)
              </label>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set(roster.map((m) => m.id)))} className="text-xs font-display font-bold text-violet-600 hover:text-violet-700">
                  Select all
                </button>
                <button onClick={() => setSelected(new Set())} className="text-xs font-display font-bold text-gray-400 hover:text-gray-600">
                  Clear
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {roster.map((m) => (
                <label key={m.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="w-5 h-5 rounded accent-violet-600 flex-shrink-0" />
                  <Avatar name={m.name} url={m.avatar_url} memberType={m.member_type} size="sm" />
                  <span className="flex-1 font-display font-bold text-gray-800 text-sm">{m.name}</span>
                  <span className="text-xs font-display font-bold text-gray-400">{LEVEL_LABELS[m.level] ?? "—"}</span>
                </label>
              ))}
              {roster.length === 0 && (
                <p className="px-4 py-6 text-center text-gray-400 text-sm font-display">No members yet — add some from the Members panel first.</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-4">
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

            {count > 0 && count < numGroups * 2 && (
              <p className="text-xs font-display font-bold text-amber-600">
                Need at least {numGroups * 2} players for {numGroups} groups (so every group can pair off). Pick more players or fewer groups.
              </p>
            )}
          </section>

          <Button size="lg" fullWidth disabled={!canDraft} onClick={handleDraft}>
            Draft Groups →
          </Button>
        </main>
      )}

      {step === "review" && (
        <main className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 max-w-[1800px] w-full mx-auto">
          {error && <p className="text-sm font-display font-bold text-red-600">{error}</p>}
          <p className="text-xs font-display text-gray-500">
            Pick a different player into any slot to swap them with whoever's there — everyone stays paired, nothing gets lost.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {pairsByGroup.map((pairs, g) => {
              const groupMemberIds = pairs.flat();
              return (
                <section key={g} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2">
                  <h2 className="font-display font-black text-gray-900 text-sm mb-1">Group {g + 1}</h2>
                  {pairs.map((pair, pairIndex) => (
                    <div key={pairIndex} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-xl px-2 py-1.5">
                      {[0, 1].map((slot) => (
                        <select
                          key={slot}
                          value={pair[slot as 0 | 1]}
                          onChange={(e) => setPairsByGroup((prev) => swapInto(prev, g, pairIndex, slot as 0 | 1, e.target.value))}
                          className="flex-1 min-w-0 text-xs font-display font-bold border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white"
                        >
                          {groupMemberIds.map((id) => (
                            <option key={id} value={id}>{name(id)}</option>
                          ))}
                        </select>
                      ))}
                      <ArrowLeftRight size={12} className="text-gray-300 flex-shrink-0" />
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
