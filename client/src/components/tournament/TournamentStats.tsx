import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Swords, Users, Hash, Flame, Zap, Crown, Activity } from "lucide-react";
import type { Court, Match, Member, Tournament, TournamentFixture, TournamentPlayer } from "../../types";
import type { GroupStanding } from "../../utils/tournament";

interface Props {
  tournament: Tournament;
  fixtures: TournamentFixture[];
  players: TournamentPlayer[];
  standingsByGroup: Record<number, GroupStanding[]>;
  matches: Match[];
  members: Record<string, Member>;
  courts: Court[];
}

function firstNames(ids: [string, string], members: Record<string, Member>) {
  return ids.map((id) => members[id]?.name?.split(" ")[0] ?? "?").join(" & ");
}

export default function TournamentStats({ tournament, fixtures, players, standingsByGroup, matches, members, courts }: Props) {
  const real = fixtures.filter((f) => f.team_a && f.team_b); // byes don't count as matches
  const done = real.filter((f) => f.status === "complete");
  const live = real.filter((f) => f.status === "active");

  const matchIds = new Set(fixtures.map((f) => f.match_id).filter(Boolean));
  const played = matches.filter((m) => matchIds.has(m.id) && m.result === "complete" && m.score_a != null && m.score_b != null);
  const points = played.reduce((n, m) => n + m.score_a! + m.score_b!, 0);

  let closest: Match | null = null;
  let biggest: Match | null = null;
  for (const m of played) {
    const d = Math.abs(m.score_a! - m.score_b!);
    if (!closest || d < Math.abs(closest.score_a! - closest.score_b!)) closest = m;
    if (!biggest || d > Math.abs(biggest.score_a! - biggest.score_b!)) biggest = m;
  }
  const scoreline = (m: Match) => {
    const aWon = m.score_a! > m.score_b!;
    const w = aWon ? m.team_a : m.team_b;
    return `${firstNames(w, members)} ${Math.max(m.score_a!, m.score_b!)}-${Math.min(m.score_a!, m.score_b!)}`;
  };

  // Best record across all groups: most wins with no losses, ties broken by point diff.
  let form: GroupStanding | null = null;
  for (const rows of Object.values(standingsByGroup)) {
    for (const r of rows) {
      if (r.wins === 0) continue;
      if (!form || r.wins > form.wins || (r.wins === form.wins && r.losses < form.losses) || (r.wins === form.wins && r.losses === form.losses && r.pointDiff > form.pointDiff)) form = r;
    }
  }

  const busyCourts = courts.filter((c) => c.status !== "idle").length;
  const playerCount = players.filter((p) => p.pair_index != null).length;
  const pct = real.length ? Math.round((done.length / real.length) * 100) : 0;

  const tiles: Array<{ icon: ReactNode; label: string; value: string; sub?: string; tone: string }> = [
    { icon: <Swords size={16} />, label: "Matches", value: `${done.length} / ${real.length}`, sub: `${pct}% played`, tone: "text-violet-600 bg-violet-50" },
    { icon: <Activity size={16} />, label: "On court", value: `${live.length}`, sub: `${busyCourts} of ${courts.length} courts busy`, tone: "text-amber-600 bg-amber-50" },
    { icon: <Users size={16} />, label: "Players", value: `${playerCount}`, sub: `${tournament.num_groups} groups`, tone: "text-blue-600 bg-blue-50" },
    { icon: <Hash size={16} />, label: "Points scored", value: points.toLocaleString(), sub: played.length ? `${Math.round(points / played.length)} per match` : "—", tone: "text-gray-700 bg-gray-100" },
    { icon: <Zap size={16} />, label: "Closest game", value: closest ? scoreline(closest) : "—", tone: "text-red-600 bg-red-50" },
    { icon: <Flame size={16} />, label: "Biggest win", value: biggest ? scoreline(biggest) : "—", tone: "text-orange-600 bg-orange-50" },
    { icon: <Crown size={16} />, label: "Best form", value: form ? firstNames(form.pair, members) : "—", sub: form ? `${form.wins}-${form.losses}, +${form.pointDiff}` : undefined, tone: "text-emerald-600 bg-emerald-50" },
  ];

  return (
    <div className="flex items-stretch gap-2 px-5 py-2 bg-white border-b border-gray-100 overflow-x-auto flex-shrink-0">
      {tiles.map((t) => (
        <div key={t.label} className="flex items-center gap-2.5 min-w-[170px] flex-1 rounded-xl border border-gray-100 px-3 py-1.5">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${t.tone}`}>{t.icon}</span>
          <div className="min-w-0 leading-tight">
            <div className="text-[10px] font-display font-semibold uppercase tracking-widest text-gray-400 truncate">{t.label}</div>
            <motion.div
              key={t.value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display font-bold text-base text-gray-800 tabular-nums truncate"
            >
              {t.value}
            </motion.div>
            {t.sub && <div className="text-[11px] font-body text-gray-400 truncate">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
