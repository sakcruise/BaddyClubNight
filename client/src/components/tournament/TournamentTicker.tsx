import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Court, Match, Member, Tournament, TournamentFixture } from "../../types";
import type { GroupStanding } from "../../utils/tournament";

type Members = Record<string, Member>;

interface Props {
  tournament: Tournament;
  fixtures: TournamentFixture[];
  standingsByGroup: Record<number, GroupStanding[]>;
  matches: Match[];
  members: Members;
  courts: Court[];
}

const ROTATE_MS = 7000;

const BANTER = [
  "Shuttle count: rising. Dignity: falling.",
  "It's only a game. Unless you're losing, in which case it's a tragedy.",
  "Reminder: the net is not a suggestion.",
  "Whoever said 'it's the taking part that counts' was clearly 0-3 down.",
  "Hydrate. Then blame the shuttle.",
  "Line calls are final. Arguments are free.",
  "Someone is about to serve into the net. We all feel it.",
  "Warm-ups are over. Excuses are still open.",
  "If you're not sweating, you're not trying. Or you're on the bench.",
  "Every smash you miss is a story for the pub.",
];

function firstNames(ids: [string, string], members: Members) {
  return ids.map((id) => members[id]?.name?.split(" ")[0] ?? "?").join(" & ");
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/** Build every commentary line the current state supports, then rotate through them. */
function buildLines(p: Props, tick: number): string[] {
  const { tournament, fixtures, standingsByGroup, matches, members, courts } = p;
  const lines: string[] = [];
  const name = (pair: [string, string] | null) => (pair ? firstNames(pair, members) : "?");

  // What's on court right now
  const live = fixtures.filter((f) => f.status === "active");
  for (const f of live) {
    const m = matches.find((x) => x.id === f.match_id);
    const where = m ? `Court ${m.court_id}` : "On court";
    const openers = [
      `${where}: ${name(f.team_a)} vs ${name(f.team_b)}. Somebody's going home unhappy.`,
      `${where}: ${name(f.team_a)} vs ${name(f.team_b)}. Bring popcorn.`,
      `${where} is heating up — ${name(f.team_a)} against ${name(f.team_b)}.`,
    ];
    lines.push(pick(openers, tick + f.id.length));
  }

  const groupFixtures = fixtures.filter((f) => f.stage === "group");
  const groupDone = groupFixtures.filter((f) => f.status === "complete").length;
  const groupLeft = groupFixtures.length - groupDone;

  if (tournament.status === "groups") {
    if (groupDone === 0) lines.push("Nothing played yet. The calm before the smash.");
    else if (groupLeft > 0) lines.push(`${groupDone} group ${groupDone === 1 ? "match" : "matches"} done, ${groupLeft} to go. Pace yourselves.`);
    else lines.push("Group stage complete! Someone press the big Generate Knockout button.");

    for (let g = 0; g < tournament.num_groups; g++) {
      const rows = standingsByGroup[g] ?? [];
      const played = rows.reduce((n, r) => n + r.wins + r.losses, 0);
      if (played === 0) {
        lines.push(pick([
          `Group ${g + 1} haven't hit a shuttle yet. Warm-up's over, folks.`,
          `Group ${g + 1}: all talk, no matches. Yet.`,
        ], tick + g));
        continue;
      }
      const top = rows[0];
      if (top && top.wins > 0 && top.losses === 0) {
        lines.push(pick([
          `${name(top.pair)} are unbeaten in Group ${g + 1}. Cruising.`,
          `Group ${g + 1} belongs to ${name(top.pair)} right now — ${top.wins} up, none down.`,
        ], tick + g * 3));
      } else if (top) {
        lines.push(`${name(top.pair)} lead Group ${g + 1} on ${top.wins} ${top.wins === 1 ? "win" : "wins"}. Just.`);
      }
      const bottom = rows[rows.length - 1];
      if (bottom && bottom.losses >= 2 && bottom.wins === 0) {
        lines.push(pick([
          `${name(bottom.pair)}: ${bottom.losses} played, ${bottom.losses} lost. Character building.`,
          `Thoughts and prayers for ${name(bottom.pair)} in Group ${g + 1}.`,
        ], tick + g * 7));
      }
      if (rows.length >= 2 && rows[0].wins === rows[1].wins && rows[0].wins > 0) {
        lines.push(`Group ${g + 1} is a dead heat: ${name(rows[0].pair)} and ${name(rows[1].pair)} level on wins.`);
      }
    }
  }

  // Byes
  const byes = fixtures.filter((f) => f.stage === "knockout" && f.team_a && !f.team_b);
  for (const f of byes) {
    lines.push(pick([
      `${name(f.team_a)} got a bye. Easiest match of the night.`,
      `${name(f.team_a)} advance without lifting a racket. Jammy.`,
    ], tick + f.id.length));
  }

  // Scores: nailbiters and demolitions
  const completed = matches.filter((m) => m.result === "complete" && m.score_a != null && m.score_b != null);
  if (completed.length > 0) {
    const byDiff = [...completed].sort(
      (a, b) => Math.abs(a.score_a! - a.score_b!) - Math.abs(b.score_a! - b.score_b!)
    );
    const closest = byDiff[0];
    const closestDiff = Math.abs(closest.score_a! - closest.score_b!);
    if (closestDiff <= 2) {
      const winner = closest.score_a! > closest.score_b! ? closest.team_a : closest.team_b;
      const loser = closest.score_a! > closest.score_b! ? closest.team_b : closest.team_a;
      lines.push(`Nailbiter: ${name(winner)} edged ${name(loser)} ${Math.max(closest.score_a!, closest.score_b!)}-${Math.min(closest.score_a!, closest.score_b!)}. Hearts still racing.`);
    }
    const widest = byDiff[byDiff.length - 1];
    const widestDiff = Math.abs(widest.score_a! - widest.score_b!);
    if (widestDiff >= 8) {
      const winner = widest.score_a! > widest.score_b! ? widest.team_a : widest.team_b;
      const loser = widest.score_a! > widest.score_b! ? widest.team_b : widest.team_a;
      lines.push(`Demolition job: ${name(winner)} took ${name(loser)} apart ${Math.max(widest.score_a!, widest.score_b!)}-${Math.min(widest.score_a!, widest.score_b!)}.`);
    }
    const last = [...completed].sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""))[0];
    if (last) {
      const winner = last.score_a! > last.score_b! ? last.team_a : last.team_b;
      lines.push(`Latest result: ${name(winner)} win ${Math.max(last.score_a!, last.score_b!)}-${Math.min(last.score_a!, last.score_b!)}.`);
    }
  }

  // Knockout progress
  if (tournament.status === "knockout") {
    const ko = fixtures.filter((f) => f.stage === "knockout");
    const maxRound = Math.max(...ko.map((f) => f.round), 0);
    const current = ko.filter((f) => f.round === maxRound); // byes included: round size decides the label
    if (current.length === 1) {
      const f = current[0];
      lines.push(f.status === "complete"
        ? "The final is done. Somebody get the trophy."
        : `FINAL TIME. ${name(f.team_a)} vs ${name(f.team_b)}. No pressure.`);
    } else if (current.length === 2) {
      lines.push("Semi-finals. Two matches from glory, one from the bar.");
    } else {
      const pending = current.filter((f) => f.status === "pending" && f.team_b).length;
      if (pending > 0) lines.push(`Knockout time: ${pending} ${pending === 1 ? "match" : "matches"} waiting for a court. Chop chop.`);
    }
  }

  if (tournament.status === "complete") {
    const finalF = fixtures.filter((f) => f.stage === "knockout").sort((a, b) => b.round - a.round)[0];
    const m = finalF ? matches.find((x) => x.id === finalF.match_id) : undefined;
    if (finalF && m && m.score_a != null && m.score_b != null) {
      const champs = m.score_a > m.score_b ? finalF.team_a : finalF.team_b;
      lines.push(`🏆 Champions: ${name(champs)}! Drinks are on them.`);
    } else {
      lines.push("🏆 Tournament complete! Take a bow, everyone.");
    }
  }

  // Courts
  const idle = courts.filter((c) => c.status === "idle").length;
  if (idle === 0 && courts.length > 0) lines.push("Every court is busy. This is what peak badminton looks like.");
  else if (idle === courts.length && courts.length > 0 && tournament.status !== "complete") lines.push(`${idle} empty ${idle === 1 ? "court" : "courts"}. Shuttles don't hit themselves.`);

  lines.push(pick(BANTER, tick * 13));
  return lines;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function elapsedLabel(from: string, now: Date) {
  const ms = Math.max(0, now.getTime() - new Date(from).getTime());
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export default function TournamentTicker(props: Props) {
  const now = useClock();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  // Rebuild the pool only when state changes; the tick just walks through it.
  const pool = useMemo(
    () => buildLines(props, Math.floor(tick / 5)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.fixtures, props.standingsByGroup, props.matches, props.courts, props.tournament.status, Math.floor(tick / 5)]
  );
  const line = pool.length > 0 ? pool[tick % pool.length] : "";

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex items-stretch gap-0 bg-gray-900 text-white overflow-hidden flex-shrink-0">
      {/* LIVE badge */}
      <div className="flex items-center gap-2 px-4 bg-red-600 flex-shrink-0">
        <motion.span
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="w-2 h-2 rounded-full bg-white"
        />
        <span className="text-[11px] font-display font-black uppercase tracking-[0.2em]">Live</span>
      </div>

      {/* Rotating commentary */}
      <div className="relative flex-1 min-w-0 h-11 flex items-center px-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={`${tick}-${line}`}
            initial={{ y: 22, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -22, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="font-display font-bold text-sm truncate w-full"
          >
            {line}
          </motion.p>
        </AnimatePresence>
        <motion.div
          key={tick}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: ROTATE_MS / 1000, ease: "linear" }}
          className="absolute left-0 bottom-0 h-0.5 w-full bg-violet-400 origin-left opacity-60"
        />
      </div>

      {/* Clock */}
      <div className="flex items-center gap-4 px-4 border-l border-white/10 flex-shrink-0 tabular-nums">
        <div className="text-right leading-tight">
          <div className="text-[9px] font-display font-bold uppercase tracking-widest text-white/50">Running</div>
          <div className="font-display font-black text-sm text-violet-300">{elapsedLabel(props.tournament.created_at, now)}</div>
        </div>
        <div className="font-display font-black text-xl tracking-wide">{time}</div>
      </div>
    </div>
  );
}
