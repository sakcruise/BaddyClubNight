import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);

const clubId = (req: any) => req.clubId as string;

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

sessionsRouter.get("/current", (req, res) => {
  const session = db
    .prepare("SELECT * FROM sessions WHERE club_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .get(clubId(req));
  res.json({ session: session ?? null });
});

sessionsRouter.post("/", (req, res) => {
  const { club_name, num_courts } = req.body as { club_name: string; num_courts: number };
  if (!club_name || !num_courts) {
    res.status(400).json({ message: "club_name and num_courts are required" });
    return;
  }
  db.prepare("UPDATE sessions SET status = 'ended' WHERE club_id = ? AND status = 'active'").run(clubId(req));
  const id = uuid();
  const date = new Date().toISOString().split("T")[0];
  db.prepare(
    "INSERT INTO sessions (id, club_id, club_name, date, num_courts, status) VALUES (?, ?, ?, ?, ?, 'active')"
  ).run(id, clubId(req), club_name, date, num_courts);
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  res.status(201).json({ session });
});

sessionsRouter.post("/:id/end", (req, res) => {
  db.prepare("UPDATE sessions SET status = 'ended' WHERE id = ? AND club_id = ?").run(req.params.id, clubId(req));
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  res.json({ session });
});

sessionsRouter.get("/", (req, res) => {
  const sessions = db
    .prepare("SELECT * FROM sessions WHERE club_id = ? AND status = 'ended' ORDER BY created_at DESC")
    .all(clubId(req));
  res.json({ sessions });
});

sessionsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM matches WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM queue_entries WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE id = ? AND club_id = ?").run(id, clubId(req));
  res.json({ ok: true });
});

sessionsRouter.get("/:id/summary", (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ? AND club_id = ?").get(req.params.id, clubId(req));
  if (!session) { res.status(404).json({ message: "Not found" }); return; }
  const matchRows = db
    .prepare("SELECT * FROM matches WHERE session_id = ? ORDER BY started_at ASC")
    .all(req.params.id) as Record<string, unknown>[];
  const queue = db
    .prepare(`SELECT q.*, COALESCE(m.name, 'Unknown') as name, COALESCE(m.member_type, 'guest') as member_type
      FROM queue_entries q LEFT JOIN members m ON m.id = q.member_id
      WHERE q.session_id = ? ORDER BY q.position ASC`)
    .all(req.params.id);
  res.json({ session, matches: matchRows.map(rowToMatch), queue });
});
