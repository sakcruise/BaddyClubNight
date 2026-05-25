import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const matchesRouter = Router();
matchesRouter.use(requireAuth);

function rowToMatch(row: Record<string, unknown>) {
  return {
    id: row.id,
    session_id: row.session_id,
    court_id: row.court_id,
    team_a: [row.team_a_1, row.team_a_2] as [string, string],
    team_b: [row.team_b_1, row.team_b_2] as [string, string],
    score_a: row.score_a ?? undefined,
    score_b: row.score_b ?? undefined,
    result: row.result,
    started_at: row.started_at,
    ended_at: row.ended_at ?? undefined,
  };
}

// GET /api/sessions/:sessionId/matches
matchesRouter.get("/:sessionId/matches", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM matches WHERE session_id = ? ORDER BY started_at ASC")
    .all(req.params.sessionId) as Record<string, unknown>[];
  res.json({ matches: rows.map(rowToMatch) });
});

// POST /api/sessions/:sessionId/matches
matchesRouter.post("/:sessionId/matches", (req, res) => {
  const { court_id, team_a, team_b } = req.body as {
    court_id: number;
    team_a: [string, string];
    team_b: [string, string];
  };

  const id = uuid();
  db.prepare(`
    INSERT INTO matches (id, session_id, court_id, team_a_1, team_a_2, team_b_1, team_b_2)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.sessionId, court_id, team_a[0], team_a[1], team_b[0], team_b[1]);

  const row = db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as Record<string, unknown>;
  res.status(201).json({ match: rowToMatch(row) });
});

// POST /api/matches/:matchId/complete  (no score required)
matchesRouter.post("/:matchId/complete", (req, res) => {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE matches SET result = 'complete', ended_at = ? WHERE id = ?"
  ).run(now, req.params.matchId);
  const row = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.matchId) as Record<string, unknown>;
  res.json({ match: rowToMatch(row) });
});

// PATCH /api/matches/:matchId/score
matchesRouter.patch("/:matchId/score", (req, res) => {
  const { score_a, score_b } = req.body as { score_a: number; score_b: number };
  const now = new Date().toISOString();

  db.prepare(
    "UPDATE matches SET score_a = ?, score_b = ?, result = 'complete', ended_at = ? WHERE id = ?"
  ).run(score_a, score_b, now, req.params.matchId);

  const row = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.matchId) as Record<string, unknown>;
  res.json({ match: rowToMatch(row) });
});
