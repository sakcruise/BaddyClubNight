import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import db from "../db/index.js";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "badminton-club-secret-change-me";
const TOKEN_TTL  = "30d";

function makeToken(clubId: string) {
  return jwt.sign({ sub: clubId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// ── Check if any clubs exist (for first-launch detection only) ────────────────
authRouter.get("/status", (_req, res) => {
  const count = (db.prepare("SELECT COUNT(*) as n FROM clubs").get() as { n: number }).n;
  res.json({ hasClubs: count > 0 });
});

// ── Register a new club ───────────────────────────────────────────────────────
authRouter.post("/register", (req, res) => {
  const { club_name, admin_name, email, password } = req.body as {
    club_name: string; admin_name: string; email: string; password: string;
  };

  if (!club_name || !admin_name || !email || !password) {
    res.status(400).json({ message: "All fields are required" });
    return;
  }

  const existing = db.prepare("SELECT id FROM clubs WHERE email = ?").get(email.toLowerCase().trim());
  if (existing) {
    res.status(409).json({ message: "An account with this email already exists" });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const id = uuid();
  db.prepare(
    "INSERT INTO clubs (id, club_name, admin_name, email, password_hash) VALUES (?, ?, ?, ?, ?)"
  ).run(id, club_name.trim(), admin_name.trim(), email.toLowerCase().trim(), hash);

  res.status(201).json({ token: makeToken(id), club_name, admin_name, email });
});

// ── Login ─────────────────────────────────────────────────────────────────────
authRouter.post("/login", (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const club = db.prepare("SELECT * FROM clubs WHERE email = ?").get(email.toLowerCase().trim()) as any;
  if (!club) {
    res.status(401).json({ message: "No account found with that email" });
    return;
  }

  if (!bcrypt.compareSync(password, club.password_hash)) {
    res.status(401).json({ message: "Incorrect password" });
    return;
  }

  res.json({ token: makeToken(club.id), club_name: club.club_name, admin_name: club.admin_name, email: club.email });
});

// ── Verify token ──────────────────────────────────────────────────────────────
authRouter.get("/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ message: "No token" }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { sub: string };
    const club = db.prepare("SELECT id, club_name, admin_name, email FROM clubs WHERE id = ?").get(payload.sub) as any;
    if (!club) { res.status(401).json({ message: "Club not found" }); return; }
    res.json({ club });
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
});
