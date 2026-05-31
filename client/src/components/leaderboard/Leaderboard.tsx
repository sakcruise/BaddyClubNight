import { useMemo, useState } from "react";
import { useMatchStore, useMemberStore } from "../../store";
import { computeLeaderboard } from "../../utils/scoring";
import { matchesApi } from "../../services/api";
import Avatar from "../shared/Avatar";
import { Trophy, List, Pencil, Check, X } from "lucide-react";
import ScoreInput from "../shared/ScoreInput";
import type { Match } from "../../types";

const MEDALS = [
  { bg: "bg-amber-50", border: "border-amber-200", numBg: "bg-amber-400" },
  { bg: "bg-gray-50",  border: "border-gray-200",  numBg: "bg-gray-400"  },
  { bg: "bg-orange-50",border: "border-orange-200",numBg: "bg-orange-400" },
];

type Tab = "standings" | "matches";

function ScoreEditor({ match, onSave, onCancel }: {
  match: Match;
  onSave: (a: number, b: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [a, setA] = useState(match.score_a ?? 0);
  const [b, setB] = useState(match.score_b ?? 0);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSave(a, b); } finally { setSaving(false); }
  }

  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-2xl p-3 flex flex-col gap-3">
      <div className="flex items-center justify-around gap-2">
        <ScoreInput label="Team A" value={a} onChange={setA} />
        <span className="text-gray-300 font-black text-lg mt-4">vs</span>
        <ScoreInput label="Team B" value={b} onChange={setB} />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 font-display font-bold text-sm
                     hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-1">
          <X size={13} /> Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2 rounded-xl bg-green-500 text-white font-display font-bold text-sm
                     hover:bg-green-600 disabled:opacity-60 active:scale-95 transition-all flex items-center justify-center gap-1">
          <Check size={13} /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PairsEditor({ match, members, onSave, onCancel }: {
  match: Match;
  members: Record<string, import("../../types").Member>;
  onSave: (teamA: [string, string], teamB: [string, string]) => Promise<void>;
  onCancel: () => void;
}) {
  const allFour = [...match.team_a, ...match.team_b];
  const [pairMap, setPairMap] = useState<Record<string, "A" | "B">>(() => {
    const m: Record<string, "A" | "B"> = {};
    match.team_a.forEach((id) => { m[id] = "A"; });
    match.team_b.forEach((id) => { m[id] = "B"; });
    return m;
  });
  const [saving, setSaving] = useState(false);

  const teamA = allFour.filter((id) => pairMap[id] === "A");
  const teamB = allFour.filter((id) => pairMap[id] === "B");
  const canSave = teamA.length === 2 && teamB.length === 2;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try { await onSave(teamA as [string, string], teamB as [string, string]); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-2xl p-3 flex flex-col gap-2">
      <p className="text-[10px] font-display font-bold text-gray-400 text-center uppercase tracking-wide">Edit Pairs — tap to switch</p>
      <div className="grid grid-cols-2 gap-2">
        {(["A", "B"] as const).map((team) => {
          const teamMembers = allFour.filter((id) => pairMap[id] === team);
          return (
            <div key={team} className={`rounded-xl p-2 border ${team === "A" ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
              <p className={`text-[9px] font-display font-black mb-1.5 ${team === "A" ? "text-blue-600" : "text-orange-600"}`}>
                Team {team} {teamMembers.length === 2 ? "✓" : `(${teamMembers.length}/2)`}
              </p>
              <div className="flex flex-col gap-1">
                {teamMembers.map((id) => {
                  const m = members[id];
                  return (
                    <button
                      key={id}
                      onClick={() => setPairMap((p) => ({ ...p, [id]: p[id] === "A" ? "B" : "A" }))}
                      className={`flex items-center gap-1.5 w-full p-1 rounded-lg bg-white border text-left active:scale-95 transition-all
                        ${team === "A" ? "border-blue-200 hover:border-blue-400" : "border-orange-200 hover:border-orange-400"}`}
                    >
                      <Avatar name={m?.name ?? ""} memberType={m?.member_type} size="xs" />
                      <span className="font-display font-bold text-[10px] text-gray-800 flex-1 truncate">{m?.name}</span>
                      <span className="text-[9px] text-gray-400">↔</span>
                    </button>
                  );
                })}
                {teamMembers.length < 2 && (
                  <div className={`h-6 rounded-lg border border-dashed flex items-center justify-center text-[9px]
                    ${team === "A" ? "border-blue-300 text-blue-400" : "border-orange-300 text-orange-400"}`}>
                    + 1 more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 font-display font-bold text-sm
                     hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-1">
          <X size={13} /> Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !canSave}
          className="flex-1 py-2 rounded-xl bg-blue-500 text-white font-display font-bold text-sm
                     hover:bg-blue-600 disabled:opacity-60 active:scale-95 transition-all flex items-center justify-center gap-1">
          <Check size={13} /> {saving ? "Saving…" : "Save Pairs"}
        </button>
      </div>
    </div>
  );
}

function MatchRow({ match, members, onUpdated, matchNumber }: {
  match: Match;
  members: Record<string, import("../../types").Member>;
  onUpdated: (m: Match) => void;
  matchNumber: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editingPairs, setEditingPairs] = useState(false);

  const hasScore = match.score_a != null && match.score_b != null;
  const rawTeamA = match.team_a.map((id) => members[id]).filter(Boolean);
  const rawTeamB = match.team_b.map((id) => members[id]).filter(Boolean);

  // Always show winner on left
  const aWon = hasScore && match.score_a! >= match.score_b!;
  const [winner, loser, winScore, loseScore] = aWon
    ? [rawTeamA, rawTeamB, match.score_a!, match.score_b!]
    : [rawTeamB, rawTeamA, match.score_b!, match.score_a!];
  // If no score, keep original order
  const leftTeam  = hasScore ? winner : rawTeamA;
  const rightTeam = hasScore ? loser  : rawTeamB;
  const leftScore  = hasScore ? winScore  : null;
  const rightScore = hasScore ? loseScore : null;

  async function handleSave(a: number, b: number) {
    const { match: updated } = await matchesApi.score(match.id, a, b);
    onUpdated(updated);
    setEditing(false);
  }

  async function handleSavePairs(teamA: [string, string], teamB: [string, string]) {
    const { match: updated } = await matchesApi.updateTeams(match.id, teamA, teamB);
    onUpdated(updated);
    setEditingPairs(false);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-3">
      {/* Header row: match number + court badge + edit buttons */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 font-display font-black text-xs
                          flex items-center justify-center flex-shrink-0">
            #{matchNumber}
          </div>
          <div className="w-7 h-7 rounded-lg bg-green-100 text-green-700 font-display font-black text-xs
                          flex items-center justify-center flex-shrink-0">
            C{match.court_id}
          </div>
          {hasScore ? (
            <span className="font-display font-black text-gray-800 text-sm tabular-nums">
              {leftScore} – {rightScore}
            </span>
          ) : (
            <span className="text-xs text-gray-400 font-display font-bold italic">No score — tap ✏️ to add</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setEditingPairs(!editingPairs); setEditing(false); }}
            title="Edit pairs"
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 text-xs font-display font-bold
              ${editingPairs ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 text-gray-400"}`}
          >
            🤝
          </button>
          <button
            onClick={() => { setEditing(!editing); setEditingPairs(false); }}
            title="Edit score"
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0
              ${editing ? "bg-orange-100 text-orange-600" : "hover:bg-gray-100 text-gray-400"}`}
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>

      {/* Teams side by side — winner always left */}
      <div className="flex gap-2">
        {/* Left team (winner / team A if no score) */}
        <div className={`flex-1 rounded-xl px-2 py-1.5 ${hasScore ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-100"}`}>
          <div className="flex items-center gap-1 mb-1">
            <div className="flex -space-x-1">
              {leftTeam.map((m) => (
                <Avatar key={m.id} name={m.name} memberType={m.member_type} size="xs" />
              ))}
            </div>
            {hasScore && <span className="text-[10px] text-green-600 font-display font-black ml-auto">🏆 WIN</span>}
          </div>
          {leftTeam.map((m) => (
            <div key={m.id} className={`text-xs font-display font-bold leading-tight ${hasScore ? "text-green-800" : "text-gray-700"}`}>
              {m.name}
            </div>
          ))}
        </div>

        <div className="flex items-center text-gray-300 font-black text-xs flex-shrink-0">vs</div>

        {/* Right team (loser / team B if no score) */}
        <div className="flex-1 rounded-xl px-2 py-1.5 bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-1 mb-1">
            <div className="flex -space-x-1">
              {rightTeam.map((m) => (
                <Avatar key={m.id} name={m.name} memberType={m.member_type} size="xs" />
              ))}
            </div>
          </div>
          {rightTeam.map((m) => (
            <div key={m.id} className="text-xs font-display font-bold leading-tight text-gray-600">
              {m.name}
            </div>
          ))}
        </div>
      </div>

      {/* Inline score editor */}
      {editing && (
        <ScoreEditor match={match} onSave={handleSave} onCancel={() => setEditing(false)} />
      )}

      {/* Inline pairs editor */}
      {editingPairs && (
        <PairsEditor match={match} members={members} onSave={handleSavePairs} onCancel={() => setEditingPairs(false)} />
      )}
    </div>
  );
}

export default function Leaderboard() {
  const { matches, updateMatch } = useMatchStore();
  const { members } = useMemberStore();
  const [tab, setTab] = useState<Tab>("standings");

  const stats = useMemo(
    () => computeLeaderboard(matches, members),
    [matches, members]
  );

  const completedMatches = useMemo(
    () => [...matches].filter((m) => m.result === "complete").reverse(),
    [matches]
  );

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">

      {/* Section header */}
      <div className="section-header">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Trophy size={18} className="text-amber-600" />
        </div>
        <span className="section-title">Leaderboard</span>
        <span className="ml-auto badge bg-amber-100 text-amber-600 text-xs">
          {completedMatches.length} match{completedMatches.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 flex-shrink-0">
        <button
          onClick={() => setTab("standings")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-display font-bold transition-all
            ${tab === "standings" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Trophy size={13} /> Standings
        </button>
        <button
          onClick={() => setTab("matches")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-display font-bold transition-all
            ${tab === "matches" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <List size={13} /> Matches
          {completedMatches.length > 0 && (
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black
              ${tab === "matches" ? "bg-orange-100 text-orange-600" : "bg-gray-200 text-gray-500"}`}>
              {completedMatches.length}
            </span>
          )}
        </button>
      </div>

      {/* Standings tab */}
      {tab === "standings" && (
        stats.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-40">
            <span className="text-4xl">🏆</span>
            <p className="text-gray-500 font-display font-bold text-sm">No matches yet!</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {stats.map((s, idx) => {
              const medal = MEDALS[idx];
              return (
                <div
                  key={s.member_id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border
                    ${medal ? `${medal.bg} ${medal.border}` : "bg-white border-gray-100"}`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
                    font-display font-black text-sm text-white
                    ${medal ? medal.numBg : "bg-gray-300"}`}
                  >
                    {idx + 1}
                  </div>
                  <Avatar name={s.member?.name ?? "?"} url={s.member?.avatar_url} memberType={s.member?.member_type} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-black text-gray-900 text-sm truncate leading-tight">
                      {s.member?.name ?? "Unknown"}
                    </div>
                    <div className="text-gray-400 text-xs font-display">
                      {s.matches_played} match{s.matches_played !== 1 ? "es" : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="badge bg-green-100 text-green-700 text-xs px-2 py-0.5 font-black">{s.wins}W</span>
                      <span className="badge bg-red-100 text-red-600 text-xs px-2 py-0.5 font-black">{s.losses}L</span>
                    </div>
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all"
                        style={{ width: `${Math.round(s.win_rate * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Matches tab */}
      {tab === "matches" && (
        completedMatches.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-40">
            <span className="text-4xl">🏸</span>
            <p className="text-gray-500 font-display font-bold text-sm">No matches yet!</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {completedMatches.map((match, idx) => (
              <MatchRow
                key={match.id}
                match={match}
                members={members}
                matchNumber={completedMatches.length - idx}
                onUpdated={(updated) => updateMatch(match.id, updated)}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
