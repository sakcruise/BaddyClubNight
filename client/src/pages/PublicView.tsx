/**
 * Public read-only web view — shown on Vercel (no login required).
 * Reads session history and leaderboard directly from Supabase.
 */
import { useState, useEffect, useMemo } from "react";
import { publicApi } from "../services/supabaseApi";
import type { Session, Match, Member } from "../types";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import Avatar from "../components/shared/Avatar";
import { Calendar, ChevronRight, ChevronDown, Trophy, Users } from "lucide-react";
import { computeLeaderboard } from "../utils/scoring";

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ─── Overall leaderboard across all sessions ──────────────────────────────────
function OverallLeaderboard({ allMatches, memberMap }: {
  allMatches: Match[];
  memberMap: Record<string, Member>;
}) {
  const completed = allMatches.filter((m) => m.result === "complete");
  const stats = computeLeaderboard(completed, memberMap);

  if (stats.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 font-display font-bold">
        No scored matches synced yet
      </div>
    );
  }

  const MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-2">
      {stats.map((s, idx) => (
        <div key={s.member_id}
          className={`flex items-center gap-3 p-3 rounded-2xl border
            ${idx === 0 ? "bg-amber-50 border-amber-200" :
              idx === 1 ? "bg-gray-50 border-gray-200" :
              idx === 2 ? "bg-orange-50 border-orange-200" :
              "bg-white border-gray-100"}`}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-display font-black text-lg">
            {MEDALS[idx] ?? idx + 1}
          </div>
          <Avatar name={s.member?.name ?? "?"} memberType={s.member?.member_type} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="font-display font-black text-gray-900 text-sm truncate">{s.member?.name ?? "Unknown"}</div>
            <div className="text-gray-400 text-xs font-display">{s.matches_played} match{s.matches_played !== 1 ? "es" : ""}</div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-lg font-black">{s.wins}W</span>
            <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-lg font-black">{s.losses}L</span>
            <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-lg font-black">
              {s.matches_played > 0 ? Math.round((s.wins / s.matches_played) * 100) : 0}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Single session row ───────────────────────────────────────────────────────
function SessionRow({ session, memberMap }: { session: Session; memberMap: Record<string, Member> }) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [queue, setQueue] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"leaderboard" | "matches" | "checkins">("leaderboard");

  async function toggle() {
    if (open) { setOpen(false); return; }
    if (matches) { setOpen(true); return; }
    setLoading(true);
    try {
      const [m, q] = await Promise.all([
        publicApi.matches(session.id),
        publicApi.queue(session.id),
      ]);
      setMatches(m);
      setQueue(q);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const completed = useMemo(() => (matches ?? []).filter((m) => m.result === "complete"), [matches]);

  // Merge member map with queue data (for guests)
  const localMemberMap = useMemo(() => {
    const map = { ...memberMap };
    (queue ?? []).forEach((q) => {
      if (!map[q.member_id]) {
        map[q.member_id] = {
          id: q.member_id,
          name: q.name,
          member_type: q.member_type,
          email: "",
          created_at: q.checked_in_at,
        };
      }
    });
    return map;
  }, [memberMap, queue]);

  const stats = useMemo(() => computeLeaderboard(completed, localMemberMap), [completed, localMemberMap]);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <Calendar size={18} className="text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-black text-gray-900 text-sm">{session.club_name}</div>
          <div className="text-gray-500 text-xs font-display">{formatDate(session.date)}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-lg font-bold">
            {session.num_courts} court{session.num_courts !== 1 ? "s" : ""}
          </span>
          {loading
            ? <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
            : open ? <ChevronDown size={16} className="text-gray-400" />
            : <ChevronRight size={16} className="text-gray-400" />
          }
        </div>
      </button>

      {open && matches && (
        <div className="border-t border-gray-100 p-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-3">
            {(["leaderboard", "matches", "checkins"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all
                  ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {t === "leaderboard" ? `🏆 Standings` : t === "matches" ? `🏸 Matches (${completed.length})` : `✓ Check-ins (${queue?.length ?? 0})`}
              </button>
            ))}
          </div>

          {/* Leaderboard */}
          {tab === "leaderboard" && (
            stats.length === 0
              ? <div className="text-center py-8 text-gray-400 font-display font-bold">No scored matches</div>
              : <div className="space-y-2">
                {stats.map((s, idx) => (
                  <div key={s.member_id} className={`flex items-center gap-3 p-3 rounded-2xl border
                    ${idx === 0 ? "bg-amber-50 border-amber-200" : idx === 1 ? "bg-gray-50 border-gray-200" : idx === 2 ? "bg-orange-50 border-orange-200" : "bg-white border-gray-100"}`}>
                    <div className="w-7 h-7 rounded-xl bg-gray-200 flex items-center justify-center font-display font-black text-xs">{idx + 1}</div>
                    <Avatar name={s.member?.name ?? "?"} memberType={s.member?.member_type} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-black text-gray-900 text-sm truncate">{s.member?.name ?? "Unknown"}</div>
                      <div className="text-gray-400 text-xs font-display">{s.matches_played} matches</div>
                    </div>
                    <div className="flex gap-1">
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-lg font-black">{s.wins}W</span>
                      <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-lg font-black">{s.losses}L</span>
                    </div>
                  </div>
                ))}
              </div>
          )}

          {/* Matches */}
          {tab === "matches" && (
            completed.length === 0
              ? <div className="text-center py-8 text-gray-400 font-display font-bold">No matches recorded</div>
              : <div className="space-y-2">
                {completed.map((match, idx) => {
                  const teamA = match.team_a.map((id) => localMemberMap[id]).filter(Boolean);
                  const teamB = match.team_b.map((id) => localMemberMap[id]).filter(Boolean);
                  const hasScore = match.score_a != null && match.score_b != null;
                  const aWon = hasScore && match.score_a! >= match.score_b!;
                  const [left, right] = hasScore
                    ? aWon ? [teamA, teamB] : [teamB, teamA]
                    : [teamA, teamB];

                  return (
                    <div key={match.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-display font-black text-gray-400">#{idx + 1}</span>
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-lg font-black">C{match.court_id}</span>
                        {hasScore && (
                          <span className="font-display font-black text-gray-800 text-sm tabular-nums">
                            {aWon ? match.score_a : match.score_b} – {aWon ? match.score_b : match.score_a}
                          </span>
                        )}
                        {match.ended_at && (
                          <span className="ml-auto text-[10px] text-gray-400 font-display">{formatTime(match.ended_at)}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <div className={`flex-1 rounded-xl px-2 py-1.5 ${hasScore ? "bg-green-50 border border-green-200" : "bg-white border border-gray-100"}`}>
                          <div className="flex -space-x-1 mb-1">
                            {left.map((m) => <Avatar key={m.id} name={m.name} memberType={m.member_type} size="xs" />)}
                          </div>
                          {left.map((m) => <div key={m.id} className="text-xs font-display font-bold text-gray-700 leading-tight">{m.name}</div>)}
                          {hasScore && <span className="text-[10px] text-green-600 font-black">🏆 WIN</span>}
                        </div>
                        <div className="flex items-center text-gray-300 font-black text-xs">vs</div>
                        <div className="flex-1 rounded-xl px-2 py-1.5 bg-white border border-gray-100">
                          <div className="flex -space-x-1 mb-1">
                            {right.map((m) => <Avatar key={m.id} name={m.name} memberType={m.member_type} size="xs" />)}
                          </div>
                          {right.map((m) => <div key={m.id} className="text-xs font-display font-bold text-gray-600 leading-tight">{m.name}</div>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
          )}

          {/* Check-ins */}
          {tab === "checkins" && (
            !queue || queue.length === 0
              ? <div className="text-center py-8 text-gray-400 font-display font-bold">No check-ins recorded</div>
              : <div className="space-y-1.5">
                {queue.map((q, idx) => (
                  <div key={q.member_id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-3 py-2.5">
                    <div className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 font-display font-black text-xs flex items-center justify-center">{idx + 1}</div>
                    <Avatar name={q.name} memberType={q.member_type} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-gray-800 text-sm truncate">{q.name}</div>
                      {q.member_type === "guest" && <div className="text-[10px] text-purple-500 font-display font-bold">Guest</div>}
                    </div>
                    <div className="text-[10px] text-gray-400 font-display">{formatTime(q.checked_in_at)}</div>
                  </div>
                ))}
              </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main public view ─────────────────────────────────────────────────────────
export default function PublicView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"history" | "leaderboard">("leaderboard");

  const memberMap = useMemo(() => {
    const map: Record<string, Member> = {};
    members.forEach((m) => { map[m.id] = m; });
    return map;
  }, [members]);

  useEffect(() => {
    async function load() {
      try {
        const [s, m] = await Promise.all([publicApi.sessions(), publicApi.members()]);
        setSessions(s);
        setMembers(m);

        // Load all matches for overall leaderboard
        const matchArrays = await Promise.all(s.map((sess) => publicApi.matches(sess.id)));
        setAllMatches(matchArrays.flat());
      } catch (e: any) {
        setError(e.message ?? "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-orange-50 to-orange-100">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #7c2d12 0%, #ea580c 70%, #f59e0b 100%)" }}>
        <div className="bg-white/15 rounded-2xl p-2.5 backdrop-blur-sm border border-white/20">
          <ShuttlecockIcon size={36} />
        </div>
        <div className="flex-1">
          <h1 className="font-display font-black text-white text-xl leading-tight">Badminton Club Night</h1>
          <p className="text-orange-200 text-xs font-display font-semibold">Club history &amp; leaderboard</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white/15 rounded-xl px-3 py-2 text-center border border-white/20">
            <div className="text-white font-display font-black text-lg leading-none">{sessions.length}</div>
            <div className="text-orange-200 text-[10px] font-display font-bold">Nights</div>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2 text-center border border-white/20">
            <div className="text-white font-display font-black text-lg leading-none">{members.length}</div>
            <div className="text-orange-200 text-[10px] font-display font-bold">Members</div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-4 pt-4">
        <div className="flex gap-1 bg-white/80 backdrop-blur-sm rounded-2xl p-1 shadow-sm border border-orange-100 max-w-2xl mx-auto">
          <button onClick={() => setTab("leaderboard")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-display font-bold transition-all
              ${tab === "leaderboard" ? "bg-orange-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <Trophy size={14} /> Overall Leaderboard
          </button>
          <button onClick={() => setTab("history")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-display font-bold transition-all
              ${tab === "history" ? "bg-orange-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <Users size={14} /> Session History
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-4 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-gray-500 font-display font-bold text-sm">Loading club data…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-4xl">⚠️</span>
            <p className="text-red-500 font-display font-bold text-sm text-center">{error}</p>
            <p className="text-gray-400 font-display text-xs text-center">Make sure Supabase is configured and data has been synced from the Pi.</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-60">
            <span className="text-5xl">🏸</span>
            <p className="text-gray-600 font-display font-bold text-base">No sessions synced yet</p>
            <p className="text-gray-500 font-display text-sm text-center">Run a club night on the Pi and sync to see data here.</p>
          </div>
        ) : (
          <>
            {tab === "leaderboard" && (
              <OverallLeaderboard allMatches={allMatches} memberMap={memberMap} />
            )}
            {tab === "history" && (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <SessionRow key={s.id} session={s} memberMap={memberMap} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-400 font-display">
        Data synced from club Pi · Read-only view
      </footer>
    </div>
  );
}
