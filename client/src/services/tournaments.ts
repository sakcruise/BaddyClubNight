/**
 * Tournament API — talks to Supabase directly (online only, club-mode only).
 *
 * Backed by migration 016_tournaments.sql: `tournaments` + `tournament_players`
 * + `tournament_fixtures`, club-scoped RLS. A fixture is a scheduling row that
 * mirrors matches' team-column shape; it only becomes a real, playable `matches`
 * row (via the existing matchesApi.start) once launched to a court.
 */
import { supabase } from "../lib/supabase";
import { useMemberStore } from "../store";
import { matchesApi } from "./api";
import type { Match, Tournament, TournamentPlayer, TournamentFixture } from "../types";
import {
  snakeDraftGroups,
  pairStrongestWithWeakest,
  roundRobinFixtures,
  computeGroupStandings,
  buildKnockoutBracket,
  advanceKnockoutRound,
  rankParticipants,
  type GroupStanding,
} from "../utils/tournament";

async function getClubId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

function check<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw new Error(error.message ?? "Supabase error");
  if (data === null) throw new Error("No data returned");
  return data;
}

function rowToTournament(t: any): Tournament {
  return {
    id: t.id,
    session_id: t.session_id,
    name: t.name,
    num_groups: t.num_groups,
    advance_per_group: t.advance_per_group,
    status: t.status,
    created_at: t.created_at,
  };
}

function rowToPlayer(p: any): TournamentPlayer {
  return {
    id: p.id,
    tournament_id: p.tournament_id,
    member_id: p.member_id,
    group_index: p.group_index,
    pair_index: p.pair_index,
    seed: p.seed,
  };
}

function rowToFixture(f: any): TournamentFixture {
  return {
    id: f.id,
    tournament_id: f.tournament_id,
    stage: f.stage,
    group_index: f.group_index,
    round: f.round,
    seed: f.seed,
    team_a: f.team_a_1 && f.team_a_2 ? [f.team_a_1, f.team_a_2] : null,
    team_b: f.team_b_1 && f.team_b_2 ? [f.team_b_1, f.team_b_2] : null,
    match_id: f.match_id,
    status: f.status,
    created_at: f.created_at,
  };
}

export interface TournamentChampion {
  tournamentId: string;
  year: number;
  pair: [string, string];
  runnersUp: [string, string] | null;
  score: [number, number] | null;
}

