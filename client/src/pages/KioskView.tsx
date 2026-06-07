import { useEffect } from "react";
import { useSessionStore, useQueueStore, useMatchStore, useMemberStore } from "../store";
import CourtsView from "../components/courts/CourtsView";
import QueueList from "../components/queue/QueueList";
import Leaderboard from "../components/leaderboard/Leaderboard";
import PlayerPicker from "../components/queue/PlayerPicker";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import SessionSetup from "../components/admin/SessionSetup";
import { sessionsApi, queueApi, matchesApi, membersApi } from "../services/api";

export default function KioskView() {
  const { session, setSession, setCourts } = useSessionStore();
  const { setQueue, queue } = useQueueStore();
  const { setMatches, matches } = useMatchStore();
  const { setMembers } = useMemberStore();

  useEffect(() => {
    async function bootstrap() {
      const [sessionRes, membersRes] = await Promise.all([
        sessionsApi.current(),
        membersApi.list(),
      ]);
      setMembers(membersRes.members);
      if (!sessionRes.session) return;
      setSession(sessionRes.session);
      setCourts(
        Array.from({ length: sessionRes.session.num_courts }, (_, i) => ({
          id: i + 1,
          status: "idle" as const,
        }))
      );
      const [queueRes, matchesRes] = await Promise.all([
        queueApi.get(sessionRes.session.id),
        matchesApi.list(sessionRes.session.id),
      ]);
      setQueue(queueRes.queue);
      setMatches(matchesRes.matches);
    }
    bootstrap();
  }, [setSession, setCourts, setQueue, setMatches, setMembers]);

  if (!session) return <SessionSetup />;

  const activeMatches = matches.filter((m) => m.result === "pending").length;
  const dateStr = new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="kiosk-mode min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, rgb(var(--p-50)) 0%, rgb(var(--p-100)) 50%, rgb(var(--p-100)) 100%)" }}
    >
      {/* ── Rich Header ─────────────────────────────────────────────────────── */}
      <header
        className="header-pattern flex items-center justify-between px-8 py-0"
        style={{
          background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 70%, rgb(var(--p-500)) 100%)",
          minHeight: "88px",
        }}
      >
        {/* Left: Logo + name */}
        <div className="flex items-center gap-4">
          <div className="bg-white/15 rounded-2xl p-2.5 backdrop-blur-sm border border-white/20">
            <ShuttlecockIcon size={44} />
          </div>
          <div>
            <h1 className="font-display font-black text-white text-2xl leading-tight tracking-tight">
              {session.club_name}
            </h1>
            <p className="text-orange-200 text-sm font-display font-semibold">
              {dateStr}
            </p>
          </div>
        </div>

        {/* Centre: Stats pills */}
        <div className="flex items-center gap-3">
          <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3 text-center min-w-[90px]">
            <div className="text-white font-display font-black text-2xl leading-none">{queue.length}</div>
            <div className="text-orange-200 text-xs font-display font-bold mt-0.5">Waiting</div>
          </div>
          <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3 text-center min-w-[90px]">
            <div className="text-white font-display font-black text-2xl leading-none">{activeMatches}</div>
            <div className="text-orange-200 text-xs font-display font-bold mt-0.5">Playing</div>
          </div>
          <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3 text-center min-w-[90px]">
            <div className="text-white font-display font-black text-2xl leading-none">{matches.filter(m => m.result === "complete").length}</div>
            <div className="text-orange-200 text-xs font-display font-bold mt-0.5">Finished</div>
          </div>
        </div>

        {/* Right: Live badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-green-500/20 border border-green-400/40 backdrop-blur-sm rounded-2xl px-5 py-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400"></span>
            </span>
            <span className="text-green-300 font-display font-black text-base">LIVE</span>
          </div>
        </div>
      </header>

      {/* ── 3-Column Layout ──────────────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-[1fr_2.2fr_1fr] gap-5 p-5 overflow-hidden min-h-0">

        {/* Queue */}
        <div className="glass-card overflow-hidden flex flex-col p-5">
          <QueueList />
        </div>

        {/* Courts */}
        <div className="glass-card overflow-hidden flex flex-col p-5">
          <CourtsView />
        </div>

        {/* Leaderboard */}
        <div className="glass-card overflow-hidden flex flex-col p-5">
          <Leaderboard />
        </div>
      </main>

      <PlayerPicker />
    </div>
  );
}
