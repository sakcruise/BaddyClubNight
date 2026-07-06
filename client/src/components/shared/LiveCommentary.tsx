import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMatchStore, useQueueStore, useMemberStore, useSessionStore } from "../../store";

interface Message {
  id: string;
  emoji: string;
  text: string;
  color: string; // tailwind bg class
}

function useMatchTimers() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000); // refresh every 10s
    return () => clearInterval(id);
  }, []);
  return now;
}

function elapsedMins(startedAt: string | undefined, now: number) {
  if (!startedAt) return 0;
  return Math.floor((now - new Date(startedAt).getTime()) / 60_000);
}

const HYPE = [
  { emoji: "🏸", text: "Shuttlecocks flying, legends playing — this is badminton!" },
  { emoji: "🔥", text: "The hall is buzzing tonight!" },
  { emoji: "💪", text: "Great skills out there on the courts!" },
  { emoji: "🎯", text: "Precision, power, and a whole lot of smash!" },
  { emoji: "⚡", text: "Fast rallies, big smashes — what a night!" },
  { emoji: "🏆", text: "Every point counts — give it your all!" },
  { emoji: "👀", text: "Eyes on the shuttlecock, not the score... well, maybe both." },
  { emoji: "🎉", text: "Club night in full swing — loving the energy!" },
];

