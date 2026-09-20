import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MemberManagement from "../components/admin/MemberManagement";
import { useSessionStore, useMemberStore, useMatchStore, useQueueStore, useSessionArchiveStore } from "../store";
import { tournamentsApi } from "../services/tournaments";
import type { TournamentChampion } from "../services/tournaments";
import { matchesApi, sessionsApi } from "../services/api";
import { selectQualifiers } from "../utils/tournament";
import type { GroupStanding, KnockoutQualifier } from "../utils/tournament";
import type { Tournament, TournamentFixture, TournamentPlayer } from "../types";
import Avatar from "../components/shared/Avatar";
import Button from "../components/shared/Button";
import ScoreEntry from "../components/scoring/ScoreEntry";
import TournamentTicker from "../components/tournament/TournamentTicker";
import TournamentStats from "../components/tournament/TournamentStats";
import { Trophy, RotateCcw, Play, Radio, Flag, ChevronLeft, ChevronRight, Maximize2, Minimize2, WifiOff, Users, X } from "lucide-react";
import { isOffline } from "../services/api";

// Below this the board would be unreadable, so we stop shrinking and allow vertical scroll instead.
const MIN_FIT_ZOOM = 0.4;
// On big screens the board may scale up a little to fill the space, but not so far it looks blown up.
const MAX_FIT_ZOOM = 1.6;
// In the knockout stage the bracket may widen this much beyond its natural width to
// use a big screen, but no further - wider than this the cards look stretched.
const MAX_KNOCKOUT_STRETCH = 1.6;

// One accent per group so the sheets are telling apart at a glance; cycles past six.
const GROUP_ACCENTS = [
  { header: "bg-violet-50 border-violet-100", badge: "bg-violet-600", bar: "bg-violet-500", text: "text-violet-600" },
  { header: "bg-sky-50 border-sky-100", badge: "bg-sky-600", bar: "bg-sky-500", text: "text-sky-600" },
  { header: "bg-emerald-50 border-emerald-100", badge: "bg-emerald-600", bar: "bg-emerald-500", text: "text-emerald-600" },
  { header: "bg-amber-50 border-amber-100", badge: "bg-amber-500", bar: "bg-amber-500", text: "text-amber-600" },
  { header: "bg-rose-50 border-rose-100", badge: "bg-rose-500", bar: "bg-rose-500", text: "text-rose-600" },
  { header: "bg-teal-50 border-teal-100", badge: "bg-teal-600", bar: "bg-teal-500", text: "text-teal-600" },
];

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

// The knockout is always eight pairs: the top `advancePerGroup` from every
// group, then the best of the rest across all groups by average points.
const KNOCKOUT_PAIRS = 8;

/** Preview of the knockout bracket shape before it's generated — same seeding
 * order buildKnockoutBracket uses (rank asc, then group asc; top seed vs
 * bottom seed), with "Group N Winner" / "Best of the rest" placeholders. Only
 * round 1 names real slots; later rounds are TBD vs TBD. Never a bye. */
