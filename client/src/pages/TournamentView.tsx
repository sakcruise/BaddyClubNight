import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useSessionStore, useMemberStore, useMatchStore, useQueueStore, useSessionArchiveStore } from "../store";
import { tournamentsApi } from "../services/tournaments";
import type { TournamentChampion } from "../services/tournaments";
import { matchesApi, sessionsApi } from "../services/api";
import type { GroupStanding } from "../utils/tournament";
import type { Tournament, TournamentFixture, TournamentPlayer } from "../types";
import Avatar from "../components/shared/Avatar";
import Button from "../components/shared/Button";
import ScoreEntry from "../components/scoring/ScoreEntry";
import TournamentTicker from "../components/tournament/TournamentTicker";
import { Trophy, RotateCcw, Play, Radio, Flag, ChevronLeft, ChevronRight, Maximize2, Minimize2, WifiOff } from "lucide-react";
import { isOffline } from "../services/api";

// Below this the board would be unreadable, so we stop shrinking and allow vertical scroll instead.
const MIN_FIT_ZOOM = 0.4;
// On big screens the board may scale up a little to fill the space, but not so far it looks blown up.
const MAX_FIT_ZOOM = 1.6;
// In the knockout stage the bracket may widen this much beyond its natural width to
// use a big screen, but no further - wider than this the cards look stretched.
const MAX_KNOCKOUT_STRETCH = 1.25;

