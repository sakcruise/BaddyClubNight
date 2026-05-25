import { useEffect, useState } from "react";
import { useMatchStore, useMemberStore, useQueueStore, useSessionStore } from "../store";
import { sessionsApi, queueApi, matchesApi, membersApi } from "../services/api";
import Leaderboard from "../components/leaderboard/Leaderboard";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";
import { List, Trophy, Users } from "lucide-react";

type Tab = "queue" | "leaderboard" | "courts";

export default function MobileView() {
  const [tab, setTab] = useState<Tab>("queue");
  const { session, setSession, setCourts } = useSessionStore();
  const { setQueue, queue } = useQueueStore();
  const { setMatches, matches } = useMatchStore();
  const { setMembers } = useMemberStore();

  useEffect(() => {
    async function load() {
      const [sessionRes, membersRes] = await Promise.all([
        sessionsApi.current(),
        membersApi.list(),
      ]);
      setMembers(membersRes.members);
      if (!sessionRes.session) return;
      setSession(sessionRes.session);
      setCourts(Array.from({ length: sessionRes.session.num_courts }, (_, i) => ({
        id: i + 1, status: "idle" as const,
      })));
      const [queueRes, matchesRes] = await Promise.all([
        queueApi.get(sessionRes.session.id),
        matchesApi.list(sessionRes.session.id),
      ]);
      setQueue(queueRes.queue);
      setMatches(matchesRes.matches);
    }
    load();
  }, [setSession, setCourts, setQueue, setMatches, setMembers]);

  if (!session) {
    return (
      <div className="min-h-screen bg-brand-50 flex flex-col items-center justify-center p-8 gap-4">
        <ShuttlecockIcon size={64} />
        <h1 className="text-2xl font-display font-black text-brand-900">No Active Session</h1>
        <p className="text-brand-500 text-center">Club night hasn't started yet. Check back soon!</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col max-w-sm mx-auto">
      <header className="flex items-center gap-3 px-5 py-4 bg-white shadow-sm">
        <ShuttlecockIcon size={28} />
        <h1 className="font-display font-black text-lg text-brand-900">{session.club_name}</h1>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        {tab === "queue" && (
          <div className="space-y-3">
            <h2 className="font-display font-black text-brand-900">Waiting Queue</h2>
            {queue.length === 0 ? (
              <p className="text-brand-400 text-center py-8">Queue is empty!</p>
            ) : (
              queue.map((entry) => (
                <div key={entry.member_id} className="card flex items-center gap-3 py-3">
                  <span className="queue-number bg-brand-100 text-brand-600 font-black">
                    {entry.position}
                  </span>
                  <span className="font-display font-bold text-brand-900">{entry.member.name}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "leaderboard" && <Leaderboard />}

        {tab === "courts" && (
          <div className="space-y-3">
            <h2 className="font-display font-black text-brand-900">Active Matches</h2>
            {matches.filter((m) => m.result === "pending").length === 0 ? (
              <p className="text-brand-400 text-center py-8">No matches in progress</p>
            ) : (
              matches
                .filter((m) => m.result === "pending")
                .map((m) => (
                  <div key={m.id} className="card">
                    <p className="font-display font-bold text-brand-600 text-sm mb-1">
                      Court {m.court_id}
                    </p>
                    <p className="font-display font-black text-brand-900">
                      Match in progress
                    </p>
                  </div>
                ))
            )}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-brand-100 flex">
        {([ ["queue", List, "Queue"], ["leaderboard", Trophy, "Leaderboard"], ["courts", Users, "Courts"] ] as const).map(
          ([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-display font-bold
                ${tab === key ? "text-brand-500" : "text-brand-300"}`}
            >
              <Icon size={20} />
              {label}
            </button>
          )
        )}
      </nav>
    </div>
  );
}
