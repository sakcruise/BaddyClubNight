import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { sessionsApi } from "../services/api";
import { membersApi } from "../services/api";
import type { Session, Match, Member } from "../types";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import Avatar from "../components/shared/Avatar";
import { ArrowLeft, Calendar, ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { computeLeaderboard } from "../utils/scoring";

interface SessionSummary {
  session: Session;
  matches: Match[];
  queue: Array<{ member_id: string; name: string; member_type: string; position: number; checked_in_at: string }>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function SessionDetailPanel({ summary, members }: { summary: SessionSummary; members: Record<string, Member> }) {
  const [tab, setTab] = useState<"matches" | "leaderboard" | "checkins">("leaderboard");

  // Build member map merging API members with queue names (for guests)
  const memberMap = useMemo(() => {
    const map: Record<string, Member> = { ...members };
    summary.queue.forEach((q) => {
      if (!map[q.member_id]) {
        map[q.member_id] = {
          id: q.member_id,
          name: q.name,
          member_type: (q.member_type as any) ?? "guest",
          email: "",
          avatar_url: undefined,
          created_at: q.checked_in_at,
        };
      }
    });
    return map;
  }, [members, summary.queue]);

  const completedMatches = summary.matches.filter((m) => m.result === "complete");
  const stats = useMemo(() => computeLeaderboard(completedMatches, memberMap), [completedMatches, memberMap]);

  const MEDALS = [
    { bg: "bg-amber-50", border: "border-amber-200", numBg: "bg-amber-400" },
    { bg: "bg-gray-50", border: "border-gray-200", numBg: "bg-gray-400" },
    { bg: "bg-orange-50", border: "border-orange-200", numBg: "bg-orange-400" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        {(["leaderboard", "matches", "checkins"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all capitalize
              ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t === "leaderboard" ? "🏆 Standings" : t === "matches" ? `🏸 Matches (${completedMatches.length})` : `✓ Check-ins (${summary.queue.length})`}
          </button>
        ))}
      </div>

      {/* Leaderboard tab */}
      {tab === "leaderboard" && (
        stats.length === 0 ? (
          <div className="text-center py-8 text-gray-400 font-display font-bold">No scored matches</div>
        ) : (
          <div className="space-y-2">
            {stats.map((s, idx) => {
              const medal = MEDALS[idx];
              return (
                <div key={s.member_id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border
                    ${medal ? `${medal.bg} ${medal.border}` : "bg-white border-gray-100"}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-display font-black text-sm text-white
                    ${medal ? medal.numBg : "bg-gray-300"}`}>
                    {idx + 1}
                  </div>
                  <Avatar name={s.member?.name ?? "?"} memberType={s.member?.member_type} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-black text-gray-900 text-sm truncate">{s.member?.name ?? "Unknown"}</div>
                    <div className="text-gray-400 text-xs font-display">{s.matches_played} match{s.matches_played !== 1 ? "es" : ""}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="badge bg-green-100 text-green-700 text-xs px-2 py-0.5 font-black">{s.wins}W</span>
                    <span className="badge bg-red-100 text-red-600 text-xs px-2 py-0.5 font-black">{s.losses}L</span>
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
          <div className="text-center py-8 text-gray-400 font-display font-bold">No matches recorded</div>
        ) : (
          <div className="space-y-2">
            {completedMatches.map((match, idx) => {
              const teamA = match.team_a.map((id) => memberMap[id]).filter(Boolean);
              const teamB = match.team_b.map((id) => memberMap[id]).filter(Boolean);
              const hasScore = match.score_a != null && match.score_b != null;
              const aWon = hasScore && match.score_a! >= match.score_b!;
              const [winner, loser, wScore, lScore] = aWon
                ? [teamA, teamB, match.score_a!, match.score_b!]
                : [teamB, teamA, match.score_b!, match.score_a!];
              const leftTeam = hasScore ? winner : teamA;
              const rightTeam = hasScore ? loser : teamB;

              return (
                <div key={match.id} className="bg-white border border-gray-100 rounded-2xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 font-display font-black text-xs flex items-center justify-center">
                      #{idx + 1}
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-green-100 text-green-700 font-display font-black text-xs flex items-center justify-center">
                      C{match.court_id}
                    </div>
                    {hasScore ? (
                      <span className="font-display font-black text-gray-800 text-sm tabular-nums">
                        {wScore} – {lScore}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 font-display italic">No score</span>
                    )}
                    {match.ended_at && (
                      <span className="ml-auto text-[10px] text-gray-400 font-display">{formatTime(match.ended_at)}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className={`flex-1 rounded-xl px-2 py-1.5 ${hasScore ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-100"}`}>
                      <div className="flex -space-x-1 mb-1">
                        {leftTeam.map((m) => <Avatar key={m.id} name={m.name} memberType={m.member_type} size="xs" />)}
                      </div>
                      {leftTeam.map((m) => (
                        <div key={m.id} className={`text-xs font-display font-bold leading-tight ${hasScore ? "text-green-800" : "text-gray-700"}`}>
                          {m.name}
                        </div>
                      ))}
                      {hasScore && <span className="text-[10px] text-green-600 font-black">🏆 WIN</span>}
                    </div>
                    <div className="flex items-center text-gray-300 font-black text-xs">vs</div>
                    <div className="flex-1 rounded-xl px-2 py-1.5 bg-gray-50 border border-gray-100">
                      <div className="flex -space-x-1 mb-1">
                        {rightTeam.map((m) => <Avatar key={m.id} name={m.name} memberType={m.member_type} size="xs" />)}
                      </div>
                      {rightTeam.map((m) => (
                        <div key={m.id} className="text-xs font-display font-bold leading-tight text-gray-600">{m.name}</div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Check-ins tab */}
      {tab === "checkins" && (
        summary.queue.length === 0 ? (
          <div className="text-center py-8 text-gray-400 font-display font-bold">No check-ins recorded</div>
        ) : (
          <div className="space-y-1.5">
            {summary.queue.map((q, idx) => (
              <div key={q.member_id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-3 py-2.5">
                <div className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 font-display font-black text-xs flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </div>
                <Avatar name={q.name} memberType={q.member_type as any} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-gray-800 text-sm truncate">{q.name}</div>
                  {q.member_type === "guest" && (
                    <div className="text-[10px] text-purple-500 font-display font-bold">Guest</div>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 font-display">{formatTime(q.checked_in_at)}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function SessionRow({ session, members, isOpen, onToggle, onDelete }: {
  session: Session;
  members: Record<string, Member>;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this session? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await sessionsApi.delete(session.id);
      onDelete();
    } finally {
      setDeleting(false);
    }
  }

  async function loadSummary() {
    if (summary) { onToggle(); return; }
    setLoading(true);
    try {
      const data = await sessionsApi.summary(session.id);
      setSummary(data);
      onToggle();
    } finally {
      setLoading(false);
    }
  }

  const completedCount = summary?.matches.filter((m) => m.result === "complete").length ?? null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={loadSummary}
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
          <div className="flex gap-1.5">
            <span className="badge bg-green-100 text-green-700 text-xs px-2 py-0.5 font-bold">
              {session.num_courts} court{session.num_courts !== 1 ? "s" : ""}
            </span>
            {completedCount !== null && (
              <span className="badge bg-orange-100 text-orange-700 text-xs px-2 py-0.5 font-bold">
                {completedCount} match{completedCount !== 1 ? "es" : ""}
              </span>
            )}
          </div>
          {loading ? (
            <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
          ) : isOpen ? (
            <ChevronDown size={16} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-1 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
            title="Delete session"
          >
            {deleting ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </button>

      {isOpen && summary && (
        <div className="border-t border-gray-100 p-4">
          <SessionDetailPanel summary={summary} members={members} />
        </div>
      )}
    </div>
  );
}

export default function SessionHistoryView() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [sessionsRes, membersRes] = await Promise.all([
          sessionsApi.list(),
          membersApi.list(),
        ]);
        setSessions(sessionsRes.sessions);
        const map: Record<string, Member> = {};
        membersRes.members.forEach((m) => { map[m.id] = m; });
        setMembers(map);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, rgb(var(--p-50)) 0%, rgb(var(--p-100)) 50%, rgb(var(--p-100)) 100%)" }}>
      {/* Header */}
      <header
        className="flex items-center gap-4 px-6 py-0 flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 70%, rgb(var(--p-500)) 100%)",
          minHeight: "72px",
        }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl text-sm font-display font-bold border border-white/20 transition-all"
        >
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 rounded-xl p-1.5">
            <ShuttlecockIcon size={28} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-lg leading-tight">Session History</h1>
            <p className="text-orange-200 text-xs font-display">Past club nights</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="bg-white/15 rounded-xl px-4 py-2 text-center">
            <div className="text-white font-display font-black text-xl leading-none">{sessions.length}</div>
            <div className="text-orange-200 text-xs font-display font-bold">Sessions</div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-4 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-gray-500 font-display font-bold text-sm">Loading sessions…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-50">
            <span className="text-5xl">🏸</span>
            <p className="text-gray-600 font-display font-bold text-base">No past sessions yet</p>
            <p className="text-gray-500 font-display text-sm">Start a club night to see history here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                members={members}
                isOpen={openId === session.id}
                onToggle={() => setOpenId(openId === session.id ? null : session.id)}
                onDelete={() => setSessions((prev) => prev.filter((s) => s.id !== session.id))}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
