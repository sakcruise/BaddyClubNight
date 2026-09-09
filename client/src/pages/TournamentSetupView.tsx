import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMemberStore } from "../store";
import { tournamentsApi } from "../services/tournaments";
import Avatar from "../components/shared/Avatar";
import Button from "../components/shared/Button";
import { LEVEL_LABELS } from "../types";
import { Trophy, ChevronLeft } from "lucide-react";

export default function TournamentSetupView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { members } = useMemberStore();

  const roster = useMemo(
    () => Object.values(members).filter((m) => m.member_type !== "guest").sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [numGroups, setNumGroups] = useState(4);
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
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
  // Every group must end up even-sized, so at least 2 people per group and at
  // least 2*numGroups participants overall for the draft to make sense.
  const canGenerate = count >= numGroups * 2 && numGroups >= 1 && !creating;

  async function handleGenerate() {
    if (!sessionId || !canGenerate) return;
    setCreating(true);
    setError(null);
    try {
      const tournament = await tournamentsApi.create(sessionId, Array.from(selected), numGroups, advancePerGroup);
      navigate(`/tournament/${tournament.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the tournament");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 flex-shrink-0">
        <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center flex-shrink-0">
          <Trophy size={18} className="text-white" />
        </div>
        <div>
          <h1 className="font-display font-black text-gray-900 text-lg leading-tight">Set Up Tournament</h1>
          <p className="text-gray-500 text-xs font-display">Pick who's playing tonight</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5 max-w-2xl w-full mx-auto">
        {/* Participants */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-display font-bold text-gray-600 uppercase tracking-widest">
              Players ({count} selected)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(new Set(roster.map((m) => m.id)))}
                className="text-xs font-display font-bold text-violet-600 hover:text-violet-700"
              >
                Select all
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs font-display font-bold text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {roster.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="w-5 h-5 rounded accent-violet-600 flex-shrink-0"
                />
                <Avatar name={m.name} url={m.avatar_url} memberType={m.member_type} size="sm" />
                <span className="flex-1 font-display font-bold text-gray-800 text-sm">{m.name}</span>
                <span className="text-xs font-display font-bold text-gray-400">{LEVEL_LABELS[m.level] ?? "—"}</span>
              </label>
            ))}
            {roster.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-400 text-sm font-display">
                No members yet — add some from the Members panel first.
              </p>
            )}
          </div>
        </section>

        {/* Groups */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">
              Groups
            </label>
            <div className="flex items-center gap-2">
              <button onClick={() => setNumGroups((n) => Math.max(1, n - 1))}
                className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600
                           hover:bg-violet-200 active:scale-95 transition-all">−</button>
              <div className="flex-1 h-11 rounded-xl border-2 border-violet-300 text-center flex items-center justify-center
                              font-display font-black text-2xl text-violet-600">{numGroups}</div>
              <button onClick={() => setNumGroups((n) => Math.min(8, n + 1))}
                className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600
                           hover:bg-violet-200 active:scale-95 transition-all">+</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-display font-bold text-gray-600 mb-1.5 block uppercase tracking-widest">
              Pairs advancing to knockout, per group
            </label>
            <div className="flex items-center gap-2">
              <button onClick={() => setAdvancePerGroup((n) => Math.max(1, n - 1))}
                className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600
                           hover:bg-violet-200 active:scale-95 transition-all">−</button>
              <div className="flex-1 h-11 rounded-xl border-2 border-violet-300 text-center flex items-center justify-center
                              font-display font-black text-2xl text-violet-600">{advancePerGroup}</div>
              <button onClick={() => setAdvancePerGroup((n) => Math.min(numGroups > 0 ? 4 : 1, n + 1))}
                className="w-11 h-11 rounded-xl bg-violet-100 border-2 border-violet-200 font-display font-black text-xl text-violet-600
                           hover:bg-violet-200 active:scale-95 transition-all">+</button>
            </div>
          </div>

          {count > 0 && count < numGroups * 2 && (
            <p className="text-xs font-display font-bold text-amber-600">
              Need at least {numGroups * 2} players for {numGroups} groups (so every group can pair off). Pick more players or fewer groups.
            </p>
          )}
          {error && <p className="text-xs font-display font-bold text-red-600">{error}</p>}
        </section>

        <Button size="lg" fullWidth disabled={!canGenerate} onClick={handleGenerate}>
          {creating ? "Generating…" : "Generate Groups →"}
        </Button>
      </main>
    </div>
  );
}