export default function LiveCommentary() {
  const { matches } = useMatchStore();
  const { queue, activeMemberIds, pitstops } = useQueueStore();
  const { members } = useMemberStore();
  const { courts } = useSessionStore();
  const now = useMatchTimers();

  const [idx, setIdx] = useState(0);

  const messages = useMemo<Message[]>(() => {
    const msgs: Message[] = [];
    const activeMatches = matches.filter((m) => m.result === "pending");

    // Per-court commentary
    activeMatches.forEach((m) => {
      const mins = elapsedMins(m.started_at, now);
      const courtId = m.court_id;
      const tA = m.team_a.map((id) => members[id]?.name.split(" ")[0]).filter(Boolean);
      const tB = m.team_b.map((id) => members[id]?.name.split(" ")[0]).filter(Boolean);
      const teamA = tA.join(" & ");
      const teamB = tB.join(" & ");

      if (m.score_a != null && m.score_b != null) {
        const diff = Math.abs(m.score_a - m.score_b);
        const leading = m.score_a > m.score_b ? teamA : m.score_b > m.score_a ? teamB : null;
        if (leading) {
          msgs.push({
            id: `score-${m.id}`,
            emoji: "🎯",
            text: diff >= 5
              ? `Court ${courtId} — ${leading} pulling away! ${m.score_a}–${m.score_b}`
              : `Court ${courtId} — ${leading} lead ${m.score_a}–${m.score_b}, but it's tight!`,
            color: "from-blue-500 to-blue-400",
          });
        } else {
          msgs.push({
            id: `score-tie-${m.id}`,
            emoji: "⚖️",
            text: `Court ${courtId} — It's all square at ${m.score_a}–${m.score_b}! Anyone's game!`,
            color: "from-purple-500 to-purple-400",
          });
        }
      }

      if (mins >= 25) {
        msgs.push({
          id: `epic-${m.id}`,
          emoji: "🏅",
          text: `Court ${courtId} — ${teamA} vs ${teamB} — this epic battle is ${mins} minutes in! 😤`,
          color: "from-red-500 to-orange-400",
        });
      } else if (mins >= 15) {
        msgs.push({
          id: `long-${m.id}`,
          emoji: "⏱️",
          text: `Court ${courtId} — ${mins} mins in and still going strong! ${teamA} vs ${teamB}`,
          color: "from-orange-500 to-yellow-400",
        });
      } else if (mins >= 5) {
        msgs.push({
          id: `live-${m.id}`,
          emoji: "🔥",
          text: `Court ${courtId} — ${teamA} vs ${teamB} — ${mins} mins of action!`,
          color: "from-green-500 to-emerald-400",
        });
      } else {
        msgs.push({
          id: `fresh-${m.id}`,
          emoji: "🏸",
          text: `Court ${courtId} just started — ${teamA} vs ${teamB}. Game on!`,
          color: "from-sky-500 to-sky-400",
        });
      }
    });

    // Pitstop hype
    pitstops.forEach((ps, i) => {
      const names = ps.players
        .map((id) => members[id]?.name.split(" ")[0])
        .filter(Boolean)
        .join(", ");
      msgs.push({
        id: `pitstop-${i}`,
        emoji: "🏎️",
        text: i === 0
          ? `Pitstop ready — ${names} are warmed up and raring to go!`
          : `Pitstop 2 in the wings — ${names} patiently waiting their turn!`,
        color: "from-yellow-500 to-amber-400",
      });
    });

    // Queue hype
    const waiting = queue.filter((q) => !activeMemberIds.has(q.member_id));
    if (waiting.length > 0) {
      const next = members[waiting[0]?.member_id];
      if (next) {
        msgs.push({
          id: "next-up",
          emoji: "👀",
          text: `${next.name.split(" ")[0]} is next in the queue — court won't stay free for long!`,
          color: "from-indigo-500 to-violet-400",
        });
      }
      if (waiting.length >= 4) {
        msgs.push({
          id: "queue-count",
          emoji: "⚡",
          text: `${waiting.length} players in the queue — it's buzzing tonight!`,
          color: "from-pink-500 to-rose-400",
        });
      }
    }

    // Idle courts
    const idleCount = courts.filter((c) => c.status === "idle").length;
    if (idleCount > 0 && waiting.length >= 4) {
      msgs.push({
        id: "idle-courts",
        emoji: "🟢",
        text: `${idleCount} court${idleCount > 1 ? "s" : ""} free and ${waiting.length} players waiting — let's go!`,
        color: "from-green-500 to-teal-400",
      });
    }

    // If nothing else, add hype filler
    if (msgs.length === 0) {
      HYPE.forEach((h, i) => msgs.push({ id: `hype-${i}`, ...h, color: "from-orange-500 to-orange-400" }));
    } else {
      // Sprinkle one random hype message
      const h = HYPE[Math.floor(Math.random() * HYPE.length)];
      msgs.push({ id: "hype-random", ...h, color: "from-orange-500 to-orange-400" });
    }

    return msgs;
  }, [matches, queue, pitstops, members, courts, activeMemberIds, now]);

  // Cycle through messages
  useEffect(() => {
    if (messages.length === 0) return;
    setIdx(0);
    const id = setInterval(() => setIdx((i) => (i + 1) % messages.length), 4500);
    return () => clearInterval(id);
  }, [messages.length]);

  const msg = messages[idx % messages.length];
  if (!msg) return null;

  // Pick character animation by message id
  type Mood = "celebrate" | "run" | "sleep" | "intense";
  const mood: Mood = (() => {
    const id = msg.id;
    if (id === "pitstop-1" || id === "next-up") return "sleep";
    if (id.startsWith("live-") || id.startsWith("long-") || id.startsWith("epic-") || id.startsWith("score-tie-")) return "intense";
    if (id.startsWith("fresh-") || id === "idle-courts" || id === "pitstop-0" || id === "queue-count") return "run";
    return "celebrate";
  })();

  const CHAR: Record<Mood, { frames: string[]; animClass: string }> = {
    celebrate: { frames: ["🥳", "🎉", "🏆", "🎊"], animClass: "animate-bounce" },
    run:       { frames: ["🏃", "🏃‍♂️", "💨", "🏃"], animClass: "" },
    sleep:     { frames: ["😴", "💤", "😪", "💤"], animClass: "" },
    intense:   { frames: ["🔥", "😤", "⚡", "🔥"], animClass: "" },
  };
  const { frames } = CHAR[mood];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const charVariants: Record<Mood, any> = {
    celebrate: { y: [0, -10, 0, -6, 0], rotate: [-5, 5, -5, 3, 0], transition: { duration: 0.8, repeat: Infinity } },
    run:       { x: [-6, 6, -6], y: [0, -5, 0], transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } },
    sleep:     { rotate: [0, 8, 0, -4, 0], y: [0, 3, 0], transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" } },
    intense:   { scale: [1, 1.15, 1], rotate: [-4, 4, -4], transition: { duration: 0.4, repeat: Infinity } },
  };

  return (
    <div className="relative h-28 flex-shrink-0 overflow-hidden rounded-2xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={`absolute inset-0 bg-gradient-to-r ${msg.color} flex items-center gap-3 px-4 rounded-2xl`}
        >
          {/* Animated character — right side, cycles through mood frames */}
          <div className="absolute right-3 top-0 bottom-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none select-none">
            <motion.span
              key={`char-${msg.id}`}
              className="text-4xl leading-none"
              animate={charVariants[mood]}
            >
              {frames[0]}
            </motion.span>
            {mood === "sleep" && (
              <motion.span
                className="text-lg leading-none"
                animate={{ opacity: [0, 1, 0], y: [-4, -10, -16], transition: { duration: 2, repeat: Infinity, delay: 0.5 } }}
              >
                💤
              </motion.span>
            )}
            {mood === "run" && (
              <motion.span
                className="text-base leading-none"
                animate={{ opacity: [0.3, 1, 0.3], x: [6, -2, 6], transition: { duration: 0.5, repeat: Infinity } }}
              >
                💨
              </motion.span>
            )}
            {mood === "intense" && (
              <motion.span
                className="text-lg leading-none"
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6], transition: { duration: 0.4, repeat: Infinity } }}
              >
                🔥
              </motion.span>
            )}
          </div>

          <motion.span
            className="text-4xl flex-shrink-0"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {msg.emoji}
          </motion.span>

          <p className="text-white font-display font-bold text-base leading-snug pr-20">
            {msg.text}
          </p>

          {/* Progress bar */}
          <motion.div
            className="absolute bottom-0 left-0 h-1 bg-white/40 rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 4.5, ease: "linear" }}
            key={`bar-${msg.id}`}
          />
        </motion.div>
      </AnimatePresence>

      {/* Dot indicators */}
      <div className="absolute top-2 right-3 flex gap-1">
        {messages.slice(0, Math.min(messages.length, 8)).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === idx % Math.min(messages.length, 8) ? "bg-white" : "bg-white/30"}`}
          />
        ))}
      </div>
    </div>
  );
}
