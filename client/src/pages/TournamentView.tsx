import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useSessionStore, useMemberStore, useMatchStore, useQueueStore, useSessionArchiveStore } from "../store";
import { tournamentsApi } from "../services/tournaments";
import { matchesApi, sessionsApi } from "../services/api";
import type { GroupStanding } from "../utils/tournament";
import type { Tournament, TournamentFixture, TournamentPlayer } from "../types";
import Avatar from "../components/shared/Avatar";
import Button from "../components/shared/Button";
import ScoreEntry from "../components/scoring/ScoreEntry";
import EndNightCheers from "../components/shared/EndNightCheers";
import { Trophy, LogOut, RotateCcw, Play, Radio, Flag, ChevronLeft, ChevronRight } from "lucide-react";

function pairName(ids: [string, string] | null, members: ReturnType<typeof useMemberStore.getState>["members"]) {
  if (!ids) return "Bye";
  return ids.map((id) => members[id]?.name?.split(" ")[0] ?? "?").join(" & ");
}

function pairEq(a: [string, string], b: [string, string]) {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function qualifierLabel(groupIndex: number, rank: number, advancePerGroup: number): string {
  if (advancePerGroup === 1) return `Group ${groupIndex + 1} Winner`;
  const place = rank === 1 ? "Winner" : rank === 2 ? "Runner-up" : `${rank}rd place`;
  return `Group ${groupIndex + 1} — ${place}`;
}

function knockoutRoundLabel(matchCount: number): string {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semi-Final";
  if (matchCount === 4) return "Quarter-Final";
  return `Round of ${matchCount * 2}`;
}

/** Preview of the knockout bracket shape before it's generated — same seeding
 * order buildKnockoutBracket uses (rank asc, then group asc; top seed vs
 * bottom seed), but with "Group N Winner"-style placeholders instead of real
 * pairs. Only round 1 names real groups; later rounds are TBD vs TBD. */
function knockoutPreviewRounds(
  numGroups: number,
  advancePerGroup: number,
  labelFor: (groupIndex: number, rank: number) => string = (g, r) => qualifierLabel(g, r, advancePerGroup)
): Array<{ label: string; matchups: [string, string][] }> {
  const labels: string[] = [];
  for (let rank = 1; rank <= advancePerGroup; rank++) {
    for (let g = 0; g < numGroups; g++) labels.push(labelFor(g, rank));
  }
  const bracketSize = nextPowerOfTwo(labels.length);
  const slots: Array<string | null> = Array.from({ length: bracketSize }, (_, i) => labels[i] ?? null);

  const round1: [string, string][] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    round1.push([slots[i] ?? "Bye", slots[bracketSize - 1 - i] ?? "Bye"]);
  }

  const rounds = [{ label: knockoutRoundLabel(round1.length), matchups: round1 }];
  let count = round1.length;
  while (count > 1) {
    count = count / 2;
    rounds.push({ label: knockoutRoundLabel(count), matchups: Array.from({ length: count }, () => ["TBD", "TBD"] as [string, string]) });
  }
  return rounds;
}