function knockoutPreviewRounds(
  numGroups: number,
  advancePerGroup: number,
  labelFor: (groupIndex: number, rank: number) => string = (g, r) => qualifierLabel(g, r, advancePerGroup)
): Array<{ label: string; matchups: [string, string][] }> {
  const labels: string[] = [];
  for (let rank = 1; rank <= advancePerGroup && labels.length < KNOCKOUT_PAIRS; rank++) {
    for (let g = 0; g < numGroups && labels.length < KNOCKOUT_PAIRS; g++) labels.push(labelFor(g, rank));
  }
  for (let k = 1; labels.length < KNOCKOUT_PAIRS; k++) labels.push(`Best of the rest #${k}`);
  const bracketSize = KNOCKOUT_PAIRS;

  const round1: [string, string][] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    round1.push([labels[i], labels[bracketSize - 1 - i]]);
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
  const [showRoster, setShowRoster] = useState(false);
  // Per-court dropdown choice, keyed by court id, before "Send to court" is tapped.
  const [courtChoice, setCourtChoice] = useState<Record<number, string>>({});
  // Knockout card whose pairs are being edited (pending fixtures only).
  const [editingKoFixture, setEditingKoFixture] = useState<string | null>(null);
  const [showResetKnockout, setShowResetKnockout] = useState(false);
  // Which group-stage cell has its court chooser open.
  const [courtPickerFor, setCourtPickerFor] = useState<string | null>(null);
  const [showKnockoutConfig, setShowKnockoutConfig] = useState(false);
  const [knockoutConfig, setKnockoutConfig] = useState({ qf: 11, sf: 13, f: 15 });
  // Operator-reviewed knockout field. Seeded from selectQualifiers when the dialog opens;
  // any slot can be swapped for another group pair.
  const [koField, setKoField] = useState<KnockoutQualifier[]>([]);
  const [koTie, setKoTie] = useState<KnockoutQualifier[] | null>(null);
  function openKnockoutConfig() {
    if (!tournament) return;
    const { qualifiers, tiedForLast } = selectQualifiers(standingsByGroup, tournament.advance_per_group);
    setKoField(qualifiers);
    setKoTie(tiedForLast);
    setShowKnockoutConfig(true);
  }

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
  // Knockout stage: how big the groups panel is relative to the bracket. The operator
  // nudges it with the +/- on the divider; remembered on this device.
  const [groupsScale, setGroupsScale] = useState(() => {
    const v = parseFloat(localStorage.getItem("tournament-groups-scale") ?? "1");
    return Number.isFinite(v) ? Math.min(2, Math.max(0.5, v)) : 1;
  });
  function nudgeGroupsScale(delta: number) {
    setGroupsScale((s) => {
      const next = Math.round(Math.min(2, Math.max(0.5, s + delta)) * 100) / 100;
      localStorage.setItem("tournament-groups-scale", String(next));
      return next;
    });
  }

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
  // Phones/small tablets get a stacked, scrollable layout instead of the fit-to-screen board.
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    const outer = fitOuterRef.current;
    const inner = fitInnerRef.current;
    if (!outer || !inner) return;
    if (isMobile) {
      inner.style.minWidth = "0px";
      inner.style.minHeight = "0px";
      setFitZoom(1);
      return;
    }
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
    // Coalesce to one measurement per frame. The observer only watches the viewport
    // (outer): watching the board itself fed back into the zoom/min-width it sets,
    // which oscillated visibly when a card changed size (e.g. Play on a knockout match).
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(outer);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // Content changes (fixtures/matches/standings) re-run this via the deps below.
  }, [tournament?.id, tournament?.status, groupCols, isMobile, fixtures, matches, standingsByGroup, compactKnockout, showFullGroups, groupsScale]);

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
  // Round robin spreads over all six courts; the knockout is played on courts 1–3 only.
  const KNOCKOUT_COURTS = 3;
  const stageCourts = tournament?.status === "groups" ? courts : courts.filter((c) => c.id <= KNOCKOUT_COURTS);
  const idleCourts = stageCourts.filter((c) => c.status === "idle");

  // Matches waiting for a court in the current stage: not started, both pairs
  // known, and nobody in them already on a court.
  function eligiblePool(): TournamentFixture[] {
    if (!tournament) return [];
    const stage = tournament.status === "groups" ? "group" : "knockout";
    const onCourt = new Set(
      fixtures.filter((f) => f.status === "active").flatMap((f) => [...(f.team_a ?? []), ...(f.team_b ?? [])])
    );
    return fixtures.filter(
      (f) => f.stage === stage && f.status === "pending" && f.team_a && f.team_b && ![...f.team_a, ...f.team_b].some((id) => onCourt.has(id))
    );
  }

  async function sendToCourts(plan: Array<[TournamentFixture, number]>) {
    if (!session || plan.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const [f, courtId] of plan) {
        const match = await tournamentsApi.launchFixture(f, session.id, courtId);
        addMatch(match);
        updateCourtStatus(courtId, "playing", match.id);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send to court");
    } finally {
      setBusy(false);
    }
  }

  // 🎲 Fill every free court with a random waiting match, re-checking the pool
  // after each pick so a pair can't be sent to two courts in the same pass.
  function handleRandomAssignAll() {
    const free = [...idleCourts].sort((a, b) => a.id - b.id);
    const taken = new Set<string>();
    const plan: Array<[TournamentFixture, number]> = [];
    for (const court of free) {
      const pool = eligiblePool().filter((f) => ![...f.team_a!, ...f.team_b!].some((id) => taken.has(id)));
      if (pool.length === 0) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      [...pick.team_a!, ...pick.team_b!].forEach((id) => taken.add(id));
      plan.push([pick, court.id]);
    }
    if (plan.length === 0) { setError(free.length === 0 ? "No free courts." : "No matches ready — waiting on results elsewhere."); return; }
    sendToCourts(plan);
  }

  function handleRandomAssignOne(courtId: number) {
    const pool = eligiblePool();
    if (pool.length === 0) { setError("No matches ready — waiting on results elsewhere."); return; }
    sendToCourts([[pool[Math.floor(Math.random() * pool.length)], courtId]]);
  }

  // Free a court without recording a result — puts the match back in the pool.
  async function handleFreeCourt(fixture: TournamentFixture) {
    await handleResetFixture(fixture);
  }

  // Live matches can be moved to another court (someone's already on the one we sent them to).
  async function handleMoveCourt(fixture: TournamentFixture, courtId: number) {
    const match = fixture.match_id ? matches.find((m) => m.id === fixture.match_id) : undefined;
    if (!match || match.court_id === courtId) { setCourtPickerFor(null); return; }
    setBusy(true);
    setError(null);
    try {
      const { match: moved } = await matchesApi.moveCourt(match.id, courtId);
      updateCourtStatus(match.court_id, "idle");
      updateCourtStatus(courtId, "playing", moved.id);
      setCourtPickerFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move that match");
    } finally {
      setBusy(false);
    }
  }

  // Compact court chooser shown inside a group cell: one chip per court, free ones bold.
  function CourtChips({ current, onPick }: { current?: number; onPick: (courtId: number) => void }) {
    return (
      <div className="flex flex-wrap justify-center gap-1 py-1">
        {[...stageCourts].sort((a, b) => a.id - b.id).map((c) => {
          const free = c.status === "idle";
          const isCurrent = c.id === current;
          return (
            <button
              key={c.id}
              onClick={(e) => { e.stopPropagation(); onPick(c.id); }}
              disabled={busy || isCurrent}
              title={free ? `Court ${c.id} — free` : `Court ${c.id} — in use`}
              className={`min-w-[34px] h-8 px-1.5 rounded-lg font-display font-bold text-xs tabular-nums transition-all active:scale-95
                ${isCurrent ? "bg-violet-600 text-white" : free ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-gray-100 text-gray-400 border border-gray-200"}`}
            >
              C{c.id}
            </button>
          );
        })}
      </div>
    );
  }

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

  // Group N's "home" court (Group 1 -> court 1, ...) is only a hint on the Play
  // button; the operator picks the actual court per match.
  const sortedCourts = [...courts].sort((a, b) => a.id - b.id);
  function courtForGroup(g: number) {
    return sortedCourts.length > 0 ? sortedCourts[g % sortedCourts.length] : undefined;
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

  // Group matches are sudden death to 11. Knockout rounds play to whatever the
  // operator set when generating the bracket (QF / SF / Final).
  function targetPointsFor(fixture: TournamentFixture): number {
    if (fixture.stage === "group") return 11;
    const cfg = tournament?.knockout_config ?? { qf: 11, sf: 13, f: 15 };
    const roundSize = fixtures.filter((f) => f.stage === "knockout" && f.round === fixture.round).length;
    if (roundSize === 1) return cfg.f;
    if (roundSize === 2) return cfg.sf;
    return cfg.qf;
  }

  async function handleSetKoTeams(fixture: TournamentFixture, teamA: [string, string], teamB: [string, string]) {
    setBusy(true);
    setError(null);
    try {
      await tournamentsApi.setFixtureTeams(fixture.id, teamA, teamB);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change that pairing");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetKnockout() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const ko = fixtures.filter((f) => f.stage === "knockout" && f.match_id);
      await tournamentsApi.resetKnockout(id);
      ko.forEach((f) => {
        const m = matches.find((x) => x.id === f.match_id);
        if (m) updateCourtStatus(m.court_id, "idle");
      });
      setMatches(matches.filter((m) => !ko.some((f) => f.match_id === m.id)));
      setShowResetKnockout(false);
      setEditingKoFixture(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset the knockout");
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
    setShowKnockoutConfig(false);
    try {
      await tournamentsApi.generateKnockout(id, knockoutConfig, koField);
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
    // First free court if there is one, otherwise just the first court — never blocked.
    const freeCourt = idleCourts[0] ?? sortedCourts[0];

    // "QF 2", "SF 1", "Final" — position within its round, by seed order.
    const roundFixtures = fixtures
      .filter((f) => f.stage === "knockout" && f.round === fixture.round)
      .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    const roundLabel = knockoutRoundLabel(roundFixtures.length);
    const shortRound = roundLabel === "Final" ? "Final" : roundLabel === "Semi-Final" ? "SF" : roundLabel === "Quarter-Final" ? "QF" : `R${roundFixtures.length * 2}`;
    const matchTag = roundLabel === "Final" ? "Final" : `${shortRound} ${roundFixtures.findIndex((f) => f.id === fixture.id) + 1}`;

    const edge = isBye
      ? "border-l-gray-200"
      : fixture.status === "active"
        ? "border-l-amber-400"
        : fixture.status === "complete"
          ? "border-l-emerald-400"
          : "border-l-violet-300";

    const Team = ({ ids, score, won, lost }: { ids: [string, string] | null; score?: number; won: boolean; lost: boolean }) => (
      <div className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${won ? "bg-emerald-50" : ""}`}>
        {ids ? (
          <div className="flex -space-x-2 flex-shrink-0">
            {ids.map((id) => (
              <Avatar key={id} name={members[id]?.name ?? "?"} url={members[id]?.avatar_url} memberType={members[id]?.member_type} size="xs" />
            ))}
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-100 border border-dashed border-gray-300 flex-shrink-0" />
        )}
        <span className={`flex-1 truncate font-body text-[15px] ${won ? "font-semibold text-emerald-800" : lost ? "font-normal text-gray-400 line-through decoration-gray-300" : "font-medium text-gray-700"}`}>
          {pairName(ids, members)}
        </span>
        {score !== undefined && (
          <span className={`font-display font-bold tabular-nums text-base ${won ? "text-emerald-700" : "text-gray-400"}`}>{score}</span>
        )}
        {won && <Trophy size={13} className="text-emerald-500 flex-shrink-0" />}
      </div>
    );

    return (
      <div
        className={`flex flex-col gap-1.5 p-2.5 pl-3 rounded-2xl border border-l-4 bg-white ${edge}
          ${fixture.status === "active" ? "border-amber-300 shadow-md shadow-amber-100" : "border-gray-200"}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-display font-bold uppercase tracking-widest text-gray-400">{matchTag}</span>
          {match && !isBye && (
            <span className="text-[10px] font-display font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">Court {match.court_id}</span>
          )}
          <span className="ml-auto">
            {isBye ? (
              <span className="text-[10px] font-display font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Bye</span>
            ) : fixture.status === "active" ? (
              <span className="flex items-center gap-1 text-[10px] font-display font-bold uppercase text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Live
              </span>
            ) : fixture.status === "complete" ? (
              <span className="text-[10px] font-display font-bold uppercase text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">Done</span>
            ) : (
              <span className="text-[10px] font-display font-semibold uppercase text-violet-600 bg-violet-50 rounded-full px-2 py-0.5">Up next</span>
            )}
          </span>
        </div>

        <Team ids={fixture.team_a} score={hasScore ? scoreA : undefined} won={hasScore && aWon} lost={hasScore && !aWon} />
        <div className="flex items-center gap-2 -my-0.5">
          <span className="flex-1 h-px bg-gray-100" />
          <span className="text-[9px] font-display font-bold tracking-widest text-gray-300">VS</span>
          <span className="flex-1 h-px bg-gray-100" />
        </div>
        <Team ids={fixture.team_b} score={hasScore ? scoreB : undefined} won={hasScore && !aWon} lost={hasScore && aWon} />

        {isBye && <p className="text-[11px] font-body text-gray-400 px-1.5">Goes straight through to the next round</p>}

        {!isBye && fixture.status === "pending" && editingKoFixture === fixture.id && (() => {
          const allPairs = Object.entries(standingsByGroup).flatMap(([g, st]) =>
            st.map((s, i) => ({ key: s.pair.join("-"), pair: s.pair, label: `G${Number(g) + 1} #${i + 1} · ${pairName(s.pair, members)}` }))
          );
          const usedElsewhere = new Set(
            fixtures
              .filter((f) => f.stage === "knockout" && f.round === fixture.round && f.id !== fixture.id)
              .flatMap((f) => [f.team_a?.join("-"), f.team_b?.join("-")])
          );
          const Sel = ({ value, onPick }: { value: [string, string] | null; onPick: (p: [string, string]) => void }) => (
            <select
              value={value?.join("-") ?? ""}
              onChange={(e) => { const p = allPairs.find((x) => x.key === e.target.value); if (p) onPick(p.pair); }}
              className="w-full h-9 text-xs font-display font-semibold bg-white border-2 border-orange-200 rounded-xl px-1.5"
            >
              {allPairs.map((p) => (
                <option key={p.key} value={p.key} disabled={usedElsewhere.has(p.key)}>{p.label}</option>
              ))}
            </select>
          );
          return (
            <div className="flex flex-col gap-1.5 rounded-xl bg-orange-50 border border-orange-200 p-2">
              <Sel value={fixture.team_a} onPick={(p) => fixture.team_b && handleSetKoTeams(fixture, p, fixture.team_b)} />
              <Sel value={fixture.team_b} onPick={(p) => fixture.team_a && handleSetKoTeams(fixture, fixture.team_a, p)} />
              <Button size="sm" variant="ghost" fullWidth onClick={() => setEditingKoFixture(null)}>Done</Button>
            </div>
          );
        })()}
        {!isBye && fixture.status === "pending" && editingKoFixture !== fixture.id && (
          <div className="flex gap-2">
            <Button size="md" fullWidth disabled={busy || !freeCourt} onClick={() => freeCourt && handleLaunch(fixture, freeCourt.id)}>
              <Play size={14} /> Play
            </Button>
            {fixture.round === 1 && (
              <button
                onClick={() => setEditingKoFixture(fixture.id)}
                disabled={busy}
                title="Change the pairs in this match"
                className="min-w-[44px] rounded-xl border-2 border-orange-200 text-orange-600 text-[11px] font-display font-bold active:bg-orange-50"
              >
                Edit
              </button>
            )}
          </div>
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
          onClick={() => setShowRoster(true)}
          title="Club roster - levels, ranks, archive"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 text-xs font-display font-semibold hover:bg-gray-100 transition-all"
        >
          <Users size={14} /> Roster
        </button>
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
      <TournamentStats
        tournament={tournament}
        fixtures={fixtures}
        players={players}
        standingsByGroup={standingsByGroup}
        matches={matches}
        members={members}
        courts={courts}
      />

      <main
        ref={fitOuterRef}
        className={`flex-1 min-h-0 w-full flex ${isMobile ? "overflow-y-auto overflow-x-hidden" : fitZoom <= MIN_FIT_ZOOM ? "overflow-auto" : "overflow-hidden"}`}
      >
       <div
         ref={fitInnerRef}
         style={{ zoom: isMobile ? 1 : fitZoom }}
         className={`flex flex-col gap-4 shrink-0 ${isMobile ? "w-full px-3 py-3" : "w-max px-5 py-5 m-auto"}`}
       >
        {error && <p className="text-sm font-display font-semibold text-red-600">{error}</p>}

        {tournament.status !== "complete" && (() => {
          const stageLabel = tournament.status === "groups" ? "Court" : "KO Court";
          const pool = eligiblePool();
          const fixtureLabel = (f: TournamentFixture) => {
            const prefix = f.stage === "group"
              ? `Group ${(f.group_index ?? 0) + 1}`
              : knockoutRoundLabel(fixtures.filter((x) => x.stage === "knockout" && x.round === f.round).length);
            return `${prefix}: ${pairName(f.team_a, members)} vs ${pairName(f.team_b, members)}`;
          };
          return (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 flex-wrap px-1">
                <h2 className="text-[11px] font-display font-bold text-gray-500 uppercase tracking-widest">
                  Courts ({stageCourts.length} available) · {pool.length} match{pool.length === 1 ? "" : "es"} waiting
                </h2>
                <Button size="sm" variant="secondary" onClick={handleRandomAssignAll} disabled={busy || idleCourts.length === 0 || pool.length === 0}>
                  🎲 Randomly assign courts
                </Button>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stageCourts.length}, minmax(200px, 1fr))` }}>
                {[...stageCourts].sort((a, b) => a.id - b.id).map((court) => {
                  const live = fixtures.find((f) => f.status === "active" && f.match_id && matches.find((m) => m.id === f.match_id)?.court_id === court.id);
                  const liveMatch = live?.match_id ? matches.find((m) => m.id === live.match_id) : undefined;
                  const choice = courtChoice[court.id] ?? "";
                  if (!live) {
                    return (
                      <div key={court.id} className="rounded-2xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-sm text-gray-800">{stageLabel} {court.id}</span>
                          <span className="text-[10px] font-display font-bold uppercase tracking-wider rounded-full bg-gray-100 text-gray-500 px-2 py-0.5">Free</span>
                        </div>
                        {pool.length > 0 ? (
                          <>
                            <select
                              value={choice}
                              onChange={(e) => setCourtChoice((c) => ({ ...c, [court.id]: e.target.value }))}
                              className="w-full h-10 text-xs font-display font-semibold bg-white border-2 border-orange-200 focus:border-orange-400 focus:outline-none rounded-xl px-2"
                            >
                              <option value="">Choose a waiting match…</option>
                              {pool.map((f) => (
                                <option key={f.id} value={f.id}>{fixtureLabel(f)}</option>
                              ))}
                            </select>
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                className="flex-1 px-2"
                                onClick={() => { const f = pool.find((x) => x.id === choice); if (f) { setCourtChoice((c) => ({ ...c, [court.id]: "" })); sendToCourts([[f, court.id]]); } }}
                                disabled={busy || !choice}
                              >
                                Send to court
                              </Button>
                              <Button size="sm" variant="secondary" className="px-3" onClick={() => handleRandomAssignOne(court.id)} disabled={busy} title="Send a random waiting match to this court">
                                🎲
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-[11px] font-body text-gray-400">No matches ready — waiting on results elsewhere.</p>
                        )}
                      </div>
                    );
                  }
                  const target = targetPointsFor(live);
                  return (
                    <div key={court.id} className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-display font-bold text-sm text-gray-900">{stageLabel} {court.id}</span>
                        <span className="text-[10px] font-display font-bold uppercase tracking-wider rounded-full bg-orange-200 text-orange-900 px-2 py-0.5">
                          {live.stage === "group" ? `Group ${(live.group_index ?? 0) + 1}` : knockoutRoundLabel(fixtures.filter((x) => x.stage === "knockout" && x.round === live.round).length)}
                        </span>
                      </div>
                      <div className="text-center">
                        <div className="font-body font-semibold text-[15px] text-gray-900 truncate">{pairName(live.team_a, members)}</div>
                        <div className="text-[10px] font-display font-black text-orange-400 my-0.5">VS</div>
                        <div className="font-body font-semibold text-[15px] text-gray-900 truncate">{pairName(live.team_b, members)}</div>
                      </div>
                      <Button size="sm" fullWidth onClick={() => setScoringFixture(live)} disabled={busy}>
                        {liveMatch?.score_a != null ? `Edit result (${liveMatch.score_a}–${liveMatch.score_b})` : "Save result"}
                      </Button>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-body text-gray-500">First to {target}{live.stage === "group" ? " · sudden death" : ""}</span>
                        <button onClick={() => handleFreeCourt(live)} disabled={busy} className="text-[10px] font-display font-bold text-orange-600 hover:text-red-500">Free court</button>
                      </div>
                    </div>
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
          <div className={`flex gap-6 flex-1 min-h-0 ${isMobile ? "flex-col gap-4" : "items-stretch"}`}>
            {/* Knockout / complete: groups collapse to a compact scoreboard so the bracket gets the screen */}
            {tournament.status !== "groups" && !showFullGroups && (
              <div className={`grid grid-cols-2 gap-2 flex-shrink-0 ${isMobile ? "w-full" : "w-max self-center"}`} style={{ zoom: isMobile ? 1 : groupsScale }}>
                {Array.from({ length: tournament.num_groups }, (_, g) => {
                  const rows = standingsByGroup[g] ?? [];
                  return (
                    <section key={g} className="bg-white rounded-xl border border-gray-200 p-2 w-[200px]">
                      <h2 className="font-display font-semibold text-gray-700 text-[11px] uppercase tracking-wider mb-1">Group {g + 1}</h2>
                      <ol className="flex flex-col">
                        {rows.map((s, i) => (
                          <li
                            key={s.pair.join("-")}
                            className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-body
                              ${i < tournament.advance_per_group ? "bg-violet-50 text-violet-800 font-semibold" : "text-gray-600 font-normal"}`}
                          >
                            <span className="w-3 text-gray-400 tabular-nums text-[10px]">{i + 1}</span>
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
              className={`grid gap-6 ${isMobile ? "w-full gap-4" : tournament.status === "groups" ? "flex-1 min-w-0" : "flex-shrink-0 w-max"}`}
              style={
                isMobile
                  ? { gridTemplateColumns: "minmax(0, 1fr)" }
                  : tournament.status === "groups"
                    ? { gridTemplateColumns: `repeat(${Math.min(groupCols, tournament.num_groups)}, minmax(0, 1fr))`, gridAutoRows: "1fr" }
                    : { gridTemplateColumns: `repeat(${Math.min(groupCols, tournament.num_groups)}, max-content)`, zoom: groupsScale }
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
                    <section key={g} className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col w-full h-full min-w-0 overflow-hidden">
                      {(() => {
                        const accent = GROUP_ACCENTS[g % GROUP_ACCENTS.length];
                        const gf = fixtures.filter((f) => f.stage === "group" && f.group_index === g && f.team_a && f.team_b);
                        const gDone = gf.filter((f) => f.status === "complete").length;
                        const gLive = gf.filter((f) => f.status === "active").length;
                        const pct = gf.length ? (gDone / gf.length) * 100 : 0;
                        return (
                          <div className={`flex items-center gap-3 px-4 py-2.5 border-b ${accent.header}`}>
                            <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold text-sm text-white ${accent.badge}`}>
                              G{g + 1}
                            </span>
                            <div className="min-w-0">
                              <h2 className="font-display font-bold text-gray-900 text-base leading-tight">Group {g + 1}</h2>
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className="w-24 h-1.5 rounded-full bg-black/10 overflow-hidden">
                                  <motion.div animate={{ width: `${pct}%` }} className={`h-full rounded-full ${accent.bar}`} />
                                </div>
                                <span className="text-[11px] font-body text-gray-500 tabular-nums">
                                  {gDone}/{gf.length} played{gLive > 0 ? ` · ${gLive} live` : ""}
                                </span>
                              </div>
                            </div>
                            {leader && (
                              <span className="ml-auto flex items-center gap-2 bg-white/80 border border-white rounded-full pl-1 pr-3 py-0.5 shadow-sm">
                                <span className="flex -space-x-2">
                                  {leader.pair.map((pid) => (
                                    <Avatar key={pid} name={members[pid]?.name ?? "?"} url={members[pid]?.avatar_url} memberType={members[pid]?.member_type} size="xs" />
                                  ))}
                                </span>
                                <span className="text-[13px] font-body font-medium text-gray-700">{pairName(leader.pair, members)}</span>
                                <span className={`text-[10px] font-display font-bold uppercase tracking-wider ${accent.text}`}>
                                  {leader.wins + leader.losses > 0 ? "Leading" : "Top seed"}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex-1 flex flex-col min-h-0 overflow-x-auto px-2 pb-2">
                        <table className="border-collapse text-sm font-display w-full flex-1">
                          <thead>
                            <tr>
                              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-[10px] text-gray-400 font-semibold uppercase tracking-wider border-b-2 border-gray-100">
                                Pair
                              </th>
                              {rows.map((s) => (
                                <th key={s.pair.join("-")} className="px-1 py-2 font-body font-normal text-[12px] text-gray-500 border-b-2 border-gray-100 min-w-[104px] leading-tight">
                                  {pairName(s.pair, members).replace(" & ", "\n& ").split("\n").map((l, i) => (
                                    <span key={i} className="block">{l}</span>
                                  ))}
                                </th>
                              ))}
                              <th className="px-2 py-2 font-body font-normal text-[11px] uppercase tracking-wider text-gray-400 border-b-2 border-gray-100 min-w-[56px]">W–L</th>
                              <th className="px-2 py-2 font-body font-normal text-[11px] uppercase tracking-wider text-gray-400 border-b-2 border-gray-100 min-w-[56px]">Pts</th>
                              <th className="px-2 py-2 font-body font-normal text-[11px] uppercase tracking-wider text-gray-400 border-b-2 border-gray-100 min-w-[56px]">Avg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((rowS, ri) => {
                              const played = rowS.wins + rowS.losses;
                              const avg = played > 0 ? rowS.pointsFor / played : 0;
                              const isLeader = !!leader && pairEq(leader.pair, rowS.pair);
                              return (
                                <tr key={rowS.pair.join("-")} className={isLeader ? "bg-violet-50/70" : ri % 2 === 1 ? "bg-gray-50/60" : "bg-white"}>
                                  <th scope="row" className={`sticky left-0 z-10 bg-inherit pl-2 pr-3 py-1.5 text-left border-b border-gray-100 whitespace-nowrap ${isLeader ? "shadow-[inset_3px_0_0_0_#7c3aed]" : ""}`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`w-5 text-center text-[11px] font-display font-bold tabular-nums ${isLeader ? "text-violet-600" : "text-gray-300"}`}>
                                        {ranked.findIndex((s) => pairEq(s.pair, rowS.pair)) + 1}
                                      </span>
                                      <div className="flex -space-x-2 flex-shrink-0">
                                        {rowS.pair.map((pid) => (
                                          <Avatar key={pid} name={members[pid]?.name ?? "?"} url={members[pid]?.avatar_url} memberType={members[pid]?.member_type} size="xs" />
                                        ))}
                                      </div>
                                      <span className={`font-body text-[15px] tracking-tight ${isLeader ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>{pairName(rowS.pair, members)}</span>
                                    </div>
                                  </th>
                                  {rows.map((colS, ci) => {
                                    if (ri === ci) {
                                      return (
                                        <td key={ci} className="border-b border-gray-100 p-0 h-11">
                                          <div
                                            className="w-full h-full opacity-70"
                                            style={{ backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1.2px)", backgroundSize: "7px 7px" }}
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
                                            className={`w-full min-h-[44px] rounded-lg py-1.5 px-2 flex items-center justify-center gap-1.5 font-display font-bold text-sm tabular-nums border transition-colors
                                              ${won
                                                ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                                          >
                                            <span className={`text-[9px] font-black uppercase rounded px-1 py-0.5 ${won ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"}`}>{won ? "W" : "L"}</span>
                                            {own}<span className="text-gray-300 font-normal">–</span>{opp}
                                            <span className="text-[9px] font-body font-normal text-gray-400">C{match.court_id}</span>
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
                                      const pickingCourt = courtPickerFor === fixture.id;
                                      return (
                                        <td key={ci} className="group relative border-b border-gray-100 text-center p-1.5">
                                          {pickingCourt ? (
                                            <div className="rounded-lg border border-violet-200 bg-violet-50 px-1">
                                              <span className="block text-[9px] font-display font-bold uppercase tracking-wide text-violet-500 pt-1">Move to</span>
                                              <CourtChips current={match?.court_id} onPick={(cid) => handleMoveCourt(fixture, cid)} />
                                              <button onClick={() => setCourtPickerFor(null)} className="text-[10px] font-display font-semibold text-gray-400 pb-1">Cancel</button>
                                            </div>
                                          ) : (
                                            <div className="flex items-stretch gap-1">
                                              <button
                                                onClick={() => setScoringFixture(fixture)}
                                                title="Tap to enter score"
                                                className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg py-2 bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors"
                                              >
                                                <motion.span
                                                  animate={{ opacity: [1, 0.3, 1] }}
                                                  transition={{ repeat: Infinity, duration: 1.2 }}
                                                  className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"
                                                />
                                                <span className="text-[10px] font-display font-bold uppercase tracking-wide">Live</span>
                                              </button>
                                              <button
                                                onClick={() => setCourtPickerFor(fixture.id)}
                                                title="Change court"
                                                className="min-w-[34px] rounded-lg border border-amber-300 bg-white text-amber-800 font-display font-bold text-xs tabular-nums hover:bg-amber-50"
                                              >
                                                C{match?.court_id ?? "?"}
                                              </button>
                                            </div>
                                          )}
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
                                        ) : courtPickerFor === fixture.id ? (
                                          <div className="rounded-lg border border-violet-200 bg-violet-50 px-1">
                                            <span className="block text-[9px] font-display font-bold uppercase tracking-wide text-violet-500 pt-1">Send to</span>
                                            <CourtChips onPick={(cid) => { setCourtPickerFor(null); handleLaunch(fixture, cid); }} />
                                            <button onClick={() => setCourtPickerFor(null)} className="text-[10px] font-display font-semibold text-gray-400 pb-1">Cancel</button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => setCourtPickerFor(fixture.id)}
                                            disabled={busy}
                                            title={courtForGroup(g) ? `Usually court ${courtForGroup(g)!.id}` : undefined}
                                            className="w-full min-h-[44px] flex items-center justify-center gap-1 rounded-lg py-2 bg-violet-100 border border-violet-300 text-violet-800
                                                       active:bg-violet-200 active:scale-95 transition-all disabled:opacity-50"
                                          >
                                            <Play size={10} className="flex-shrink-0" />
                                            <span className="text-[10px] font-display font-semibold">Play</span>
                                            {idleCourts.length > 0 && (
                                              <span className="text-[9px] font-body text-violet-500">· {idleCourts.length} free</span>
                                            )}
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="border-b border-gray-100 text-center font-body tabular-nums text-[15px]">
                                    <span className={`font-semibold ${rowS.wins > 0 ? "text-emerald-700" : "text-gray-500"}`}>{rowS.wins}</span>
                                    <span className="text-gray-300">–</span>
                                    <span className={`font-semibold ${rowS.losses > 0 ? "text-gray-500" : "text-gray-500"}`}>{rowS.losses}</span>
                                  </td>
                                  <td className="border-b border-gray-100 text-center font-body font-semibold text-gray-700 tabular-nums text-[15px]">
                                    {rowS.pointsFor}
                                  </td>
                                  <td className="border-b border-gray-100 text-center font-body font-semibold text-violet-600 tabular-nums text-[15px]">
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
              <div className={`flex-shrink-0 flex gap-2 ${isMobile ? "w-full flex-row h-12" : "self-stretch w-14 flex-col"}`}>
                <button
                  onClick={() => nudgeGroupsScale(0.1)}
                  disabled={groupsScale >= 2}
                  aria-label="Make the groups panel bigger"
                  className="h-12 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 text-xl font-display font-bold active:bg-violet-50 disabled:opacity-30"
                >
                  +
                </button>
                <button
                  onClick={() => {
                    const next = !showFullGroups;
                    setShowFullGroups(next);
                    setTimeout(() => {
                      if (next) fitOuterRef.current?.scrollTo({ left: 0, behavior: "smooth" });
                      else knockoutRef.current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
                    }, 50);
                  }}
                  className="flex-1 rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col items-center justify-center gap-2 text-violet-600 active:bg-violet-50"
                  aria-label={showFullGroups ? "Back to compact groups" : "Show full group scores"}
                >
                  {showFullGroups ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
                  <span className={`text-[10px] font-display font-bold uppercase tracking-widest ${isMobile ? "" : "[writing-mode:vertical-rl] rotate-180"}`}>
                    {showFullGroups ? "Compact" : "Full groups"}
                  </span>
                </button>
                <button
                  onClick={() => nudgeGroupsScale(-0.1)}
                  disabled={groupsScale <= 0.5}
                  aria-label="Make the groups panel smaller"
                  className="h-12 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 text-xl font-display font-bold active:bg-violet-50 disabled:opacity-30"
                >
                  −
                </button>
              </div>
            )}

            {tournament.status === "groups" && (
              <button
                onClick={() => {
                  setCompactKnockout((v) => !v);
                  // Layout width changes underneath the scroll position; go back to the start.
                  setTimeout(() => fitOuterRef.current?.scrollTo({ left: 0, behavior: "smooth" }), 50);
                }}
                className={`flex-shrink-0 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center gap-2 text-violet-600 active:bg-violet-50 ${isMobile ? "w-full h-12 flex-row" : "self-stretch w-14 flex-col"}`}
                aria-label={compactKnockout ? "Show full knockout bracket" : "Compact the knockout bracket"}
              >
                {compactKnockout ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
                <span className={`text-[10px] font-display font-bold uppercase tracking-widest ${isMobile ? "" : "[writing-mode:vertical-rl] rotate-180"}`}>
                  {compactKnockout ? "Full knockout" : "Compact"}
                </span>
              </button>
            )}

            <div
              ref={knockoutRef}
              className={`flex flex-col justify-center gap-4 flex-shrink-0 self-stretch scroll-mx-5
                ${isMobile ? "w-full min-w-0" : tournament.status === "groups" ? "w-max" : "flex-1 min-w-[760px]"}`}
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
                    <Button size="lg" fullWidth disabled={busy} onClick={openKnockoutConfig}>
                      <Trophy size={18} /> Generate Knockout
                    </Button>
                  </section>
                );
              })()}

              {(tournament.status === "knockout" || tournament.status === "complete") && (
                <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display font-bold text-gray-900 text-lg leading-tight">Knockout</h2>
                      <p className="text-xs font-display text-gray-500 mt-0.5">Tap Play to send a match to the next free court, then tap it again to enter the score. Edit on a round-1 card swaps its pairs.</p>
                    </div>
                    {tournament.status === "knockout" && (
                      <Button size="sm" variant="ghost" onClick={() => setShowResetKnockout(true)} disabled={busy}>
                        <RotateCcw size={14} /> Reset knockout
                      </Button>
                    )}
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
          targetPoints={targetPointsFor(scoringFixture)}
          onClose={() => setScoringFixture(null)}
          onSaved={() => handleScoreSaved(scoringFixture)}
        />
      )}


      <AnimatePresence>
        {showRoster && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowRoster(false)}
            />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-display font-bold text-gray-900 text-lg">Club Roster</span>
                <button onClick={() => setShowRoster(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500" aria-label="Close roster">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col">
                <MemberManagement />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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

      {showResetKnockout && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-7 flex flex-col gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center"><RotateCcw size={26} className="text-red-600" /></div>
            <div>
              <h2 className="font-display font-bold text-xl text-gray-900">Reset the knockout?</h2>
              <p className="text-sm font-display text-gray-500 mt-1">
                Every knockout match — including any already played — is deleted and you go back to the group stage, where you can generate the bracket again. Group results are kept.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="ghost" size="lg" fullWidth onClick={() => setShowResetKnockout(false)}>Keep it</Button>
              <Button variant="danger" size="lg" fullWidth disabled={busy} onClick={handleResetKnockout}>Reset knockout</Button>
            </div>
          </motion.div>
        </div>
      )}

      {showKnockoutConfig && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-8 flex flex-col gap-6"
          >
            <div>
              <h2 className="font-display font-black text-2xl text-gray-900">Knockout</h2>
              <p className="text-sm text-gray-500 mt-1">Check who's through, then set the points for each round.</p>
            </div>

            {(() => {
              const allPairs: KnockoutQualifier[] = Object.entries(standingsByGroup).flatMap(([g, st]) =>
                st.map((s, i) => ({ groupIndex: Number(g), rankInGroup: i + 1, pair: s.pair }))
              );
              const inField = (q: KnockoutQualifier) => koField.some((k) => pairEq(k.pair, q.pair));
              const label = (q: KnockoutQualifier) => `G${q.groupIndex + 1} #${q.rankInGroup} · ${pairName(q.pair, members)}`;
              const key = (q: KnockoutQualifier) => q.pair.join("-");
              const slots = KNOCKOUT_PAIRS;
              return (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-display font-bold uppercase tracking-widest text-gray-500">Going through ({koField.length} of {KNOCKOUT_PAIRS} pairs)</span>
                    <span className="text-[11px] font-body text-gray-400">Top {tournament?.advance_per_group} per group, then best of the rest by avg points</span>
                  </div>
                  {koTie && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-display font-semibold text-amber-800">
                      Tied for the last place on average points and games won: {koTie.map((q) => pairName(q.pair, members)).join(" and ")}.
                      Pick one below, or play them off first to 7 and then pick the winner.
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-2">
                    {Array.from({ length: slots }, (_, i) => {
                      const q = koField[i];
                      const isTieSlot = !q && koTie && i === koField.length;
                      return (
                        <div key={i} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${isTieSlot ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                          <span className="w-5 text-[11px] font-display font-bold text-gray-400 tabular-nums">{i + 1}</span>
                          <select
                            value={q ? key(q) : ""}
                            onChange={(e) => {
                              const pick = allPairs.find((p) => key(p) === e.target.value);
                              setKoField((prev) => {
                                const next = [...prev];
                                if (!pick) { next.splice(i, 1); return next; }
                                next[i] = pick;
                                return next;
                              });
                              if (isTieSlot) setKoTie(null);
                            }}
                            className="flex-1 min-w-0 text-xs font-display font-bold bg-white border border-gray-200 rounded-lg px-1.5 py-1.5"
                          >
                            <option value="">{isTieSlot ? "— pick the tie-breaker —" : "— empty —"}</option>
                            {allPairs.map((p) => (
                              <option key={key(p)} value={key(p)} disabled={inField(p) && !(q && pairEq(q.pair, p.pair))}>
                                {label(p)}{koTie?.some((t) => pairEq(t.pair, p.pair)) ? " (tied)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="grid gap-4">
              {[
                { key: "qf", label: "Quarter-Final", icon: "🥉" },
                { key: "sf", label: "Semi-Final", icon: "🥈" },
                { key: "f", label: "Final", icon: "🥇" },
              ].map(({ key, label, icon }) => (
                <div key={key} className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{icon}</span>
                    <span className="font-display font-bold text-gray-800">{label}</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={21}
                    value={knockoutConfig[key as keyof typeof knockoutConfig]}
                    onChange={(e) => setKnockoutConfig((prev) => ({ ...prev, [key]: parseInt(e.target.value, 10) || 11 }))}
                    className="w-16 text-center font-display font-black text-lg border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setShowKnockoutConfig(false)}>
                Cancel
              </Button>
              <Button fullWidth disabled={busy || koField.length < KNOCKOUT_PAIRS || !!koTie} onClick={handleGenerateKnockout}>
                Start Knockout →
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
        gridTemplateRows: `repeat(${rowCount}, minmax(${rowHeight}px, auto))`,
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
  // Seed order within each round, so the tree and the "QF 1 / SF 2" tags agree.
  const roundFixturesByRound = rounds.map((round) =>
    fixtures.filter((f) => f.round === round).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
  );
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
        rowHeight={164}
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