export const tournamentsApi = {
  /** Every completed tournament's champions (winner of the final), newest first.
   * Derived from the saved fixtures/matches, so nothing extra has to be written. */
  champions: async (): Promise<TournamentChampion[]> => {
    const { data: ts, error } = await supabase
      .from("tournaments")
      .select("id, created_at")
      .eq("status", "complete")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!ts || ts.length === 0) return [];

    const { data: fs, error: fe } = await supabase
      .from("tournament_fixtures")
      .select("*")
      .in("tournament_id", ts.map((t: any) => t.id))
      .eq("stage", "knockout")
      .eq("status", "complete");
    if (fe) throw new Error(fe.message);
    const fixtures = (fs ?? []).map(rowToFixture);

    const finals = ts
      .map((t: any) => {
        const ko = fixtures.filter((f) => f.tournament_id === t.id && f.team_a);
        const maxRound = Math.max(...ko.map((f) => f.round), 0);
        const final = ko.find((f) => f.round === maxRound);
        return final ? { t, final } : null;
      })
      .filter((x): x is { t: any; final: TournamentFixture } => !!x);

    const matchIds = finals.map((x) => x.final.match_id).filter((m): m is string => !!m);
    const scores = new Map<string, [number, number]>();
    if (matchIds.length > 0) {
      const { data: ms, error: me } = await supabase.from("matches").select("id, score_a, score_b").in("id", matchIds);
      if (me) throw new Error(me.message);
      for (const m of ms ?? []) if (m.score_a != null && m.score_b != null) scores.set(m.id, [m.score_a, m.score_b]);
    }

    return finals.map(({ t, final }) => {
      const score = final.match_id ? scores.get(final.match_id) ?? null : null;
      const aWon = !final.team_b || !score || score[0] > score[1];
      return {
        tournamentId: t.id,
        year: new Date(t.created_at).getFullYear(),
        pair: (aWon ? final.team_a : final.team_b) as [string, string],
        runnersUp: final.team_b ? (aWon ? final.team_b : final.team_a) : null,
        score: score ? (aWon ? score : [score[1], score[0]]) : null,
      };
    });
  },

  /** Draft the roster into level-balanced, pairable groups (snake draft +
   * strongest-with-weakest pairing) WITHOUT persisting anything — a preview
   * the admin can review and hand-edit before create() commits it. */
  draft: (participantIds: string[], numGroups: number): { pairsByGroup: Array<[string, string]>[]; reserves: string[] } => {
    const members = useMemberStore.getState().members;
    const { groups, reserves } = snakeDraftGroups(participantIds, members, numGroups);
    const pairsByGroup = groups.map((groupMemberIds) => pairStrongestWithWeakest(groupMemberIds, members));
    return { pairsByGroup, reserves };
  },

  /** Persist a (possibly hand-edited) group stage: pairsByGroup[g] is the
   * final list of pairs for group g, in whatever order the admin settled on. */
  create: async (
    sessionId: string,
    pairsByGroup: Array<[string, string]>[],
    reserves: string[],
    advancePerGroup = 1
  ): Promise<Tournament> => {
    const clubId = await getClubId();
    const members = useMemberStore.getState().members;
    const numGroups = pairsByGroup.length;

    const allParticipantIds = [...pairsByGroup.flat(2), ...reserves];
    const seedOf = new Map(rankParticipants(allParticipantIds, members).map((id, i) => [id, i + 1]));

    const { data: tRow, error: tErr } = await supabase
      .from("tournaments")
      .insert({ club_id: clubId, session_id: sessionId, num_groups: numGroups, advance_per_group: advancePerGroup })
      .select()
      .single();
    const tournament = rowToTournament(check(tRow, tErr));

    const playerRows: any[] = [];
    const fixtureRows: any[] = [];

    pairsByGroup.forEach((pairs, groupIndex) => {
      pairs.forEach(([a, b], pairIndex) => {
        playerRows.push({ tournament_id: tournament.id, member_id: a, group_index: groupIndex, pair_index: pairIndex, seed: seedOf.get(a) });
        playerRows.push({ tournament_id: tournament.id, member_id: b, group_index: groupIndex, pair_index: pairIndex, seed: seedOf.get(b) });
      });
      for (const f of roundRobinFixtures(pairs)) {
        fixtureRows.push({
          tournament_id: tournament.id,
          stage: "group",
          group_index: groupIndex,
          round: f.round,
          team_a_1: f.teamA[0], team_a_2: f.teamA[1],
          team_b_1: f.teamB[0], team_b_2: f.teamB[1],
        });
      }
    });
    reserves.forEach((id) => {
      playerRows.push({ tournament_id: tournament.id, member_id: id, group_index: -1, pair_index: null, seed: seedOf.get(id) });
    });

    const { error: pErr } = await supabase.from("tournament_players").insert(playerRows);
    if (pErr) throw new Error(pErr.message);
    if (fixtureRows.length > 0) {
      const { error: fErr } = await supabase.from("tournament_fixtures").insert(fixtureRows);
      if (fErr) throw new Error(fErr.message);
    }

    const { error: sErr } = await supabase.from("sessions").update({ tournament_id: tournament.id }).eq("id", sessionId);
    if (sErr) throw new Error(sErr.message);

    return tournament;
  },

  get: async (tournamentId: string): Promise<{
    tournament: Tournament;
    players: TournamentPlayer[];
    fixtures: TournamentFixture[];
  }> => {
    const [tRes, pRes, fRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
      supabase.from("tournament_players").select("*").eq("tournament_id", tournamentId),
      supabase.from("tournament_fixtures").select("*").eq("tournament_id", tournamentId).order("round"),
    ]);
    return {
      tournament: rowToTournament(check(tRes.data, tRes.error)),
      players: check(pRes.data, pRes.error).map(rowToPlayer),
      fixtures: check(fRes.data, fRes.error).map(rowToFixture),
    };
  },

  /** Assign a pending fixture to a free court — creates the real match row
   * through the existing matches engine, then stamps the fixture as active. */
  launchFixture: async (fixture: TournamentFixture, sessionId: string, courtId: number): Promise<Match> => {
    if (!fixture.team_a || !fixture.team_b) {
      throw new Error("Cannot launch a bye fixture — it has already auto-advanced");
    }
    const { match } = await matchesApi.start(sessionId, { court_id: courtId, team_a: fixture.team_a, team_b: fixture.team_b });
    const { error } = await supabase
      .from("tournament_fixtures")
      .update({ match_id: match.id, status: "active" })
      .eq("id", fixture.id);
    if (error) throw new Error(error.message);
    return match;
  },

  /** Call once a fixture's underlying match is marked complete, so the
   * fixture (and therefore standings/knockout progression) reflects it. */
  completeFixture: async (fixtureId: string): Promise<void> => {
    const { error } = await supabase.from("tournament_fixtures").update({ status: "complete" }).eq("id", fixtureId);
    if (error) throw new Error(error.message);
  },

  /** Undo a launched or completed fixture — deletes its underlying match and
   * puts it back to pending so it can be re-sent to a court. Caller is
   * responsible for freeing the court locally (this only knows fixture rows). */
  resetFixture: async (fixture: TournamentFixture): Promise<void> => {
    if (fixture.match_id) {
      const { error: mErr } = await supabase.from("matches").delete().eq("id", fixture.match_id);
      if (mErr) throw new Error(mErr.message);
    }
    const { error } = await supabase
      .from("tournament_fixtures")
      .update({ match_id: null, status: "pending" })
      .eq("id", fixture.id);
    if (error) throw new Error(error.message);
  },

  /** Abandon a bad draft entirely — deletes the tournament, which cascades to
   * its players/fixtures and clears sessions.tournament_id (ON DELETE SET
   * NULL), so the admin lands back on the setup screen to redraft groups. */
  delete: async (tournamentId: string): Promise<void> => {
    const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);
    if (error) throw new Error(error.message);
  },

  /** Stop treating this session as a tournament — detaches it without
   * deleting the tournament's own data, so club night resumes the normal
   * check-in/courts flow. */
  unlinkSession: async (sessionId: string): Promise<void> => {
    const { error } = await supabase.from("sessions").update({ tournament_id: null }).eq("id", sessionId);
    if (error) throw new Error(error.message);
  },

  /** Standings for one group, computed from its fixtures' underlying matches. */
  groupStandings: async (tournamentId: string, groupIndex: number): Promise<GroupStanding[]> => {
    const { players, fixtures } = await tournamentsApi.get(tournamentId);
    const members = useMemberStore.getState().members;
    const groupFixtures = fixtures.filter((f) => f.stage === "group" && f.group_index === groupIndex);
    const matchIds = groupFixtures.map((f) => f.match_id).filter((id): id is string => !!id);

    let matches: Match[] = [];
    if (matchIds.length > 0) {
      const { data, error } = await supabase.from("matches").select("*").in("id", matchIds);
      if (error) throw new Error(error.message);
      matches = (data ?? []).map((m: any) => ({
        id: m.id, session_id: m.session_id, court_id: m.court_id,
        team_a: [m.team_a_1, m.team_a_2], team_b: [m.team_b_1, m.team_b_2],
        score_a: m.score_a ?? undefined, score_b: m.score_b ?? undefined,
        result: m.result, started_at: m.started_at, ended_at: m.ended_at ?? undefined,
      }));
    }

    const pairsInGroup = players.filter((p) => p.group_index === groupIndex && p.pair_index != null);
    const byPair = new Map<number, string[]>();
    pairsInGroup.forEach((p) => {
      const arr = byPair.get(p.pair_index!) ?? [];
      arr.push(p.member_id);
      byPair.set(p.pair_index!, arr);
    });
    const pairs = Array.from(byPair.values()).map((ids) => [ids[0], ids[1]] as [string, string]);

    return computeGroupStandings(matches, pairs, members);
  },

  /** Once every group fixture is complete, build the round-1 knockout bracket
   * from the top `advance_per_group` pair(s) of each group. */
  generateKnockout: async (tournamentId: string): Promise<TournamentFixture[]> => {
    const { tournament } = await tournamentsApi.get(tournamentId);
    const qualifiers: Array<{ groupIndex: number; rankInGroup: number; pair: [string, string] }> = [];

    for (let g = 0; g < tournament.num_groups; g++) {
      const standings = await tournamentsApi.groupStandings(tournamentId, g);
      standings.slice(0, tournament.advance_per_group).forEach((s, rank) => {
        qualifiers.push({ groupIndex: g, rankInGroup: rank + 1, pair: s.pair });
      });
    }

    const bracket = buildKnockoutBracket(qualifiers);
    const fixtureRows = bracket.map((f) => ({
      tournament_id: tournamentId,
      stage: "knockout",
      group_index: null,
      round: 1,
      seed: f.seed,
      team_a_1: f.teamA?.[0] ?? null, team_a_2: f.teamA?.[1] ?? null,
      team_b_1: f.teamB?.[0] ?? null, team_b_2: f.teamB?.[1] ?? null,
      // A bye has no opponent to play — it's already resolved.
      status: f.teamB === null ? "complete" : "pending",
    }));

    const { data, error } = await supabase.from("tournament_fixtures").insert(fixtureRows).select();
    if (error) throw new Error(error.message);
    await supabase.from("tournaments").update({ status: "knockout" }).eq("id", tournamentId);
    return check(data, error).map(rowToFixture);
  },

  /** Once every fixture in `round` is complete, pair winners into the next round. */
  advanceRound: async (tournamentId: string, round: number): Promise<TournamentFixture[]> => {
    const { fixtures } = await tournamentsApi.get(tournamentId);
    const roundFixtures = fixtures.filter((f) => f.stage === "knockout" && f.round === round);

    const matchIds = roundFixtures.map((f) => f.match_id).filter((id): id is string => !!id);
    const matchById = new Map<string, Match>();
    if (matchIds.length > 0) {
      const { data, error } = await supabase.from("matches").select("*").in("id", matchIds);
      if (error) throw new Error(error.message);
      (data ?? []).forEach((m: any) => matchById.set(m.id, {
        id: m.id, session_id: m.session_id, court_id: m.court_id,
        team_a: [m.team_a_1, m.team_a_2], team_b: [m.team_b_1, m.team_b_2],
        score_a: m.score_a ?? undefined, score_b: m.score_b ?? undefined,
        result: m.result, started_at: m.started_at, ended_at: m.ended_at ?? undefined,
      }));
    }

    const withWinners = roundFixtures.map((f) => {
      if (!f.team_b) return { seed: f.seed!, winner: f.team_a! }; // bye
      const m = f.match_id ? matchById.get(f.match_id) : undefined;
      if (!m || m.score_a == null || m.score_b == null) {
        throw new Error(`Fixture ${f.id} has no recorded result yet`);
      }
      return { seed: f.seed!, winner: (m.score_a >= m.score_b ? f.team_a : f.team_b)! };
    });

    if (withWinners.length === 1) {
      // Final's winner — mark the tournament complete, no further fixtures.
      await supabase.from("tournaments").update({ status: "complete" }).eq("id", tournamentId);
      return [];
    }

    const next = advanceKnockoutRound(withWinners);
    const fixtureRows = next.map((f) => ({
      tournament_id: tournamentId,
      stage: "knockout",
      group_index: null,
      round: round + 1,
      seed: f.seed,
      team_a_1: f.teamA?.[0] ?? null, team_a_2: f.teamA?.[1] ?? null,
      team_b_1: f.teamB?.[0] ?? null, team_b_2: f.teamB?.[1] ?? null,
      status: f.teamB === null ? "complete" : "pending",
    }));
    const { data, error } = await supabase.from("tournament_fixtures").insert(fixtureRows).select();
    if (error) throw new Error(error.message);
    return check(data, error).map(rowToFixture);
  },
};
