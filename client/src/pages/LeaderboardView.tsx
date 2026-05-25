import { useEffect } from "react";
import { useMatchStore, useMemberStore } from "../store";
import { matchesApi, membersApi, sessionsApi } from "../services/api";
import Leaderboard from "../components/leaderboard/Leaderboard";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

export default function LeaderboardView() {
  const { setMatches } = useMatchStore();
  const { setMembers } = useMemberStore();

  useEffect(() => {
    async function load() {
      const [sessionRes, membersRes] = await Promise.all([
        sessionsApi.current(),
        membersApi.list(),
      ]);
      setMembers(membersRes.members);
      if (!sessionRes.session) return;
      const matchesRes = await matchesApi.list(sessionRes.session.id);
      setMatches(matchesRes.matches);
    }
    load();

    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [setMatches, setMembers]);

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col">
      <header className="flex items-center gap-3 px-8 py-5 bg-white shadow-sm">
        <ShuttlecockIcon size={36} />
        <h1 className="font-display font-black text-2xl text-brand-900">
          Tonight's Leaderboard
        </h1>
        <span className="badge bg-green-100 text-green-700 ml-auto">
          Live — updates every 30s
        </span>
      </header>

      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        <Leaderboard />
      </main>
    </div>
  );
}
