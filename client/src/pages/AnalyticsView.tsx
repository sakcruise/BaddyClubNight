import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore, useMemberStore } from "../store";
import { sessionsApi, matchesApi, queueApi } from "../services/api";
import type { Session, Match } from "../types";
import { ArrowLeft, Download, ShoppingBag, LayoutGrid, Clock, Users, TrendingUp } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionSummary {
  session: Session;
  matches: Match[];
  queue: { member_id: string; checked_in_at: string; position: number; name: string; member_type: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt2(n: number) { return n.toFixed(2); }
function fmtMin(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function sessionDurationMins(s: Session) {
  // Use nightStart/nightEnd from session date if possible, otherwise 3h default
  return 180;
}
function matchDurationSecs(m: Match): number {
  if (!m.started_at || !m.ended_at) return 0;
  return Math.round((new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()) / 1000);
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, colour = "orange", icon }: {
  label: string; value: string | number; sub?: string; colour?: string; icon?: React.ReactNode;
}) {
  const colours: Record<string, string> = {
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    green:  "bg-green-50  border-green-200  text-green-700",
    blue:   "bg-blue-50   border-blue-200   text-blue-700",
    amber:  "bg-amber-50  border-amber-200  text-amber-700",
    red:    "bg-red-50    border-red-200    text-red-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${colours[colour] ?? colours.orange}`}>
      <div className="flex items-center gap-2 opacity-70 text-xs font-display font-bold uppercase tracking-wider">
        {icon}{label}
      </div>
      <div className="font-display font-black text-2xl">{value}</div>
      {sub && <div className="text-xs font-display font-semibold opacity-60">{sub}</div>}
    </div>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs font-display font-bold transition-all whitespace-nowrap
        ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
    >
      {children}
    </button>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = "shuttles" | "courts" | "players" | "guests" | "trends";

// ─── Shuttles Tab ────────────────────────────────────────────────────────────

function ShuttlesTab({ sessions, tubePrice, budgetTubes }: {
  sessions: SessionSummary[];
  tubePrice: number;
  budgetTubes: number;
}) {
  const totalBySession = sessions.map((s) => ({
    date: s.session.date,
    id: s.session.id,
    tubes: s.matches.reduce((a, m) => a + ((m as any).shuttles_used ?? 0), 0),
    matches: s.matches.length,
  }));

  const allTubes = totalBySession.reduce((a, s) => a + s.tubes, 0);
  const avgTubes = totalBySession.length ? allTubes / totalBySession.length : 0;
  const lastNight = totalBySession[0];
  const lastTubes = lastNight?.tubes ?? 0;
  const overBudget = lastTubes > budgetTubes;

  // Per-court breakdown for latest session
  const latestSession = sessions[0];
  const courtUsage = latestSession ? Object.entries(
    latestSession.matches.reduce((acc, m) => {
      const c = `Court ${m.court_id}`;
      acc[c] = (acc[c] ?? 0) + ((m as any).shuttles_used ?? 0);
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Last Night" value={`${lastTubes} tubes`}
          sub={`£${fmt2(lastTubes * tubePrice)}`}
          colour={overBudget ? "red" : "green"} icon="🏸" />
        <StatCard label="Budget" value={`${budgetTubes} tubes`}
          sub={`£${fmt2(budgetTubes * tubePrice)}/night`}
          colour="amber" icon="💰" />
        <StatCard label="Avg per Night" value={`${avgTubes.toFixed(1)} tubes`}
          sub={`£${fmt2(avgTubes * tubePrice)} avg cost`}
          colour="blue" icon="📊" />
        <StatCard label="Total Spend" value={`£${fmt2(allTubes * tubePrice)}`}
          sub={`${allTubes} tubes all time`}
          colour="orange" icon="💸" />
      </div>

      {/* Budget alert */}
      {overBudget && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-display font-black text-red-800 text-sm">Over budget last night!</p>
            <p className="text-red-600 text-xs font-display mt-0.5">
              Used {lastTubes} tubes vs budget of {budgetTubes} ({lastTubes - budgetTubes} over · £{fmt2((lastTubes - budgetTubes) * tubePrice)} extra)
            </p>
          </div>
        </div>
      )}

      {/* Per-court breakdown */}
      {courtUsage.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
          <p className="font-display font-bold text-sm text-gray-700">🏟️ Shuttle use by court (last night)</p>
          {courtUsage.map(([court, tubes]) => (
            <div key={court} className="flex items-center gap-3">
              <span className="text-xs font-display font-bold text-gray-500 w-16">{court}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full"
                  style={{ width: `${Math.min(100, (tubes / (lastTubes || 1)) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-display font-black text-gray-700 w-16 text-right">{tubes} tube{tubes !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* History table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="font-display font-bold text-sm text-gray-700">📅 Night-by-night history</p>
        </div>
        {totalBySession.length === 0 ? (
          <p className="text-center text-gray-400 font-display text-sm py-8">No data yet — add shuttle counts when completing matches</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-display font-bold text-gray-500">Date</th>
                <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Matches</th>
                <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Tubes</th>
                <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Cost</th>
                <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">vs Budget</th>
              </tr>
            </thead>
            <tbody>
              {totalBySession.map((row) => {
                const diff = row.tubes - budgetTubes;
                return (
                  <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-display font-bold text-gray-800 text-xs">{row.date}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500 font-display">{row.matches}</td>
                    <td className="px-4 py-2.5 text-right font-display font-black text-gray-800 text-xs">{row.tubes}</td>
                    <td className="px-4 py-2.5 text-right font-display font-bold text-gray-700 text-xs">£{fmt2(row.tubes * tubePrice)}</td>
                    <td className={`px-4 py-2.5 text-right font-display font-black text-xs ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                      {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Courts Tab ──────────────────────────────────────────────────────────────

function CourtsTab({ sessions }: { sessions: SessionSummary[] }) {
  const latestSession = sessions[0];
  const allMatches = sessions.flatMap((s) => s.matches.filter((m) => m.started_at && m.ended_at));

  // Average match duration
  const avgDurSecs = allMatches.length
    ? allMatches.reduce((a, m) => a + matchDurationSecs(m), 0) / allMatches.length
    : 0;

  // Per-court stats across all sessions
  const courtStats = Object.entries(
    allMatches.reduce((acc, m) => {
      const c = m.court_id;
      if (!acc[c]) acc[c] = { matches: 0, totalSecs: 0 };
      acc[c].matches++;
      acc[c].totalSecs += matchDurationSecs(m);
      return acc;
    }, {} as Record<number, { matches: number; totalSecs: number }>)
  ).map(([courtId, stats]) => ({
    courtId: Number(courtId),
    matches: stats.matches,
    avgDurSecs: stats.totalSecs / stats.matches,
    totalSecs: stats.totalSecs,
  })).sort((a, b) => a.courtId - b.courtId);

  // Tonight's utilisation (latest session)
  const tonightMatches = latestSession?.matches.filter((m) => m.started_at && m.ended_at) ?? [];
  const sessionSecs = 180 * 60; // 3h default
  const courtUtilisation = Object.entries(
    tonightMatches.reduce((acc, m) => {
      const c = m.court_id;
      acc[c] = (acc[c] ?? 0) + matchDurationSecs(m);
      return acc;
    }, {} as Record<number, number>)
  ).map(([c, secs]) => ({ courtId: Number(c), pct: Math.min(100, Math.round((secs / sessionSecs) * 100)) }))
    .sort((a, b) => a.courtId - b.courtId);

  // Recommendation: based on last 4 sessions, how many courts were needed
  const recentPlayerCounts = sessions.slice(0, 4).map((s) => s.queue.length);
  const avgPlayers = recentPlayerCounts.length
    ? recentPlayerCounts.reduce((a, b) => a + b, 0) / recentPlayerCounts.length
    : 0;
  const recommendedCourts = Math.ceil(avgPlayers / 4);

  // End-time alert (if latest session has active matches)
  const latestSessionMatches = latestSession?.matches ?? [];
  const pendingMatches = latestSessionMatches.filter((m) => m.result === "pending");
  const avgDurMins = avgDurSecs / 60;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Avg Match Duration" value={fmtMin(Math.round(avgDurSecs))} sub="all time" colour="blue" icon="⏱️" />
        <StatCard label="Total Matches" value={allMatches.length} sub="all sessions" colour="green" icon="🏸" />
        <StatCard label="Recommended Courts" value={`${recommendedCourts} courts`}
          sub={`based on ~${Math.round(avgPlayers)} avg players`} colour="orange" icon="🏟️" />
        <StatCard label="Active Now" value={`${pendingMatches.length} matches`}
          sub={latestSession ? `on ${latestSession.session.date}` : "no active session"} colour="amber" icon="🔴" />
      </div>

      {/* Court utilisation - tonight */}
      {courtUtilisation.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
          <p className="font-display font-bold text-sm text-gray-700">🏟️ Court utilisation (last night)</p>
          {courtUtilisation.map(({ courtId, pct }) => (
            <div key={courtId} className="flex items-center gap-3">
              <span className="text-xs font-display font-bold text-gray-500 w-16">Court {courtId}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${pct >= 70 ? "bg-green-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-display font-black text-gray-700 w-10 text-right">{pct}%</span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 font-display">Based on 3-hour session. Green = &gt;70% active, amber = 40–70%, red = &lt;40%</p>
        </div>
      )}

      {/* End-time prediction */}
      {pendingMatches.length > 0 && avgDurMins > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">🕐</span>
          <div>
            <p className="font-display font-black text-blue-800 text-sm">Estimated finish</p>
            <p className="text-blue-600 text-xs font-display mt-0.5">
              {pendingMatches.length} match{pendingMatches.length !== 1 ? "es" : ""} in progress · avg {Math.round(avgDurMins)} min each
            </p>
          </div>
        </div>
      )}

      {/* Per-court breakdown */}
      {courtStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-display font-bold text-sm text-gray-700">📊 Court stats (all time)</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-display font-bold text-gray-500">Court</th>
                <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Matches</th>
                <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {courtStats.map((row) => (
                <tr key={row.courtId} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-display font-black text-gray-800 text-xs">Court {row.courtId}</td>
                  <td className="px-4 py-2.5 text-right font-display text-gray-600 text-xs">{row.matches}</td>
                  <td className="px-4 py-2.5 text-right font-display font-black text-gray-700 text-xs">{fmtMin(Math.round(row.avgDurSecs))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Players Tab ─────────────────────────────────────────────────────────────

function PlayersTab({ sessions, members }: {
  sessions: SessionSummary[];
  members: Record<string, import("../types").Member>;
}) {
  // Wait time = time from checked_in_at to first match involving that player
  const playerStats = useMemo(() => {
    const stats: Record<string, { name: string; totalWaitSecs: number; sessions: number; nightsPlayed: Set<string>; memberType: string }> = {};

    for (const s of sessions) {
      const sessionDate = s.session.date;
      const memberMatches: Record<string, number> = {}; // memberId → first match startedAt

      for (const m of s.matches) {
        if (!m.started_at) continue;
        const t = new Date(m.started_at).getTime();
        [...m.team_a, ...m.team_b].forEach((id) => {
          if (!memberMatches[id] || t < memberMatches[id]) memberMatches[id] = t;
        });
      }

      for (const q of s.queue) {
        if (!stats[q.member_id]) {
          stats[q.member_id] = {
            name: members[q.member_id]?.name ?? q.name,
            totalWaitSecs: 0,
            sessions: 0,
            nightsPlayed: new Set(),
            memberType: q.member_type,
          };
        }
        stats[q.member_id].sessions++;
        stats[q.member_id].nightsPlayed.add(sessionDate);

        const checkedIn = new Date(q.checked_in_at).getTime();
        const firstMatchTime = memberMatches[q.member_id];
        if (firstMatchTime && firstMatchTime > checkedIn) {
          stats[q.member_id].totalWaitSecs += Math.round((firstMatchTime - checkedIn) / 1000);
        }
      }
    }

    return Object.entries(stats)
      .filter(([, s]) => s.memberType !== "guest")
      .map(([id, s]) => ({
        id,
        name: s.name,
        avgWaitSecs: s.sessions > 0 ? s.totalWaitSecs / s.sessions : 0,
        totalWaitSecs: s.totalWaitSecs,
        sessions: s.sessions,
        nightsPlayed: s.nightsPlayed.size,
        memberType: s.memberType,
      }))
      .sort((a, b) => b.avgWaitSecs - a.avgWaitSecs);
  }, [sessions, members]);

  const highWaiter = playerStats[0];
  const [view, setView] = useState<"session" | "player">("session");

  // Per-session wait data
  const sessionWaits = sessions.map((s) => ({
    date: s.session.date,
    avgSecs: avgWaitSecsForSession(s),
    players: s.queue.filter((q) => q.member_type !== "guest").length,
    matches: s.matches.length,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        <button onClick={() => setView("session")}
          className={`flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all
            ${view === "session" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          📅 By Session
        </button>
        <button onClick={() => setView("player")}
          className={`flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all
            ${view === "player" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          👤 By Player
        </button>
      </div>

      {view === "session" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Best Night" value={fmtMin(Math.round(Math.min(...sessionWaits.filter(s => s.avgSecs > 0).map(s => s.avgSecs), Infinity) || 0))}
              sub="shortest avg wait" colour="green" icon="⚡" />
            <StatCard label="Worst Night" value={fmtMin(Math.round(Math.max(...sessionWaits.map(s => s.avgSecs), 0)))}
              sub="longest avg wait" colour="red" icon="⌛" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-display font-bold text-sm text-gray-700">⌛ Avg wait time per session</p>
              <p className="text-[10px] text-gray-400 font-display mt-0.5">Time from check-in to first match on court</p>
            </div>
            {sessionWaits.length === 0 ? (
              <p className="text-center text-gray-400 font-display text-sm py-8">No data yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-display font-bold text-gray-500">Date</th>
                    <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Players</th>
                    <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Matches</th>
                    <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Avg Wait</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionWaits.map((row) => (
                    <tr key={row.date} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-display font-bold text-gray-800 text-xs">{row.date}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500 font-display">{row.players}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-600 font-display">{row.matches}</td>
                      <td className={`px-4 py-2.5 text-right font-display font-black text-xs
                        ${row.avgSecs > 1800 ? "text-red-500" : row.avgSecs > 900 ? "text-amber-600" : "text-green-600"}`}>
                        {row.avgSecs > 0 ? fmtMin(Math.round(row.avgSecs)) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === "player" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Longest Avg Wait" value={highWaiter ? fmtMin(Math.round(highWaiter.avgWaitSecs)) : "—"}
              sub={highWaiter?.name} colour="red" icon="🔥" />
            <StatCard label="Players Tracked" value={playerStats.length} sub="across all sessions" colour="blue" icon="👥" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-display font-bold text-sm text-gray-700">⌛ Wait time by player</p>
              <p className="text-[10px] text-gray-400 font-display">🔥 = waited longest</p>
            </div>
            {playerStats.length === 0 ? (
              <p className="text-center text-gray-400 font-display text-sm py-8">No wait time data yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-display font-bold text-gray-500">Player</th>
                    <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Nights</th>
                    <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Avg Wait</th>
                    <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((p, idx) => (
                    <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-display font-bold text-gray-800 text-xs">{p.name}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500 font-display">{p.nightsPlayed}</td>
                      <td className="px-4 py-2.5 text-right font-display font-black text-gray-700 text-xs">
                        {p.avgWaitSecs > 0 ? fmtMin(Math.round(p.avgWaitSecs)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        {idx === 0 && <span title="Longest waiter — priority next!">🔥</span>}
                        {idx === 1 && <span title="Second longest waiter">⚠️</span>}
                        {p.avgWaitSecs > 1800 && idx > 1 && <span title="Waited over 30 mins on average">⏳</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Guests Tab ───────────────────────────────────────────────────────────────

function GuestsTab({ sessions, members }: {
  sessions: SessionSummary[];
  members: Record<string, import("../types").Member>;
}) {
  // Guest appearances across all sessions
  const guestHistory = sessions.flatMap((s) =>
    s.queue
      .filter((q) => q.member_type === "guest")
      .map((q) => ({ ...q, date: s.session.date, sessionId: s.session.id }))
  );

  // Unique guest names
  const uniqueGuests = [...new Map(guestHistory.map((g) => [g.member_id, g])).values()];

  // Guests who became members (member_type changed from guest to male/female)
  const convertedIds = uniqueGuests
    .filter((g) => members[g.member_id] && members[g.member_id].member_type !== "guest")
    .map((g) => g.member_id);

  // Which members bring most guests
  // (Can't track this without referral data — note for future)

  // Guests per night
  const guestsPerNight = sessions.map((s) => ({
    date: s.session.date,
    count: s.queue.filter((q) => q.member_type === "guest").length,
  }));

  const avgGuests = guestsPerNight.length
    ? guestsPerNight.reduce((a, b) => a + b.count, 0) / guestsPerNight.length
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Guest Visits" value={guestHistory.length} sub="all time" colour="purple" icon="👤" />
        <StatCard label="Unique Guests" value={uniqueGuests.length} sub="different people" colour="blue" icon="🆕" />
        <StatCard label="Avg per Night" value={avgGuests.toFixed(1)} sub="guests/session" colour="green" icon="📊" />
        <StatCard label="Converted" value={convertedIds.length}
          sub="guests who became members" colour="orange" icon="⭐" />
      </div>

      {/* Conversion rate */}
      {uniqueGuests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-2">
          <p className="font-display font-bold text-sm text-gray-700">📈 Guest → Member conversion</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full"
                style={{ width: `${Math.round((convertedIds.length / uniqueGuests.length) * 100)}%` }}
              />
            </div>
            <span className="font-display font-black text-sm text-gray-800">
              {Math.round((convertedIds.length / uniqueGuests.length) * 100)}%
            </span>
          </div>
          <p className="text-[10px] text-gray-400 font-display">
            {convertedIds.length} of {uniqueGuests.length} guests later joined as members
          </p>
        </div>
      )}

      {/* Guests per night table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="font-display font-bold text-sm text-gray-700">📅 Guests per night</p>
        </div>
        {guestsPerNight.length === 0 ? (
          <p className="text-center text-gray-400 font-display text-sm py-8">No guest data yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-display font-bold text-gray-500">Date</th>
                <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Guests</th>
              </tr>
            </thead>
            <tbody>
              {guestsPerNight.map((row) => (
                <tr key={row.date} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-display font-bold text-gray-800 text-xs">{row.date}</td>
                  <td className="px-4 py-2.5 text-right font-display font-black text-gray-700 text-xs">
                    {row.count > 0 ? `${row.count} guest${row.count !== 1 ? "s" : ""}` : <span className="text-gray-400">none</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────

function BarChart({ data, colour }: { data: { label: string; value: number; rawValue?: string }[]; colour: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const colourMap: Record<string, string> = {
    blue: "bg-blue-400", green: "bg-green-400", amber: "bg-amber-400", purple: "bg-purple-400",
  };
  const bar = colourMap[colour] ?? "bg-gray-400";

  return (
    <div className="flex items-end gap-2" style={{ height: 80 }}>
      {data.map((d) => {
        const pct = Math.max(4, Math.round((d.value / max) * 100));
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
            <span className="text-[9px] font-display font-black text-gray-600">{d.rawValue ?? d.value}</span>
            <div className={`w-full rounded-t-md ${bar}`} style={{ height: `${pct}%` }} />
            <span className="text-[9px] font-display text-gray-400 truncate w-full text-center">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Compute average wait time in seconds for a single session
function avgWaitSecsForSession(s: SessionSummary): number {
  const memberFirstMatch: Record<string, number> = {};
  for (const m of s.matches) {
    if (!m.started_at) continue;
    const t = new Date(m.started_at).getTime();
    [...m.team_a, ...m.team_b].forEach((id) => {
      if (!memberFirstMatch[id] || t < memberFirstMatch[id]) memberFirstMatch[id] = t;
    });
  }
  const waits: number[] = [];
  for (const q of s.queue) {
    const checkedIn = new Date(q.checked_in_at).getTime();
    const firstMatch = memberFirstMatch[q.member_id];
    if (firstMatch && firstMatch > checkedIn) {
      waits.push((firstMatch - checkedIn) / 1000);
    }
  }
  return waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
}

function TrendsTab({ sessions, tubePrice }: { sessions: SessionSummary[]; tubePrice: number }) {
  const last8 = sessions.slice(0, 8).reverse(); // oldest first for chart

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-gray-400 font-display font-bold">Last {last8.length} sessions</p>

      {/* Players per night */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <p className="font-display font-bold text-sm text-gray-700">👥 Attendance per night</p>
        <BarChart colour="blue" data={last8.map((s) => ({
          label: s.session.date.slice(5),
          value: s.queue.length,
        }))} />
      </div>

      {/* Matches per night */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <p className="font-display font-bold text-sm text-gray-700">🏸 Matches played per night</p>
        <BarChart colour="green" data={last8.map((s) => ({
          label: s.session.date.slice(5),
          value: s.matches.length,
        }))} />
      </div>

      {/* Average wait time per night */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <p className="font-display font-bold text-sm text-gray-700">⌛ Avg wait time per night</p>
        <BarChart colour="purple" data={last8.map((s) => {
          const secs = avgWaitSecsForSession(s);
          const mins = Math.round(secs / 60);
          return {
            label: s.session.date.slice(5),
            value: Math.round(secs),
            rawValue: secs > 0 ? `${mins}m` : "—",
          };
        })} />
        <p className="text-[10px] text-gray-400 font-display">Time from check-in to first match on court</p>
      </div>

      {/* Shuttle cost per night */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <p className="font-display font-bold text-sm text-gray-700">💸 Shuttle cost per night</p>
        <BarChart colour="amber" data={last8.map((s) => {
          const tubes = s.matches.reduce((a, m) => a + ((m as any).shuttles_used ?? 0), 0);
          return {
            label: s.session.date.slice(5),
            value: tubes,
            rawValue: tubes > 0 ? `£${fmt2(tubes * tubePrice)}` : "—",
          };
        })} />
        <p className="text-[10px] text-gray-400 font-display text-right">
          Total last {last8.length} nights: £{fmt2(last8.reduce((a, s) => {
            const t = s.matches.reduce((x, m) => x + ((m as any).shuttles_used ?? 0), 0);
            return a + t * tubePrice;
          }, 0))}
        </p>
      </div>

      {/* Summary table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="font-display font-bold text-sm text-gray-700">📊 Session summary</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-display font-bold text-gray-500">Date</th>
              <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Players</th>
              <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Matches</th>
              <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Avg Wait</th>
              <th className="text-right px-4 py-2 text-xs font-display font-bold text-gray-500">Cost</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const tubes = s.matches.reduce((a, m) => a + ((m as any).shuttles_used ?? 0), 0);
              const waitSecs = avgWaitSecsForSession(s);
              return (
                <tr key={s.session.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-display font-bold text-gray-800 text-xs">{s.session.date}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500 font-display">{s.queue.length}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-600 font-display">{s.matches.length}</td>
                  <td className="px-4 py-2.5 text-right font-display font-black text-xs text-purple-600">
                    {waitSecs > 0 ? `${Math.round(waitSecs / 60)}m` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-display font-black text-xs text-amber-700">
                    {tubes > 0 ? `£${fmt2(tubes * tubePrice)}` : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(sessions: SessionSummary[], tubePrice: number) {
  const rows = [
    ["Date", "Players", "Matches", "Shuttles Used", "Shuttle Cost (£)", "Guests", "Avg Match Duration (min)"].join(","),
    ...sessions.map((s) => {
      const tubes = s.matches.reduce((a, m) => a + ((m as any).shuttles_used ?? 0), 0);
      const guests = s.queue.filter((q) => q.member_type === "guest").length;
      const completedMatches = s.matches.filter((m) => m.started_at && m.ended_at);
      const avgDur = completedMatches.length
        ? (completedMatches.reduce((a, m) => a + matchDurationSecs(m), 0) / completedMatches.length / 60).toFixed(1)
        : "";
      return [s.session.date, s.queue.length, s.matches.length, tubes, (tubes * tubePrice).toFixed(2), guests, avgDur].join(",");
    }),
  ].join("\n");

  const blob = new Blob([rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `badminton-club-report-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function AnalyticsView() {
  const navigate = useNavigate();
  const { clubConfig } = useSessionStore();
  const { members } = useMemberStore();

  const [tab, setTab] = useState<Tab>("shuttles");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine || localStorage.getItem("offline-mode") === "true");

  const tubePrice = Number(clubConfig.shuttleTubePrice) || 2.50;
  const budgetTubes = Number(clubConfig.shuttleBudgetTubes) || 10;

  useEffect(() => {
    const up   = () => setIsOffline(localStorage.getItem("offline-mode") === "true");
    const down = () => setIsOffline(true);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { sessions: list } = await sessionsApi.list();
        const ended = list.filter((s) => s.status === "ended");
        const summaries = await Promise.all(
          ended.map(async (s) => {
            const [{ matches }, { queue }] = await Promise.all([
              matchesApi.list(s.id),
              queueApi.get(s.id),
            ]);
            return {
              session: s,
              matches,
              queue: queue.map((q) => ({
                member_id: q.member_id,
                checked_in_at: q.checked_in_at,
                position: q.position,
                name: q.member?.name ?? "Unknown",
                member_type: q.member?.member_type ?? "male",
              })),
            };
          })
        );
        setSessions(summaries.sort((a, b) => b.session.date.localeCompare(a.session.date)));
      } catch (e) {
        console.error("Analytics load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-black text-gray-900 text-lg leading-tight">Analytics</h1>
            <p className="text-xs text-gray-400 font-display">{clubConfig.name || "Club"} · all-time data</p>
          </div>
          <button
            onClick={() => exportCSV(sessions, tubePrice)}
            disabled={sessions.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600
                       font-display font-bold text-xs hover:bg-gray-200 disabled:opacity-40 transition-all"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 overflow-x-auto">
            <TabBtn active={tab === "shuttles"} onClick={() => setTab("shuttles")}><ShoppingBag size={12} className="inline mr-1" />Shuttles</TabBtn>
            <TabBtn active={tab === "courts"}   onClick={() => setTab("courts")}><LayoutGrid size={12} className="inline mr-1" />Courts</TabBtn>
            <TabBtn active={tab === "players"}  onClick={() => setTab("players")}><Clock size={12} className="inline mr-1" />Wait Times</TabBtn>
            <TabBtn active={tab === "guests"}   onClick={() => setTab("guests")}><Users size={12} className="inline mr-1" />Guests</TabBtn>
            <TabBtn active={tab === "trends"}   onClick={() => setTab("trends")}><TrendingUp size={12} className="inline mr-1" />Trends</TabBtn>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-4xl mb-3 animate-bounce">📊</div>
              <p className="font-display font-bold text-gray-500">Loading analytics…</p>
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-xs">
              <div className="text-4xl mb-3">📊</div>
              <p className="font-display font-black text-gray-700">No completed sessions yet</p>
              <p className="font-display text-gray-400 text-sm mt-1">
                {isOffline
                  ? "You're offline. If you've run nights offline, use Settings → Sync to Cloud to upload them, then come back here."
                  : "Run a club night and press End Night to see analytics here."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {tab === "shuttles" && <ShuttlesTab sessions={sessions} tubePrice={tubePrice} budgetTubes={budgetTubes} />}
            {tab === "courts"   && <CourtsTab sessions={sessions} />}
            {tab === "players"  && <PlayersTab sessions={sessions} members={members} />}
            {tab === "guests"   && <GuestsTab sessions={sessions} members={members} />}
            {tab === "trends"   && <TrendsTab sessions={sessions} tubePrice={tubePrice} />}
          </>
        )}
      </div>
    </div>
  );
}
