import type { Match, PlayerStats, Member } from "../types";

export function computeLeaderboard(
  matches: Match[],
  members: Record<string, Member>
): PlayerStats[] {
  const stats: Record<string, PlayerStats> = {};

  const ensure = (id: string) => {
    if (!stats[id]) {
      stats[id] = {
        member_id: id,
        member: members[id],
        wins: 0,
        losses: 0,
        points_for: 0,
        points_against: 0,
        matches_played: 0,
        win_rate: 0,
      };
    }
  };

  for (const match of matches) {
    if (match.result !== "complete") continue;

    const hasScore = match.score_a != null && match.score_b != null;
    const scoreA = match.score_a ?? 0;
    const scoreB = match.score_b ?? 0;
    const allPlayers = [...match.team_a, ...match.team_b];

    if (hasScore) {
      const [w, l] = scoreA >= scoreB
        ? [match.team_a, match.team_b]
        : [match.team_b, match.team_a];
      const [wScore, lScore] = scoreA >= scoreB ? [scoreA, scoreB] : [scoreB, scoreA];
      for (const id of w) {
        ensure(id);
        stats[id].wins++;
        stats[id].points_for += wScore;
        stats[id].points_against += lScore;
        stats[id].matches_played++;
      }
      for (const id of l) {
        ensure(id);
        stats[id].losses++;
        stats[id].points_for += lScore;
        stats[id].points_against += wScore;
        stats[id].matches_played++;
      }
    } else {
      // No score recorded — just count matches played
      for (const id of allPlayers) {
        ensure(id);
        stats[id].matches_played++;
      }
    }
  }

  return Object.values(stats)
    .filter((s) => s.member != null)          // skip deleted / not-yet-loaded members
    .map((s) => ({
      ...s,
      win_rate: s.matches_played > 0 ? s.wins / s.matches_played : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.win_rate - a.win_rate);
}

export function formatScore(scoreA?: number, scoreB?: number): string {
  if (scoreA == null || scoreB == null) return "— : —";
  return `${scoreA} : ${scoreB}`;
}
