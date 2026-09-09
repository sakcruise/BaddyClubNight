import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSessionStore, useMemberStore, useMatchStore } from "../store";
import { tournamentsApi } from "../services/tournaments";
import { matchesApi } from "../services/api";
import type { GroupStanding } from "../utils/tournament";
import type { Tournament, TournamentFixture, TournamentPlayer } from "../types";
import Avatar from "../components/shared/Avatar";
import Button from "../components/shared/Button";
import ScoreEntry from "../components/scoring/ScoreEntry";
import { Trophy, ChevronLeft } from "lucide-react";

function pairName(ids: [string, string] | null, members: ReturnType<typeof useMemberStore.getState>["members"]) {
  if (!ids) return "Bye";
  return ids.map((id) => members[id]?.name?.split(" ")[0] ?? "?").join(" & ");
}

// Tailwind scans for literal class strings, so the possible grid-cols classes
// must be spelled out here rather than built with a template string at runtime.
const GROUP_GRID_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  7: "lg:grid-cols-6",
  8: "lg:grid-cols-6",
};

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
function knockoutPreviewRounds(numGroups: number, advancePerGroup: number): Array<{ label: string; matchups: [string, string][] }> {
  const labels: string[] = [];
  for (let rank = 1; rank <= advancePerGroup; rank++) {
    for (let g = 0; g < numGroups; g++) labels.push(qualifierLabel(g, rank, advancePerGroup));
  }
  const bracketSize = nextPowerOfTwo(labels.length);
  const slots: Array<string | null> = Array.from({ length: bracketSize }, (_, i) => labels[i] ?? null);

  const round1: [string, string][] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    round1.push([slots[i] ?? "TBD", slots[bracketSize - 1 - i] ?? "TBD"]);
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
  const { courts, updateCourtStatus, session } = useSessionStore();
  const { addMatch } = useMatchStore();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [fixtures, setFixtures] = useState<TournamentFixture[]>([]);
  const [standingsByGroup, setStandingsByGroup] = useState<Record<number, GroupStanding[]>>({});
  const [scoringFixture, setScoringFixture] = useState<TournamentFixture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const bundle = await tournamentsApi.get(id);
    setTournament(bundle.tournament);
    setPlayers(bundle.players);
    setFixtures(bundle.fixtures);

    if (bundle.tournament.status === "groups") {
      const entries = await Promise.all(
        Array.from({ length: bundle.tournament.num_groups }, (_, g) =>
          tournamentsApi.groupStandings(id, g).then((s) => [g, s] as const)
        )
      );
      setStandingsByGroup(Object.fromEntries(entries));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
  // Pad every group's standings list to the same row count so the "Fixtures"
  // header lines up at the same height across all group cards.
  const maxStandingsRows = Math.max(1, ...Object.values(standingsByGroup).map((s) => s.length));

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

  function FixtureRow({ fixture }: { fixture: TournamentFixture }) {
    const [courtChoice, setCourtChoice] = useState<number | "">("");
    const isBye = !fixture.team_b;
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200">
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-gray-800 text-sm truncate">
            {pairName(fixture.team_a, members)} <span className="text-gray-300">vs</span> {pairName(fixture.team_b, members)}
          </p>
          <p className="text-xs font-display text-gray-400 capitalize">{isBye ? "bye — auto-advanced" : fixture.status}</p>
        </div>
        {!isBye && fixture.status === "pending" && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={courtChoice}
              onChange={(e) => setCourtChoice(e.target.value ? Number(e.target.value) : "")}
              className="text-xs font-display font-bold border border-gray-200 rounded-lg px-2 py-1.5"
            >
              <option value="">Court…</option>
              {idleCourts.map((c) => (
                <option key={c.id} value={c.id}>Court {c.id}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!courtChoice || busy}
              onClick={() => courtChoice && handleLaunch(fixture, courtChoice)}
            >
              Send
            </Button>
          </div>
        )}
        {!isBye && fixture.status === "active" && (
          <Button size="sm" variant="secondary" onClick={() => setScoringFixture(fixture)}>
            Enter Score
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gray-50 flex flex-col">
      <header className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 flex-shrink-0">
        <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center flex-shrink-0">
          <Trophy size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-display font-black text-gray-900 text-lg leading-tight">{tournament.name}</h1>
          <p className="text-gray-500 text-xs font-display capitalize">{tournament.status} stage</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 max-w-[1800px] w-full mx-auto">
        {error && <p className="text-sm font-display font-bold text-red-600">{error}</p>}

        {tournament.status === "groups" && (
          <>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${GROUP_GRID_COLS[tournament.num_groups] ?? "lg:grid-cols-4"} gap-4 items-start`}>
              {Array.from({ length: tournament.num_groups }, (_, g) => (
                <section key={g} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-4">
                  <h2 className="font-display font-black text-gray-900 text-sm">Group {g + 1}</h2>

                  {standingsByGroup[g]?.[0] && (
                    <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                      <Trophy size={14} className="text-violet-500 flex-shrink-0" />
                      <span className="text-xs font-display font-bold text-violet-700 truncate">
                        Leading: {pairName(standingsByGroup[g][0].pair, members)}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    {(standingsByGroup[g] ?? []).map((s, i) => (
                      <div key={s.pair.join("-")} className="h-6 flex items-center gap-2 text-sm font-display">
                        <span className="w-5 text-gray-400 font-bold">{i + 1}</span>
                        <div className="flex -space-x-2">
                          {s.pair.map((pid) => (
                            <Avatar key={pid} name={members[pid]?.name ?? "?"} size="xs" />
                          ))}
                        </div>
                        <span className="flex-1 font-bold text-gray-800 truncate">{pairName(s.pair, members)}</span>
                        <span className="text-gray-500">{s.wins}W {s.losses}L</span>
                        <span className="text-gray-400 w-10 text-right">{s.pointDiff >= 0 ? "+" : ""}{s.pointDiff}</span>
                      </div>
                    ))}
                    {/* Invisible filler rows so every group's standings block is the same height */}
                    {Array.from({ length: maxStandingsRows - (standingsByGroup[g]?.length ?? 0) }, (_, i) => (
                      <div key={`filler-${i}`} className="h-6" aria-hidden="true" />
                    ))}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-display font-bold text-gray-500 uppercase tracking-widest">Fixtures</h3>
                    <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-0.5">
                      {fixtures
                        .filter((f) => f.stage === "group" && f.group_index === g)
                        .map((f) => <FixtureRow key={f.id} fixture={f} />)}
                    </div>
                  </div>
                </section>
              ))}
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="font-display font-black text-gray-900 text-base">Next: Knockout</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {knockoutPreviewRounds(tournament.num_groups, tournament.advance_per_group).map((round) => (
                  <div key={round.label} className="bg-white rounded-2xl border border-gray-200 p-3 flex flex-col gap-2">
                    <h3 className="text-xs font-display font-bold text-gray-500 uppercase tracking-widest">{round.label}</h3>
                    {round.matchups.map(([a, b], i) => (
                      <div key={i} className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-xs font-display font-bold text-gray-500">
                        {a} <span className="text-gray-300">vs</span> {b}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {!allGroupFixturesComplete && (
                <p className="text-xs font-display font-bold text-amber-600">
                  Not every group fixture is finished yet — completing the group stage now will seed the bracket from the current standings.
                </p>
              )}
              <Button size="lg" fullWidth disabled={busy} onClick={handleGenerateKnockout}>
                ✅ Group Stage Completed — Generate Knockout
              </Button>
            </section>
          </>
        )}

        {(tournament.status === "knockout" || tournament.status === "complete") && (
          <KnockoutBracket
            fixtures={fixtures.filter((f) => f.stage === "knockout")}
            members={members}
            busy={busy}
            onAdvance={handleAdvanceRound}
            renderFixture={(f) => <FixtureRow key={f.id} fixture={f} />}
          />
        )}

        {tournament.status === "complete" && (
          <div className="bg-gradient-to-br from-violet-600 to-violet-500 rounded-2xl p-6 text-center text-white shadow-xl">
            <Trophy size={40} className="mx-auto mb-2" />
            <p className="font-display font-black text-lg">Tournament complete! 🎉</p>
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
  return (
    <div className="flex flex-col gap-5">
      {rounds.map((round) => {
        const roundFixtures = fixtures.filter((f) => f.round === round);
        const allComplete = roundFixtures.every((f) => f.status === "complete");
        const isLastRound = round === Math.max(...rounds);
        return (
          <section key={round} className="flex flex-col gap-2">
            <h2 className="text-xs font-display font-bold text-gray-500 uppercase tracking-widest">
              {roundFixtures.length === 1 ? "Final" : `Round ${round}`}
            </h2>
            {roundFixtures.map(renderFixture)}
            {allComplete && isLastRound && roundFixtures.length > 1 && (
              <Button disabled={busy} onClick={() => onAdvance(round)}>
                Advance to Next Round →
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}