// Champions from before the app kept records. Years the app has run are read from
// completed tournaments and take precedence over these.
const PAST_CHAMPIONS: Array<{ year: number; winners: string }> = [
  { year: 2025, winners: "Sakthi & Dilone" },
  { year: 2024, winners: "Sid & Hilary" },
];

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
  const [champions, setChampions] = useState<TournamentChampion[]>([]);
  const [showWinners, setShowWinners] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Browser full-screen for the wall/touch display.
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }
  const offline = isOffline();
  // During the knockout the groups collapse to a scoreboard; this flips them back to the full matrices.
  const [showFullGroups, setShowFullGroups] = useState(false);
  // During the group stage the knockout preview can be shrunk to a narrow qualifiers list.
  const [compactKnockout, setCompactKnockout] = useState(false);
  // How many group sheets per row. Chosen automatically by the fit logic below to make
  // the best use of the screen's shape (wide screens get more columns, tall ones fewer).
  const [groupCols, setGroupCols] = useState(2);
  const groupsGridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    let bundle: Awaited<ReturnType<typeof tournamentsApi.get>>;
    try {
      bundle = await tournamentsApi.get(id);
    } catch {
      // Tournament was deleted (e.g. reset from another screen) — drop the stale link and go home.
      const s = useSessionStore.getState().session;
      if (s?.tournament_id === id) useSessionStore.getState().setSession({ ...s, tournament_id: undefined });
      navigate("/", { replace: true });
      return;
    }
    setTournament(bundle.tournament);
    setPlayers(bundle.players);
    setFixtures(bundle.fixtures);

    const entries = await Promise.all(
      Array.from({ length: bundle.tournament.num_groups }, (_, g) =>
        tournamentsApi.groupStandings(id, g).then((s) => [g, s] as const)
      )
    );
    setStandingsByGroup(Object.fromEntries(entries));
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // Past champions come from completed tournaments; refresh once this one completes too.
  const tournamentStatus = tournament?.status;
  useEffect(() => {
    tournamentsApi.champions().then(setChampions).catch(() => {});
  }, [tournamentStatus]);

  // Fit-to-height: the whole board is zoomed down (never up) so it always fits under the
  // header without vertical scrolling. Horizontal scroll is fine. Clamped so it stays tappable.
  const fitOuterRef = useRef<HTMLElement>(null);
  const fitInnerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  useEffect(() => {
    const outer = fitOuterRef.current;
    const inner = fitInnerRef.current;
    if (!outer || !inner) return;
    const recompute = () => {
      // Real rendered height divided by the zoom currently applied gives the height at zoom 1,
      // whatever the browser's offset/scrollHeight semantics are under CSS zoom.
      const applied = parseFloat(inner.style.zoom || "1") || 1;
      // Switch the stretch off while measuring so we see the board's natural size.
      inner.style.minWidth = "0px";
      inner.style.minHeight = "0px";
      const rect = inner.getBoundingClientRect();
      const naturalH = rect.height / applied;
      const naturalW = rect.width / applied;
      const availableH = outer.clientHeight;
      const availableW = outer.clientWidth;
      if (naturalH <= 0 || naturalW <= 0 || availableH <= 0 || availableW <= 0) return;
      // Fit both axes: whichever is tighter wins, so nothing scrolls in either direction.
      // 1% margin so sub-pixel rounding never leaves a stray scrollbar.
      const fit = Math.min(availableH / naturalH, availableW / naturalW) * 0.995;
      const next = Math.max(MIN_FIT_ZOOM, Math.min(MAX_FIT_ZOOM, fit));
      setFitZoom((z) => (Math.abs(z - next) > 0.0005 ? next : z));
      // Zoom fits the tighter axis; stretch the board to fill the other so there are no gaps.
      // Only the group sheets can absorb a stretch (their tables share the extra space).
      // The bracket can't, so in the knockout stage the board keeps its shape and is centred.
      if (tournament?.status === "groups") {
        inner.style.minWidth = `${Math.floor(availableW / next)}px`;
        inner.style.minHeight = `${Math.floor(availableH / next)}px`;
      } else {
        inner.style.minWidth = `${Math.floor(Math.min(availableW / next, naturalW * MAX_KNOCKOUT_STRETCH))}px`;
      }

      // Would a different number of group columns fit larger? Estimate each candidate's
      // board size from one sheet's size and swap only for a clear (>3%) improvement.
      const grid = groupsGridRef.current;
      if (grid && grid.children.length > 1) {
        const n = grid.children.length;
        const gap = 24;
        const sheets = Array.from(grid.children).map((c) => c.getBoundingClientRect());
        const sheetW = Math.max(...sheets.map((r) => r.width)) / applied;
        const sheetH = Math.max(...sheets.map((r) => r.height)) / applied;
        const gridRect = grid.getBoundingClientRect();
        const gridW = gridRect.width / applied;
        const gridH = gridRect.height / applied;
        // The column is stretched to the row height, so measure the card inside it.
        const koH = (knockoutRef.current?.firstElementChild?.getBoundingClientRect().height ?? 0) / applied;
        const restW = naturalW - gridW;
        const restH = naturalH - Math.max(gridH, koH);
        let bestCols = groupCols;
        let bestFit = 0;
        let currentFit = 0;
        for (const cols of [1, 2, 3, 4]) {
          if (cols > n) continue;
          const rows = Math.ceil(n / cols);
          const w = cols * sheetW + (cols - 1) * gap + restW;
          const h = Math.max(rows * sheetH + (rows - 1) * gap, koH) + restH;
          const f = Math.min(availableW / w, availableH / h);
          if (cols === groupCols) currentFit = f;
          if (f > bestFit) { bestFit = f; bestCols = cols; }
        }
        if (bestCols !== groupCols && bestFit > currentFit * 1.03) setGroupCols(bestCols);
      }
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [tournament?.id, tournament?.status, groupCols]);

  // Once the bracket exists, slide it into view so the operator lands on the knockout, not the group scores.
  const knockoutRef = useRef<HTMLDivElement>(null);
  const status = tournament?.status;
  useEffect(() => {
    if (status === "knockout" || status === "complete") {
      knockoutRef.current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }
  }, [status]);

  // Header honours board: seeded years plus every completed tournament (newest first).
  const championsByYear = useMemo(() => {
    const byYear = new Map<number, { year: number; winners: string }>();
    for (const c of PAST_CHAMPIONS) byYear.set(c.year, c);
    for (const c of champions) byYear.set(c.year, { year: c.year, winners: pairName(c.pair, members) });
    return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
  }, [champions, members]);

  if (!tournament || !id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Prefer the saved record; otherwise derive it from the final on screen so the
  // overlay works the instant the final is scored.
  const thisChampion: TournamentChampion | null = (() => {
    const saved = champions.find((c) => c.tournamentId === tournament.id);
    if (saved) return saved;
    const ko = fixtures.filter((f) => f.stage === "knockout" && f.team_a);
    if (ko.length === 0) return null;
    const maxRound = Math.max(...ko.map((f) => f.round));
    const finals = ko.filter((f) => f.round === maxRound);
    if (finals.length !== 1 || finals[0].status !== "complete") return null;
    const final = finals[0];
    const m = final.match_id ? matches.find((x) => x.id === final.match_id) : undefined;
    if (final.team_b && (!m || m.score_a === undefined || m.score_b === undefined)) return null;
    const aWon = !final.team_b || m!.score_a! > m!.score_b!;
    return {
      tournamentId: tournament.id,
      year: new Date(tournament.created_at).getFullYear(),
      pair: (aWon ? final.team_a : final.team_b) as [string, string],
      runnersUp: final.team_b ? (aWon ? final.team_b : final.team_a) : null,
      score: m && m.score_a !== undefined && m.score_b !== undefined ? (aWon ? [m.score_a, m.score_b] : [m.score_b, m.score_a]) : null,
    };
  })();

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

  // Always launches: the group's own court, no busy check. Courts here are just labels —
  // the operator decides who's actually on which court.
  function handlePlayGroupFixture(g: number, fixture: TournamentFixture) {
    const court = courtForGroup(g);
    if (!court) { setError("No courts are set up for this session."); return; }
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
      // Knockout rounds advance themselves once their last score is in; after the final
      // this is what marks the tournament complete.
      if (fixture.stage === "knockout" && id) {
        const { fixtures: fresh } = await tournamentsApi.get(id);
        const round = fresh.filter((f) => f.stage === "knockout" && f.round === fixture.round);
        const hasNext = fresh.some((f) => f.stage === "knockout" && f.round > fixture.round);
        if (!hasNext && round.every((f) => f.status === "complete")) {
          await tournamentsApi.advanceRound(id, fixture.round);
        }
      }
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

  // Ending a finished tournament crowns the champions first; the result stays saved
  // (the tournament row is complete) and only the session link is dropped afterwards.
  async function handleEndTournament() {
    if (!tournament || !session) return;
    if (tournament.status === "complete") {
      setShowWinners(true);
      return;
    }
    // Final scored but not yet flagged complete (older data) — flag it now, then crown.
    const ko = fixtures.filter((f) => f.stage === "knockout" && f.team_a);
    const maxRound = ko.length ? Math.max(...ko.map((f) => f.round)) : 0;
    const finals = ko.filter((f) => f.round === maxRound);
    if (finals.length === 1 && finals[0].status === "complete") {
      setBusy(true);
      try {
        await tournamentsApi.advanceRound(tournament.id, maxRound);
        await load();
        setShowWinners(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not record the champions");
      } finally {
        setBusy(false);
      }
      return;
    }
    setShowExitConfirm(true);
  }

  // Leaving the tournament ends the night too, so the app lands on the home page.
  // The tournament row itself is kept (complete or not) - only the session closes.
  async function finishTournament() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.unlinkSession(session.id);
      archiveSession({ ...session, tournament_id: undefined, status: "ended" }, matches);
      await sessionsApi.end(session.id);
      endSession();
      setMatches([]);
      setQueue([]);
      setActiveMemberIds(new Set());
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the tournament");
      setShowWinners(false);
      setShowExitConfirm(false);
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
      `truncate font-body font-medium text-[15px] ${hasScore ? (won ? "text-emerald-700" : "text-gray-400 line-through decoration-gray-300") : "text-gray-700"}`;
    // First free court if there is one, otherwise just the first court — never blocked.
    const freeCourt = idleCourts[0] ?? sortedCourts[0];

    return (
      <div
        className={`flex flex-col gap-2 p-3 rounded-2xl border bg-white
          ${fixture.status === "active" ? "border-amber-300 shadow-md shadow-amber-100" : "border-gray-200"}`}
      >
        <div className="flex items-center gap-2">
          <span className={nameCls(aWon)}>{pairName(fixture.team_a, members)}</span>
          {hasScore && <span className="ml-auto font-display font-bold tabular-nums text-sm text-gray-800">{scoreA}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={nameCls(hasScore && !aWon)}>{pairName(fixture.team_b, members)}</span>
          {hasScore && <span className="ml-auto font-display font-bold tabular-nums text-sm text-gray-800">{scoreB}</span>}
        </div>

        {isBye && <p className="text-[11px] font-display font-semibold text-gray-400">Bye — goes straight through</p>}

        {!isBye && fixture.status === "pending" && (
          <Button size="md" fullWidth disabled={busy || !freeCourt} onClick={() => freeCourt && handleLaunch(fixture, freeCourt.id)}>
            <Play size={14} /> Play
          </Button>
        )}
        {!isBye && fixture.status === "active" && (
          <div className="flex gap-2">
            <Button size="md" fullWidth onClick={() => setScoringFixture(fixture)}>
              <Radio size={14} /> Score
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
    <div className="h-screen h-[100dvh] bg-gray-50 flex flex-col overflow-hidden antialiased">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center flex-shrink-0">
          <Trophy size={18} className="text-white" />
        </div>
        <div className="min-w-[120px]">
          <h1 className="font-display font-bold text-gray-900 text-lg leading-tight">{tournament.name}</h1>
          <p className="text-gray-500 text-xs font-display capitalize">{tournament.status} stage</p>
        </div>
        <div className="flex-1 flex flex-wrap items-center gap-2 px-2">
          {championsByYear.map((c) => (
            <span
              key={c.year}
              className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-display font-semibold text-amber-800"
            >
              <Trophy size={12} className="text-amber-500" />
              <span className="text-amber-500">{c.year}</span> {c.winners}
            </span>
          ))}
        </div>
        {offline && (
          <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-display font-semibold">
            <WifiOff size={14} /> Offline — saved on this device
          </span>
        )}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit full screen" : "Full screen"}
          aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-xs font-display font-semibold hover:bg-gray-100 transition-all"
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {isFullscreen ? "Exit" : "Full screen"}
        </button>
        <button
          onClick={handleResetGroups}
          disabled={busy}
          title="Delete this draft and re-pick players"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-xs font-display font-semibold hover:bg-gray-100 transition-all disabled:opacity-50"
        >
          <RotateCcw size={14} /> Reset Groups
        </button>
        <button
          onClick={handleEndTournament}
          disabled={busy}
          title="Stop the tournament, keep club night running"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-display font-semibold hover:bg-amber-100 transition-all disabled:opacity-50"
        >
          <Flag size={14} /> End Tournament
        </button>
      </header>

      <TournamentTicker
        tournament={tournament}
        fixtures={fixtures}
        standingsByGroup={standingsByGroup}
        matches={matches}
        members={members}
        courts={courts}
      />

      <main
        ref={fitOuterRef}
        className={`flex-1 min-h-0 w-full flex ${fitZoom <= MIN_FIT_ZOOM ? "overflow-auto" : "overflow-hidden"}`}
      >
       <div ref={fitInnerRef} style={{ zoom: fitZoom }} className="px-5 py-5 flex flex-col gap-4 w-max shrink-0 m-auto">
        {error && <p className="text-sm font-display font-semibold text-red-600">{error}</p>}

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
                <h2 className="text-xs font-display font-bold text-amber-700 uppercase tracking-widest">
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
                        <span className="text-[10px] font-display font-bold text-amber-600 bg-amber-100 rounded-md px-1.5 py-0.5">
                          Court {match.court_id}
                        </span>
                      )}
                      <span className="text-xs font-display font-semibold text-gray-800">
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-display font-semibold text-gray-400 px-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-violet-100 border border-violet-300 text-violet-800 px-1.5 py-0.5">
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
          <div className="flex items-stretch gap-6 flex-1 min-h-0">
            {/* Knockout / complete: groups collapse to a compact scoreboard so the bracket gets the screen */}
            {tournament.status !== "groups" && !showFullGroups && (
              <div className="grid grid-cols-2 gap-3 flex-shrink-0 w-max self-center">
                {Array.from({ length: tournament.num_groups }, (_, g) => {
                  const rows = standingsByGroup[g] ?? [];
                  return (
                    <section key={g} className="bg-white rounded-2xl border border-gray-200 p-3 w-[270px]">
                      <h2 className="font-display font-bold text-gray-900 text-sm mb-1.5">Group {g + 1}</h2>
                      <ol className="flex flex-col gap-0.5">
                        {rows.map((s, i) => (
                          <li
                            key={s.pair.join("-")}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-body
                              ${i < tournament.advance_per_group ? "bg-violet-50 text-violet-800 font-semibold" : "text-gray-700 font-medium"}`}
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
            <div
              ref={groupsGridRef}
              className={`grid gap-6 ${tournament.status === "groups" ? "flex-1 min-w-0" : "flex-shrink-0 w-max"}`}
              style={
                tournament.status === "groups"
                  ? { gridTemplateColumns: `repeat(${Math.min(groupCols, tournament.num_groups)}, minmax(0, 1fr))`, gridAutoRows: "1fr" }
                  : { gridTemplateColumns: `repeat(${Math.min(groupCols, tournament.num_groups)}, max-content)` }
              }
            >
                {Array.from({ length: tournament.num_groups }, (_, g) => {
                  // Rows/columns stay in drafted pair order so the sheet doesn't reshuffle after
                  // every score; the ranked standings only drive the leader badge and highlight.
                  const ranked = standingsByGroup[g] ?? [];
                  const draftedPairs = Object.values(
                    players
                      .filter((p) => p.group_index === g && p.pair_index != null)
                      .reduce<Record<number, string[]>>((acc, p) => {
                        (acc[p.pair_index!] ??= []).push(p.member_id);
                        return acc;
                      }, {})
                  );
                  const rows = draftedPairs
                    .filter((ids) => ids.length === 2)
                    .map((ids) => ranked.find((s) => pairEq(s.pair, ids as [string, string])))
                    .filter((s): s is GroupStanding => !!s);
                  const leader = ranked[0];
                  return (
                    <section key={g} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3 w-full h-full min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display font-bold text-gray-900 text-base">Group {g + 1}</h2>
                        {leader && (
                          <span className="flex items-center gap-1.5 text-[15px] font-body font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-3 py-0.5">
                            <Trophy size={13} className="text-violet-500" /> {pairName(leader.pair, members)}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col min-h-0">
                        <table className="border-collapse text-sm font-display w-full flex-1">
                          <thead>
                            <tr>
                              <th className="sticky left-0 z-10 bg-white p-2 text-left text-[10px] text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-200">
                                Pair
                              </th>
                              {rows.map((s) => (
                                <th key={s.pair.join("-")} className="p-2 font-body font-normal text-[13px] text-gray-600 border-b border-gray-200 min-w-[110px] whitespace-nowrap">
                                  {pairName(s.pair, members)}
                                </th>
                              ))}
                              <th className="p-2 font-body font-normal text-[13px] text-gray-600 border-b border-gray-200 min-w-[96px] whitespace-nowrap">Points Won</th>
                              <th className="p-2 font-body font-normal text-[13px] text-gray-600 border-b border-gray-200 min-w-[80px]">Average</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((rowS, ri) => {
                              const played = rowS.wins + rowS.losses;
                              const avg = played > 0 ? rowS.pointsFor / played : 0;
                              const isLeader = !!leader && pairEq(leader.pair, rowS.pair);
                              return (
                                <tr key={rowS.pair.join("-")} className={isLeader ? "bg-violet-50/60" : ""}>
                                  <th scope="row" className="sticky left-0 z-10 bg-inherit p-2 text-left border-b border-gray-100 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex -space-x-2 flex-shrink-0">
                                        {rowS.pair.map((pid) => (
                                          <Avatar key={pid} name={members[pid]?.name ?? "?"} size="xs" />
                                        ))}
                                      </div>
                                      <span className="font-body font-medium text-gray-700 text-[15px] tracking-tight">{pairName(rowS.pair, members)}</span>
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
                                            className={`w-full min-h-[44px] rounded-lg py-2 font-display font-bold text-sm tabular-nums border transition-colors
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
                                            <span className="text-[10px] font-display font-bold uppercase tracking-wide">Live</span>
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
                                          <span className="block py-1.5 text-[10px] text-gray-300 font-display font-semibold">bye</span>
                                        ) : (
                                          <button
                                            onClick={() => handlePlayGroupFixture(g, fixture)}
                                            disabled={busy}
                                            className="w-full min-h-[44px] flex items-center justify-center gap-1 rounded-lg py-2 bg-violet-100 border border-violet-300 text-violet-800
                                                       active:bg-violet-200 active:scale-95 transition-all disabled:opacity-50"
                                          >
                                            <Play size={10} className="flex-shrink-0" />
                                            <span className="text-[10px] font-display font-semibold">Play</span>
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="border-b border-gray-100 text-center font-body font-semibold text-gray-700 tabular-nums text-base">
                                    {rowS.pointsFor}
                                  </td>
                                  <td className="border-b border-gray-100 text-center font-body font-semibold text-violet-600 tabular-nums text-base">
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
                  setTimeout(() => {
                    if (next) fitOuterRef.current?.scrollTo({ left: 0, behavior: "smooth" });
                    else knockoutRef.current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
                  }, 50);
                }}
                className="self-stretch flex-shrink-0 w-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col items-center justify-center gap-2 text-violet-600 active:bg-violet-50"
                aria-label={showFullGroups ? "Back to compact groups" : "Show full group scores"}
              >
                {showFullGroups ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
                <span className="text-[10px] font-display font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">
                  {showFullGroups ? "Compact" : "Full groups"}
                </span>
              </button>
            )}

            {tournament.status === "groups" && (
              <button
                onClick={() => {
                  setCompactKnockout((v) => !v);
                  // Layout width changes underneath the scroll position; go back to the start.
                  setTimeout(() => fitOuterRef.current?.scrollTo({ left: 0, behavior: "smooth" }), 50);
                }}
                className="self-stretch flex-shrink-0 w-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col items-center justify-center gap-2 text-violet-600 active:bg-violet-50"
                aria-label={compactKnockout ? "Show full knockout bracket" : "Compact the knockout bracket"}
              >
                {compactKnockout ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
                <span className="text-[10px] font-display font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">
                  {compactKnockout ? "Full knockout" : "Compact"}
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
                if (compactKnockout) {
                  const slots = previewRounds[0].matchups.flat();
                  return (
                    <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3 w-[250px]">
                      <div>
                        <h2 className="font-display font-bold text-gray-900 text-base leading-tight">Knockout</h2>
                        <p className="text-[11px] font-display text-gray-500 mt-0.5">Who's through if groups ended now</p>
                      </div>
                      <ol className="flex flex-col gap-1">
                        {slots.map((label, i) => {
                          const isReal = label !== "Bye" && !/^Group \d/.test(label);
                          return (
                            <li
                              key={i}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-display font-semibold
                                ${label === "Bye" ? "text-gray-300" : isReal ? "bg-violet-50 text-violet-800" : "text-gray-400"}`}
                            >
                              <span className="w-3 text-gray-300 tabular-nums">{i + 1}</span>
                              <span className="truncate">{label}</span>
                            </li>
                          );
                        })}
                      </ol>
                      <Button size="md" fullWidth disabled={busy} onClick={handleGenerateKnockout}>
                        <Trophy size={16} /> Generate
                      </Button>
                    </section>
                  );
                }
                return (
                  <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col gap-5">
                    <div>
                      <h2 className="font-display font-bold text-gray-900 text-lg leading-tight">Knockout</h2>
                      <p className="text-xs font-display text-gray-500 mt-0.5">
                        Names fill in as each group's leader changes — this is who'd go through if the groups ended now.
                      </p>
                    </div>
                    <div>
                      <div className="grid gap-x-8 mb-3" style={{ gridTemplateColumns: `repeat(${previewRounds.length}, 220px)` }}>
                        {previewRounds.map((r) => (
                          <h3 key={r.label} className="text-[10px] font-display font-semibold text-gray-400 uppercase tracking-widest text-center">
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
                            <div className={`px-3 py-3 rounded-xl border text-xs font-display font-semibold text-center leading-snug
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
                      <p className="text-xs font-display font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
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
                    <h2 className="font-display font-bold text-gray-900 text-lg leading-tight">Knockout</h2>
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
                <button
                  onClick={() => setShowWinners(true)}
                  className="bg-gradient-to-br from-violet-600 to-violet-500 rounded-2xl p-6 text-center text-white shadow-xl active:scale-[0.98] transition-transform"
                >
                  <Trophy size={40} className="mx-auto mb-2" />
                  <p className="font-display font-bold text-lg">Tournament complete! 🎉</p>
                  <p className="text-xs font-display font-semibold text-violet-100 mt-1">Tap to crown the champions</p>
                </button>
              )}
            </div>
          </div>
        )}
       </div>
      </main>

      {scoringFixture?.match_id && (
        <ScoreEntry
          matchId={scoringFixture.match_id}
          onClose={() => setScoringFixture(null)}
          onSaved={() => handleScoreSaved(scoringFixture)}
        />
      )}


      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-7 flex flex-col gap-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Flag size={26} className="text-amber-600" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-gray-900">Exit the tournament?</h2>
              <p className="text-sm font-display text-gray-500 mt-1">
                The final hasn't been played, so no champions will be recorded. Exiting ends tonight's session and takes you back to the home page.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="ghost" size="lg" fullWidth onClick={() => setShowExitConfirm(false)}>
                Keep playing
              </Button>
              <Button size="lg" fullWidth disabled={busy} onClick={finishTournament}>
                Yes, exit
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {showWinners && thisChampion && (
        <div className="fixed inset-0 z-50 bg-violet-950/80 backdrop-blur-sm flex items-center justify-center p-6">
          {/* Confetti */}
          {Array.from({ length: 40 }, (_, i) => (
            <motion.span
              key={i}
              initial={{ y: -40, x: 0, opacity: 0, rotate: 0 }}
              animate={{ y: "110vh", x: (i % 5 - 2) * 60, opacity: [0, 1, 1, 0.6], rotate: 720 }}
              transition={{ duration: 3.5 + (i % 7) * 0.4, delay: (i % 10) * 0.25, repeat: Infinity, ease: "linear" }}
              className="pointer-events-none absolute top-0 w-2.5 h-4 rounded-sm"
              style={{ left: `${(i * 37) % 100}%`, background: ["#f59e0b", "#a78bfa", "#34d399", "#f87171", "#60a5fa", "#f472b6"][i % 6] }}
            />
          ))}
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 text-center flex flex-col items-center gap-5"
          >
            <motion.div
              animate={{ rotate: [0, -8, 8, -4, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
              className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-300/50"
            >
              <Trophy size={48} className="text-white" />
            </motion.div>
            <div>
              <p className="text-xs font-display font-bold uppercase tracking-[0.3em] text-amber-500">{thisChampion.year} Champions</p>
              <h2 className="font-display font-bold text-3xl text-gray-900 leading-tight mt-1">
                {thisChampion.pair.map((id) => members[id]?.name ?? "?").join(" & ")}
              </h2>
            </div>
            <div className="flex -space-x-3">
              {thisChampion.pair.map((id) => (
                <div key={id} className="ring-4 ring-white rounded-full">
                  <Avatar name={members[id]?.name ?? "?"} url={members[id]?.avatar_url} memberType={members[id]?.member_type} size="lg" />
                </div>
              ))}
            </div>
            {thisChampion.runnersUp && (
              <p className="text-sm font-display font-semibold text-gray-500">
                Runners-up: {pairName(thisChampion.runnersUp, members)}
                {thisChampion.score && <span className="text-gray-400"> · {thisChampion.score[0]}-{thisChampion.score[1]} in the final</span>}
              </p>
            )}
            <p className="text-xs font-display text-gray-400">Saved to the club's honours board — they'll show in the header next year. Finishing ends tonight's session.</p>
            <div className="flex gap-3 w-full mt-2">
              <Button variant="ghost" size="lg" onClick={() => setShowWinners(false)}>
                Back
              </Button>
              <Button size="lg" fullWidth disabled={busy} onClick={finishTournament}>
                Finish · Back to Home
              </Button>
            </div>
          </motion.div>
        </div>
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
          <h2 key={ri} className="text-[10px] font-display font-semibold text-gray-400 uppercase tracking-widest text-center">
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
            <div className="p-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-xs font-display font-semibold text-gray-400 flex flex-col gap-2">
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