export default function TournamentView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { members } = useMemberStore();
  const { courts, updateCourtStatus, session, setSession, endSession } = useSessionStore();
  const { matches, addMatch, setMatches } = useMatchStore();
  const { setQueue, setActiveMemberIds } = useQueueStore();
  const { archiveSession } = useSessionArchiveStore();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [fixtures, setFixtures] = useState<TournamentFixture[]>([]);
  const [standingsByGroup, setStandingsByGroup] = useState<Record<number, GroupStanding[]>>({});
  const [scoringFixture, setScoringFixture] = useState<TournamentFixture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCheers, setShowCheers] = useState(false);
  const [ending, setEnding] = useState(false);
  // During the knockout the groups collapse to a scoreboard; this flips them back to the full matrices.
  const [showFullGroups, setShowFullGroups] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const bundle = await tournamentsApi.get(id);
    setTournament(bundle.tournament);
    setPlayers(bundle.players);
    setFixtures(bundle.fixtures);

    const entries = await Promise.all(
      Array.from({ length: bundle.tournament.num_groups }, (_, g) =>
        tournamentsApi.groupStandings(id, g).then((s) => [g, s] as const)
      )
    );
    setStandingsByGroup(Object.fromEntries(entries));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Once the bracket exists, slide it into view so the operator lands on the knockout, not the group scores.
  const knockoutRef = useRef<HTMLDivElement>(null);
  const status = tournament?.status;
  useEffect(() => {
    if (status === "knockout" || status === "complete") {
      knockoutRef.current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }
  }, [status]);

  if (!tournament || !id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const allGroupFixturesComplete = fixtures
    .filter((f) => f.stage === "group")
    .every((f) => f.status === "complete");
  const idleCourts = courts.filter((c) => c.status === "idle");

  function findGroupFixture(g: number, a: [string, string], b: [string, string]) {
    return fixtures.find(
      (f) =>
        f.stage === "group" &&
        f.group_index === g &&
        f.team_a &&
        f.team_b &&
        ((pairEq(f.team_a, a) && pairEq(f.team_b, b)) || (pairEq(f.team_a, b) && pairEq(f.team_b, a)))
    );
  }

  // Each group plays out on its own court for the whole tournament (Group 1 ->
  // court 1, Group 2 -> court 2, ...), so group-stage fixtures never need a
  // court picker — wrapping if there are fewer courts than groups.
  const sortedCourts = [...courts].sort((a, b) => a.id - b.id);
  function courtForGroup(g: number) {
    return sortedCourts.length > 0 ? sortedCourts[g % sortedCourts.length] : undefined;
  }

  // Prefer the group's own court, otherwise any free one — the operator never picks.
  function handlePlayGroupFixture(g: number, fixture: TournamentFixture) {
    if (sortedCourts.length === 0) { setError("No courts are set up for this session."); return; }
    const own = courtForGroup(g);
    const court = own?.status === "idle" ? own : idleCourts[0];
    if (!court) { setError("All courts are busy — finish a match first."); return; }
    handleLaunch(fixture, court.id);
  }

  async function handleLaunch(fixture: TournamentFixture, courtId: number) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const match = await tournamentsApi.launchFixture(fixture, session.id, courtId);
      addMatch(match);
      updateCourtStatus(courtId, "playing", match.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start that fixture");
    } finally {
      setBusy(false);
    }
  }

  async function handleScoreSaved(fixture: TournamentFixture) {
    if (!fixture.match_id) return;
    setBusy(true);
    try {
      const { match } = await matchesApi.complete(fixture.match_id);
      updateCourtStatus(match.court_id, "idle");
      await tournamentsApi.completeFixture(fixture.id);
      setScoringFixture(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleResetFixture(fixture: TournamentFixture) {
    if (!confirm("Reset this match? The court will be freed and any score entered will be lost.")) return;
    setBusy(true);
    setError(null);
    try {
      const match = fixture.match_id ? matches.find((m) => m.id === fixture.match_id) : undefined;
      await tournamentsApi.resetFixture(fixture);
      if (match) {
        updateCourtStatus(match.court_id, "idle");
        useMatchStore.getState().deleteMatch(match.id);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset that fixture");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetGroups() {
    if (!tournament || !session) return;
    if (!confirm("Reset groups? This deletes the current draft and all scores, and takes you back to re-pick players.")) return;
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.delete(tournament.id);
      setSession({ ...session, tournament_id: undefined });
      navigate(`/tournament-setup/${session.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset the groups");
    } finally {
      setBusy(false);
    }
  }

  async function handleEndTournament() {
    if (!tournament || !session) return;
    if (!confirm("End this tournament? Club night continues as normal — courts go back to the regular check-in flow.")) return;
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.unlinkSession(session.id);
      setSession({ ...session, tournament_id: undefined });
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the tournament");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateKnockout() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.generateKnockout(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the bracket");
    } finally {
      setBusy(false);
    }
  }

  function handleEndNight() {
    if (!session) return;
    setShowCheers(true);
  }

  async function confirmEndNight() {
    if (!session) return;
    setEnding(true);
    try {
      archiveSession({ ...session, status: "ended" }, matches);
      await sessionsApi.end(session.id);
      setShowCheers(false);
      endSession();
      setMatches([]);
      setQueue([]);
      setActiveMemberIds(new Set());
      navigate("/");
    } catch (err) {
      console.error("End night failed:", err);
      setShowCheers(false);
      alert(`Could not end the session: ${err instanceof Error ? err.message : "unknown error"}. Please try again.`);
    } finally {
      setEnding(false);
    }
  }

  async function handleAdvanceRound(round: number) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.advanceRound(id, round);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not advance the bracket");
    } finally {
      setBusy(false);
    }
  }

  // One knockout match card. Names stacked, then a single full-width action so it's
  // thumb-sized on a touch screen: Play (auto-picks the first free court) → Enter Score → Edit.
  function FixtureRow({ fixture }: { fixture: TournamentFixture }) {
    const isBye = !fixture.team_b;
    const match = fixture.match_id ? matches.find((m) => m.id === fixture.match_id) : undefined;
    const scoreA = match?.score_a;
    const scoreB = match?.score_b;
    const hasScore = fixture.status === "complete" && scoreA !== undefined && scoreB !== undefined;
    const aWon = hasScore && scoreA > scoreB;
    const nameCls = (won: boolean) =>
      `truncate font-display font-bold text-sm ${hasScore ? (won ? "text-emerald-700" : "text-gray-400 line-through decoration-gray-300") : "text-gray-800"}`;
    const freeCourt = idleCourts[0];

    return (
      <div
        className={`flex flex-col gap-2 p-3 rounded-2xl border bg-white
          ${fixture.status === "active" ? "border-amber-300 shadow-md shadow-amber-100" : "border-gray-200"}`}
      >
        <div className="flex items-center gap-2">
          <span className={nameCls(aWon)}>{pairName(fixture.team_a, members)}</span>
          {hasScore && <span className="ml-auto font-display font-black tabular-nums text-sm text-gray-800">{scoreA}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={nameCls(hasScore && !aWon)}>{pairName(fixture.team_b, members)}</span>
          {hasScore && <span className="ml-auto font-display font-black tabular-nums text-sm text-gray-800">{scoreB}</span>}
        </div>

        {isBye && <p className="text-[11px] font-display font-bold text-gray-400">Bye — goes straight through</p>}

        {!isBye && fixture.status === "pending" && (
          <Button size="md" fullWidth disabled={busy || !freeCourt} onClick={() => freeCourt && handleLaunch(fixture, freeCourt.id)}>
            <Play size={14} /> {freeCourt ? "Play" : "All courts busy"}
          </Button>
        )}
        {!isBye && fixture.status === "active" && (
          <div className="flex gap-2">
            <Button size="md" fullWidth onClick={() => setScoringFixture(fixture)}>
              <Radio size={14} /> Enter Score
            </Button>
            <button
              onClick={() => handleResetFixture(fixture)}
              disabled={busy}
              aria-label="Reset match"
              className="min-w-[44px] rounded-xl border border-gray-200 text-gray-400 active:bg-red-50 active:text-red-500 flex items-center justify-center"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        )}
        {!isBye && fixture.status === "complete" && (
          <div className="flex gap-2">
            <Button size="md" fullWidth variant="secondary" onClick={() => setScoringFixture(fixture)}>
              Edit Score
            </Button>
            <button
              onClick={() => handleResetFixture(fixture)}
              disabled={busy}
              aria-label="Reset match"
              className="min-w-[44px] rounded-xl border border-gray-200 text-gray-400 active:bg-red-50 active:text-red-500 flex items-center justify-center"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center flex-shrink-0">
          <Trophy size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <h1 className="font-display font-black text-gray-900 text-lg leading-tight">{tournament.name}</h1>
          <p className="text-gray-500 text-xs font-display capitalize">{tournament.status} stage</p>
        </div>
        <button
          onClick={handleResetGroups}
          disabled={busy}
          title="Delete this draft and re-pick players"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-xs font-display font-bold hover:bg-gray-100 transition-all disabled:opacity-50"
        >
          <RotateCcw size={14} /> Reset Groups
        </button>
        <button
          onClick={handleEndTournament}
          disabled={busy}
          title="Stop the tournament, keep club night running"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-display font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
        >
          <Flag size={14} /> End Tournament
        </button>
        <button
          onClick={handleEndNight}
          title="End Night"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-display font-bold hover:bg-red-100 transition-all"
        >
          <LogOut size={14} /> End Night
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 w-full">
        {error && <p className="text-sm font-display font-bold text-red-600">{error}</p>}

        {(() => {
          const liveFixtures = fixtures.filter((f) => f.status === "active");
          if (liveFixtures.length === 0) return null;
          return (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <motion.span
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                  className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"
                />
                <h2 className="text-xs font-display font-black text-amber-700 uppercase tracking-widest">
                  Now Playing ({liveFixtures.length})
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {liveFixtures.map((f) => {
                  const match = f.match_id ? matches.find((m) => m.id === f.match_id) : undefined;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setScoringFixture(f)}
                      className="flex items-center gap-2 bg-white border border-amber-300 rounded-xl pl-3 pr-2 py-1.5 hover:bg-amber-100 transition-colors"
                    >
                      {match && (
                        <span className="text-[10px] font-display font-black text-amber-600 bg-amber-100 rounded-md px-1.5 py-0.5">
                          Court {match.court_id}
                        </span>
                      )}
                      <span className="text-xs font-display font-bold text-gray-800">
                        {pairName(f.team_a, members)} <span className="text-gray-300">vs</span> {pairName(f.team_b, members)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {fixtures.some((f) => f.stage === "group") && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-display font-bold text-gray-400 px-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 px-1.5 py-0.5">
                <Play size={9} /> Play
              </span>
              not yet scheduled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-700 px-1.5 py-0.5">
                <Radio size={9} /> Live
              </span>
              on court now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5">11/7</span>
              <span className="rounded-lg bg-red-50 border border-red-200 text-red-600 px-1.5 py-0.5">7/11</span>
              win / loss — tap to edit
            </span>
          </div>
        )}

        {fixtures.some((f) => f.stage === "group") && (
          <div className="flex items-start gap-6 overflow-x-auto pb-2 -mx-1 px-1">
            {/* Knockout / complete: groups collapse to a compact scoreboard so the bracket gets the screen */}
            {tournament.status !== "groups" && !showFullGroups && (
              <div className="grid grid-cols-2 gap-3 flex-shrink-0 w-max self-center">
                {Array.from({ length: tournament.num_groups }, (_, g) => {
                  const rows = standingsByGroup[g] ?? [];
                  return (
                    <section key={g} className="bg-white rounded-2xl border border-gray-200 p-3 w-[230px]">
                      <h2 className="font-display font-black text-gray-900 text-xs mb-1.5">Group {g + 1}</h2>
                      <ol className="flex flex-col gap-0.5">
                        {rows.map((s, i) => (
                          <li
                            key={s.pair.join("-")}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] font-display
                              ${i < tournament.advance_per_group ? "bg-violet-50 text-violet-700 font-black" : "text-gray-600 font-bold"}`}
                          >
                            <span className="w-3 text-gray-400 tabular-nums">{i + 1}</span>
                            <span className="flex-1 truncate">{pairName(s.pair, members)}</span>
                            <span className="tabular-nums text-gray-400">{s.wins}-{s.losses}</span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  );
                })}
              </div>
            )}

            {/* Groups in 2-column grid layout (3 per column) */}
            {(tournament.status === "groups" || showFullGroups) && (
            <div className="grid grid-cols-2 gap-6 flex-shrink-0 w-max">
                {Array.from({ length: tournament.num_groups }, (_, g) => {
                  const rows = standingsByGroup[g] ?? [];
                  return (
                    <section key={g} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3 w-max">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display font-black text-gray-900 text-sm">Group {g + 1}</h2>
                        {rows[0] && (
                          <span className="flex items-center gap-1 text-xs font-display font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-0.5">
                            <Trophy size={11} /> {pairName(rows[0].pair, members)}
                          </span>
                        )}
                      </div>

                      <div className="w-full">
                        <table className="border-collapse text-sm font-display w-full">
                          <thead>
                            <tr>
                              <th className="sticky left-0 z-10 bg-white p-2 text-left text-[10px] text-gray-400 font-bold uppercase tracking-wider border-b border-gray-200">
                                Pair
                              </th>
                              {rows.map((s) => (
                                <th key={s.pair.join("-")} className="p-2 text-[10px] text-gray-500 font-bold border-b border-gray-200 min-w-[90px] whitespace-nowrap">
                                  {pairName(s.pair, members)}
                                </th>
                              ))}
                              <th className="p-2 text-[10px] text-gray-500 font-bold border-b border-gray-200 min-w-[80px]">Points Won</th>
                              <th className="p-2 text-[10px] text-gray-500 font-bold border-b border-gray-200 min-w-[80px]">Average</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((rowS, ri) => {
                              const played = rowS.wins + rowS.losses;
                              const avg = played > 0 ? rowS.pointsFor / played : 0;
                              const isLeader = ri === 0;
                              return (
                                <tr key={rowS.pair.join("-")} className={isLeader ? "bg-violet-50/60" : ""}>
                                  <th scope="row" className="sticky left-0 z-10 bg-inherit p-2 text-left border-b border-gray-100 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex -space-x-2 flex-shrink-0">
                                        {rowS.pair.map((pid) => (
                                          <Avatar key={pid} name={members[pid]?.name ?? "?"} size="xs" />
                                        ))}
                                      </div>
                                      <span className="font-bold text-gray-800 text-xs">{pairName(rowS.pair, members)}</span>
                                    </div>
                                  </th>
                                  {rows.map((colS, ci) => {
                                    if (ri === ci) {
                                      return (
                                        <td key={ci} className="relative border-b border-gray-100 p-0 h-11 bg-gray-50">
                                          <div
                                            className="absolute inset-0"
                                            style={{ background: "linear-gradient(to top right, transparent calc(50% - 1px), #d1d5db calc(50%), transparent calc(50% + 1px))" }}
                                          />
                                        </td>
                                      );
                                    }
                                    const fixture = findGroupFixture(g, rowS.pair, colS.pair);
                                    if (!fixture) {
                                      return <td key={ci} className="border-b border-gray-100 text-center text-gray-300 text-xs">—</td>;
                                    }
                                    const rowIsTeamA = fixture.team_a ? pairEq(fixture.team_a, rowS.pair) : true;
                                    const match = fixture.match_id ? matches.find((m) => m.id === fixture.match_id) : undefined;

                                    if (fixture.status === "complete" && match?.score_a !== undefined && match?.score_b !== undefined) {
                                      const own = rowIsTeamA ? match.score_a : match.score_b;
                                      const opp = rowIsTeamA ? match.score_b : match.score_a;
                                      const won = own > opp;
                                      return (
                                        <td key={ci} className="group relative border-b border-gray-100 text-center p-1.5">
                                          <motion.button
                                            key={`${fixture.id}-complete`}
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                            onClick={() => setScoringFixture(fixture)}
                                            title="Tap to edit score"
                                            className={`w-full min-h-[44px] rounded-lg py-2 font-display font-black text-sm tabular-nums border transition-colors
                                              ${won
                                                ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                                : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"}`}
                                          >
                                            {own}/{opp}
                                          </motion.button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleResetFixture(fixture); }}
                                            title="Reset match"
                                            className="absolute -top-1 -right-1 p-1.5 rounded-full bg-white border border-gray-200 text-gray-400 shadow-sm active:bg-red-50 active:text-red-500 transition-all"
                                          >
                                            <RotateCcw size={10} />
                                          </button>
                                        </td>
                                      );
                                    }

                                    if (fixture.status === "active") {
                                      return (
                                        <td key={ci} className="group relative border-b border-gray-100 text-center p-1.5">
                                          <button
                                            onClick={() => setScoringFixture(fixture)}
                                            title="Tap to enter score"
                                            className="w-full min-h-[44px] flex items-center justify-center gap-1 rounded-lg py-2bg-amber-100 border border-amber-300 text-amber-700 hover:bg-amber-200 transition-colors"
                                          >
                                            <motion.span
                                              animate={{ opacity: [1, 0.3, 1] }}
                                              transition={{ repeat: Infinity, duration: 1.2 }}
                                              className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"
                                            />
                                            <span className="text-[10px] font-display font-black uppercase tracking-wide">Live</span>
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleResetFixture(fixture); }}
                                            title="Reset match"
                                            className="absolute -top-1 -right-1 p-1.5 rounded-full bg-white border border-gray-200 text-gray-400 shadow-sm active:bg-red-50 active:text-red-500 transition-all"
                                          >
                                            <RotateCcw size={10} />
                                          </button>
                                        </td>
                                      );
                                    }

                                    const isBye = !fixture.team_b;
                                    return (
                                      <td key={ci} className="border-b border-gray-100 text-center p-1.5">
                                        {isBye ? (
                                          <span className="block py-1.5 text-[10px] text-gray-300 font-display font-bold">bye</span>
                                        ) : (
                                          <button
                                            onClick={() => handlePlayGroupFixture(g, fixture)}
                                            disabled={busy}
                                            className="w-full min-h-[44px] flex items-center justify-center gap-1 rounded-lg py-2border border-dashed border-gray-300 text-gray-400
                                                       hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 active:scale-95 transition-all disabled:opacity-50"
                                          >
                                            <Play size={10} className="flex-shrink-0" />
                                            <span className="text-[10px] font-display font-bold">Play</span>
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="border-b border-gray-100 text-center font-display font-black text-gray-800 tabular-nums text-sm">
                                    {rowS.pointsFor}
                                  </td>
                                  <td className="border-b border-gray-100 text-center font-display font-black text-violet-600 tabular-nums text-sm">
                                    {avg.toFixed(1)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  );
                })}
            </div>
            )}

            {tournament.status !== "groups" && (
              <button
                onClick={() => {
                  const next = !showFullGroups;
                  setShowFullGroups(next);
                  if (!next) setTimeout(() => knockoutRef.current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" }), 50);
                }}
                className="self-stretch flex-shrink-0 w-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col items-center justify-center gap-2 text-violet-600 active:bg-violet-50"
                aria-label={showFullGroups ? "Back to compact groups" : "Show full group scores"}
              >
                {showFullGroups ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
                <span className="text-[10px] font-display font-black uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">
                  {showFullGroups ? "Compact" : "Full groups"}
                </span>
              </button>
            )}

            <div
              ref={knockoutRef}
              className={`flex flex-col justify-center gap-4 flex-shrink-0 self-stretch scroll-mx-5
                ${tournament.status === "groups" ? "w-max" : "flex-1 min-w-[760px]"}`}
            >
              {tournament.status === "groups" && (() => {
                // Round 1 slots track the live standings: whoever leads each group right now is
                // named in the bracket, and the name updates as scores come in.
                const livePairs = new Set<number>();
                const previewRounds = knockoutPreviewRounds(tournament.num_groups, tournament.advance_per_group, (g, rank) => {
                  const s = standingsByGroup[g]?.[rank - 1];
                  const groupHasResult = fixtures.some((f) => f.stage === "group" && f.group_index === g && f.status === "complete");
                  if (!s || !groupHasResult) return qualifierLabel(g, rank, tournament.advance_per_group);
                  livePairs.add(g * 10 + rank);
                  return pairName(s.pair, members);
                });
                return (
                  <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col gap-5">
                    <div>
                      <h2 className="font-display font-black text-gray-900 text-lg leading-tight">Knockout</h2>
                      <p className="text-xs font-display text-gray-500 mt-0.5">
                        Names fill in as each group's leader changes — this is who'd go through if the groups ended now.
                      </p>
                    </div>
                    <div>
                      <div className="grid gap-x-8 mb-3" style={{ gridTemplateColumns: `repeat(${previewRounds.length}, 220px)` }}>
                        {previewRounds.map((r) => (
                          <h3 key={r.label} className="text-[10px] font-display font-bold text-gray-400 uppercase tracking-widest text-center">
                            {r.label}
                          </h3>
                        ))}
                      </div>
                      <BracketGrid
                        roundCounts={previewRounds.map((r) => r.matchups.length)}
                        cell={(ri, mi) => {
                          const [a, b] = previewRounds[ri].matchups[mi];
                          const isLive = ri === 0 && livePairs.size > 0;
                          return (
                            <div className={`px-3 py-3 rounded-xl border text-xs font-display font-bold text-center leading-snug
                              ${isLive ? "bg-violet-50 border-violet-200 text-violet-800" : "bg-gray-50 border-gray-100 text-gray-400"}`}>
                              <div className="truncate">{a}</div>
                              <div className="text-[10px] text-gray-300 my-0.5">vs</div>
                              <div className="truncate">{b}</div>
                            </div>
                          );
                        }}
                        rowHeight={92}
                      />
                    </div>
                    {!allGroupFixturesComplete && (
                      <p className="text-xs font-display font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        Some group matches are still to play — generating now seeds the bracket from the current standings.
                      </p>
                    )}
                    <Button size="lg" fullWidth disabled={busy} onClick={handleGenerateKnockout}>
                      <Trophy size={18} /> Generate Knockout
                    </Button>
                  </section>
                );
              })()}

              {(tournament.status === "knockout" || tournament.status === "complete") && (
                <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
                  <div>
                    <h2 className="font-display font-black text-gray-900 text-lg leading-tight">Knockout</h2>
                    <p className="text-xs font-display text-gray-500 mt-0.5">Tap Play to send a match to the next free court, then tap it again to enter the score.</p>
                  </div>
                  <KnockoutBracket
                    fixtures={fixtures.filter((f) => f.stage === "knockout")}
                    members={members}
                    busy={busy}
                    onAdvance={handleAdvanceRound}
                    renderFixture={(f) => <FixtureRow key={f.id} fixture={f} />}
                  />
                </section>
              )}

              {tournament.status === "complete" && (
                <div className="bg-gradient-to-br from-violet-600 to-violet-500 rounded-2xl p-6 text-center text-white shadow-xl">
                  <Trophy size={40} className="mx-auto mb-2" />
                  <p className="font-display font-black text-lg">Tournament complete! 🎉</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {scoringFixture?.match_id && (
        <ScoreEntry
          matchId={scoringFixture.match_id}
          onClose={() => setScoringFixture(null)}
          onSaved={() => handleScoreSaved(scoringFixture)}
        />
      )}


      {showCheers && (
        <EndNightCheers
          matches={matches}
          members={members}
          onConfirm={confirmEndNight}
          onCancel={() => setShowCheers(false)}
          ending={ending}
          isGroup={!!session?.group_id}
        />
      )}
    </div>
  );
}

/** Shared bracket-tree grid: positions each round's matches via CSS Grid row
 * spans (span = 2^round, so a match always centers exactly between its two
 * feeder matches) and draws the connecting lines between rounds. Used by both
 * the live KnockoutBracket and the pre-generation preview, so the bracket
 * looks the same shape before and after "Generate Knockout" is clicked. */
function BracketGrid({
  roundCounts,
  cell,
  colWidth = 220,
  rowHeight = 76,
  fill = false,
}: {
  roundCounts: number[];
  cell: (roundIndex: number, matchIndex: number) => React.ReactNode;
  colWidth?: number;
  rowHeight?: number;
  /** Stretch columns to the container width instead of fixed colWidth. */
  fill?: boolean;
}) {
  const colGap = 32; // px — matches gap-x-8 below
  const rowCount = roundCounts[0] ?? 1;
  return (
    <div
      className="grid gap-x-8"
      style={{
        gridTemplateColumns: `repeat(${roundCounts.length}, ${fill ? `minmax(${colWidth}px, 1fr)` : `${colWidth}px`})`,
        gridTemplateRows: `repeat(${rowCount}, ${rowHeight}px)`,
      }}
    >
      {roundCounts.map((count, ri) => {
        const span = 2 ** ri;
        const isFirstRound = ri === 0;
        const isLastRound = ri === roundCounts.length - 1;
        return Array.from({ length: count }, (_, mi) => {
          const rowStart = mi * span + 1;
          return (
            <div
              key={`${ri}-${mi}`}
              className="relative flex items-center"
              style={{ gridColumn: ri + 1, gridRow: `${rowStart} / span ${span}` }}
            >
              {!isFirstRound && (
                <>
                  <div className="absolute w-px bg-gray-300" style={{ left: -colGap / 2, top: 0, bottom: 0 }} />
                  <div className="absolute h-px bg-gray-300" style={{ left: -colGap / 2, top: "50%", width: colGap / 2 }} />
                </>
              )}
              {!isLastRound && (
                <div className="absolute h-px bg-gray-300" style={{ right: -colGap / 2, top: "50%", width: colGap / 2 }} />
              )}
              <div className="w-full">{cell(ri, mi)}</div>
            </div>
          );
        });
      })}
    </div>
  );
}

function KnockoutBracket({
  fixtures,
  busy,
  onAdvance,
  renderFixture,
}: {
  fixtures: TournamentFixture[];
  members: ReturnType<typeof useMemberStore.getState>["members"];
  busy: boolean;
  onAdvance: (round: number) => void;
  renderFixture: (f: TournamentFixture) => React.ReactNode;
}) {
  const rounds = Array.from(new Set(fixtures.map((f) => f.round))).sort((a, b) => a - b);
  const roundFixturesByRound = rounds.map((round) => fixtures.filter((f) => f.round === round));
  const roundCounts = roundFixturesByRound.map((rf) => rf.length);

  // Rounds that haven't been generated yet are still drawn (as "Winner of …"
  // placeholders) so the whole tree and its lines are visible from the start.
  const firstRoundSize = roundCounts[0] ?? 1;
  const totalRounds = Math.round(Math.log2(firstRoundSize)) + 1;
  const allCounts = Array.from({ length: totalRounds }, (_, i) => firstRoundSize / 2 ** i);
  const columns = `repeat(${totalRounds}, minmax(220px, 1fr))`;

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="grid gap-x-8 mb-3" style={{ gridTemplateColumns: columns }}>
        {allCounts.map((count, ri) => (
          <h2 key={ri} className="text-[10px] font-display font-bold text-gray-400 uppercase tracking-widest text-center">
            {knockoutRoundLabel(count)}
          </h2>
        ))}
      </div>

      <BracketGrid
        roundCounts={allCounts}
        rowHeight={132}
        fill
        cell={(ri, mi) => {
          const fixture = roundFixturesByRound[ri]?.[mi];
          if (fixture) return renderFixture(fixture);
          const feeder = knockoutRoundLabel(allCounts[ri - 1]);
          return (
            <div className="p-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-xs font-display font-bold text-gray-400 flex flex-col gap-2">
              <span>Winner · {feeder} {mi * 2 + 1}</span>
              <span>Winner · {feeder} {mi * 2 + 2}</span>
            </div>
          );
        }}
      />

      <div className="grid gap-x-8 mt-3" style={{ gridTemplateColumns: columns }}>
        {allCounts.map((_, ri) => {
          const round = rounds[ri];
          const roundFixtures = roundFixturesByRound[ri];
          const isLatestRound = ri === rounds.length - 1;
          const allComplete = !!roundFixtures && roundFixtures.every((f) => f.status === "complete");
          return (
            <div key={ri} className="flex justify-center">
              {round !== undefined && allComplete && isLatestRound && roundFixtures.length > 1 && (
                <Button size="lg" fullWidth disabled={busy} onClick={() => onAdvance(round)}>
                  Next round →
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
