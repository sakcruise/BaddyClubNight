import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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

type Mood = "trophy" | "crown" | "fire" | "live" | "cheer" | "ouch" | "wink" | "banter";

// Lines are plain strings; the mood (and so the emoji/colour/animation) is read off the wording.
function moodOf(line: string): Mood {
  if (/champion|trophy|🏆/i.test(line)) return "trophy";
  if (/new leader|new boss|overtake|first blood/i.test(line)) return "crown";
  if (/nailbiter|final time|demolition|heating up/i.test(line)) return "fire";
  if (/^result|take it \d|full time|beat /i.test(line)) return "cheer";
  if (/^court \d|on court|popcorn|going home/i.test(line)) return "live";
  if (/unbeaten|cruising|belongs to|lead group|latest result|win \d/i.test(line)) return "cheer";
  if (/thoughts and prayers|character building|chop chop|haven't hit|all talk/i.test(line)) return "ouch";
  if (/bye|jammy|dead heat/i.test(line)) return "wink";
  return "banter";
}

const MOOD_STYLE: Record<Mood, { emoji: string; text: string; sweep: string }> = {
  trophy: { emoji: "🏆", text: "text-amber-700", sweep: "from-amber-200/0 via-amber-200/70 to-amber-200/0" },
  crown: { emoji: "👑", text: "text-amber-700", sweep: "from-amber-200/0 via-amber-200/70 to-amber-200/0" },
  fire: { emoji: "🔥", text: "text-red-600", sweep: "from-red-200/0 via-red-200/60 to-red-200/0" },
  live: { emoji: "🏸", text: "text-violet-900", sweep: "from-violet-200/0 via-violet-200/70 to-violet-200/0" },
  cheer: { emoji: "🎉", text: "text-emerald-700", sweep: "from-emerald-200/0 via-emerald-200/60 to-emerald-200/0" },
  ouch: { emoji: "😬", text: "text-gray-700", sweep: "from-gray-200/0 via-gray-200/70 to-gray-200/0" },
  wink: { emoji: "😉", text: "text-violet-800", sweep: "from-violet-200/0 via-violet-200/60 to-violet-200/0" },
  banter: { emoji: "💬", text: "text-violet-900", sweep: "from-violet-200/0 via-violet-200/50 to-violet-200/0" },
};

const CONFETTI = ["#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#3b82f6", "#ec4899"];

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
  const { fixtures, matches, standingsByGroup, members } = props;
  const now = useClock();

  // What's on screen: the text plus a counter that keys the animations.
  const [current, setCurrent] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const tick = current.n;

  // Rebuild the pool only when state changes; rotation just walks through it.
  const pool = useMemo(
    () => buildLines(props, Math.floor(tick / 5)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.fixtures, props.standingsByGroup, props.matches, props.courts, props.tournament.status, Math.floor(tick / 5)]
  );
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const poolIdx = useRef(0);

  // Event lines (results, leader changes) jump the queue and show immediately.
  const queue = useRef<string[]>([]);
  const timer = useRef<number>();

  const advance = useCallback(() => {
    const q = queue.current;
    const p = poolRef.current;
    const text = q.length > 0 ? q.shift()! : p.length > 0 ? p[poolIdx.current++ % p.length] : "";
    setCurrent((c) => ({ text, n: c.n + 1 }));
  }, []);

  const restartTimer = useCallback(() => {
    window.clearInterval(timer.current);
    timer.current = window.setInterval(advance, ROTATE_MS);
  }, [advance]);

  useEffect(() => {
    advance();
    restartTimer();
    return () => window.clearInterval(timer.current);
  }, [advance, restartTimer]);

  const announce = useCallback(
    (text: string) => {
      queue.current.push(text);
      advance();
      restartTimer();
    },
    [advance, restartTimer]
  );

  const pairLabel = (pair: [string, string] | null) => (pair ? firstNames(pair, members) : "?");

  // Results: announce each fixture the moment it turns complete (skipping what was
  // already complete when the ticker mounted, and re-announcing if a match is reset and replayed).
  const seenComplete = useRef<Set<string> | null>(null);
  useEffect(() => {
    const done = fixtures.filter((f) => f.status === "complete" && f.team_a && f.team_b);
    if (seenComplete.current === null) {
      seenComplete.current = new Set(done.map((f) => f.id));
      return;
    }
    const seen = seenComplete.current;
    const doneIds = new Set(done.map((f) => f.id));
    for (const id of Array.from(seen)) if (!doneIds.has(id)) seen.delete(id);

    for (const f of done) {
      if (seen.has(f.id)) continue;
      const m = matches.find((x) => x.id === f.match_id);
      if (!m || m.score_a == null || m.score_b == null) continue; // score not in yet; try on next update
      seen.add(f.id);
      const aWon = m.score_a > m.score_b;
      const winner = pairLabel(aWon ? f.team_a : f.team_b);
      const loser = pairLabel(aWon ? f.team_b : f.team_a);
      const hi = Math.max(m.score_a, m.score_b);
      const lo = Math.min(m.score_a, m.score_b);
      const where = f.stage === "group" && f.group_index != null ? ` in Group ${f.group_index + 1}` : f.stage === "knockout" ? " in the knockout" : "";
      const diff = hi - lo;
      const line =
        diff <= 2
          ? `Nailbiter${where}! ${winner} edge ${loser} ${hi}-${lo}. Breathe.`
          : diff >= 8
            ? `Demolition${where}! ${winner} crush ${loser} ${hi}-${lo}. Brutal.`
            : pick(
                [
                  `Result${where}: ${winner} beat ${loser} ${hi}-${lo}.`,
                  `${winner} take it ${hi}-${lo} over ${loser}${where}. Handshakes all round.`,
                  `Full time${where}: ${winner} ${hi}, ${loser} ${lo}. Better luck next game.`,
                ],
                f.id.length + hi
              );
      announce(line);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures, matches]);

  // Leader changes: announce when the pair at the top of a group changes hands.
  const leaders = useRef<Record<number, string> | null>(null);
  useEffect(() => {
    const nowLeaders: Record<number, string> = {};
    const nameOf: Record<string, string> = {};
    for (const [g, rows] of Object.entries(standingsByGroup)) {
      const top = rows[0];
      if (top && top.wins + top.losses > 0) {
        const key = [...top.pair].sort().join("|");
        nowLeaders[Number(g)] = key;
        nameOf[key] = pairLabel(top.pair);
      }
      for (const r of rows) nameOf[[...r.pair].sort().join("|")] = pairLabel(r.pair);
    }
    if (leaders.current === null) {
      leaders.current = nowLeaders;
      return;
    }
    for (const gStr of Object.keys(nowLeaders)) {
      const g = Number(gStr);
      const prev = leaders.current[g];
      const next = nowLeaders[g];
      if (prev === next) continue;
      if (!prev) {
        announce(`First blood in Group ${g + 1}: ${nameOf[next]} are top of the table.`);
      } else {
        announce(
          pick(
            [
              `New leader in Group ${g + 1}! ${nameOf[next]} take over from ${nameOf[prev] ?? "the old guard"}.`,
              `Group ${g + 1} has a new boss: ${nameOf[next]}. ${nameOf[prev] ?? "Someone"} slips to second.`,
              `Plot twist in Group ${g + 1} — ${nameOf[next]} overtake ${nameOf[prev] ?? "the leaders"}.`,
            ],
            g + next.length
          )
        );
      }
    }
    leaders.current = nowLeaders;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsByGroup]);

  const line = current.text;
  const mood = moodOf(line);
  const style = MOOD_STYLE[mood];
  const reduceMotion = useReducedMotion();

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex items-stretch bg-violet-50 border-b border-violet-100 text-violet-900 overflow-hidden flex-shrink-0">
      {/* LIVE badge */}
      <div className="flex items-center px-4 flex-shrink-0">
        <span className="flex items-center gap-1.5 rounded-full bg-white border border-violet-200 pl-2 pr-2.5 py-1">
          <motion.span
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="w-2 h-2 rounded-full bg-red-500"
          />
          <span className="text-xs font-display font-bold uppercase tracking-[0.2em] text-violet-700">Live</span>
        </span>
      </div>

      {/* Rotating commentary */}
      <div className="relative flex-1 min-w-0 h-16 flex items-center justify-center px-4 overflow-hidden">
        {/* Highlight sweep on every new line */}
        {!reduceMotion && (
          <motion.div
            key={`sweep-${tick}`}
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className={`pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r ${style.sweep}`}
          />
        )}
        {/* Confetti for the big moments */}
        {!reduceMotion && (mood === "trophy" || mood === "crown" || mood === "fire") && (
          <div key={`confetti-${tick}`} className="pointer-events-none absolute inset-0">
            {CONFETTI.map((c, i) => (
              <motion.span
                key={i}
                initial={{ x: 24, y: 24, opacity: 1, scale: 1 }}
                animate={{ x: 24 + (i - 2.5) * 34, y: [24, -16, 40], opacity: [1, 1, 0], rotate: 360 }}
                transition={{ duration: 1.3, delay: i * 0.04, ease: "easeOut" }}
                className="absolute w-1.5 h-1.5 rounded-sm"
                style={{ background: c }}
              />
            ))}
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${tick}-${line}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -18 }}
            transition={{ duration: 0.25 }}
            className={`flex items-center justify-center gap-3 max-w-full min-w-0 font-display font-semibold text-xl text-center ${style.text}`}
          >
            <motion.span
              initial={reduceMotion ? {} : { scale: 0, rotate: -30 }}
              animate={reduceMotion ? {} : { scale: [0, 1.4, 1], rotate: [-30, 12, -8, 0] }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-3xl leading-none flex-shrink-0"
              aria-hidden
            >
              {style.emoji}
            </motion.span>
            <span className="truncate">
              {line.split(" ").map((word, i) => (
                <motion.span
                  key={i}
                  initial={reduceMotion ? {} : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.12 + i * 0.035, type: "spring", stiffness: 500, damping: 30 }}
                  className="inline-block"
                >
                  {word}&nbsp;
                </motion.span>
              ))}
            </span>
          </motion.div>
        </AnimatePresence>
        <motion.div
          key={tick}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: ROTATE_MS / 1000, ease: "linear" }}
          className="absolute left-0 bottom-0 h-0.5 w-full bg-violet-300 origin-left"
        />
      </div>

      {/* Clock */}
      <div className="flex items-center gap-4 px-4 border-l border-violet-100 bg-white flex-shrink-0 tabular-nums">
        <div className="text-right leading-tight">
          <div className="text-[9px] font-display font-semibold uppercase tracking-widest text-gray-400">Running</div>
          <div className="font-display font-bold text-sm text-violet-600">{elapsedLabel(props.tournament.created_at, now)}</div>
        </div>
        <div className="font-display font-bold text-3xl tracking-wide text-gray-900">{time}</div>
      </div>
    </div>
  );
}
