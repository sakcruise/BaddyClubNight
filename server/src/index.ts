import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { authRouter } from "./routes/auth.js";
import { membersRouter } from "./routes/members.js";
import { sessionsRouter } from "./routes/sessions.js";
import { matchesRouter } from "./routes/matches.js";
import { queueRouter } from "./routes/queue.js";
import { syncRouter } from "./routes/sync.js";
import { aiRouter } from "./routes/ai.js";
import { adminRouter } from "./routes/admin.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Ensure DB is initialised on startup
import "./db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In production: server/dist/index.js → public is at server/public
const PUBLIC_DIR = path.resolve(__dirname, "../../public");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/sessions", matchesRouter);   // /:sessionId/matches
app.use("/api/matches", matchesRouter);    // /:matchId/score
app.use("/api/sessions", queueRouter);
app.use("/api/sync", syncRouter);
app.use("/api/ai", aiRouter);
app.use("/api/admin", adminRouter);

app.use(errorHandler);

// ── Serve React build (production / Pi) ───────────────────────────────────────
// In dev, Vite runs on port 5173 and proxies /api → here.
// In production, Express serves the built React app from server/public.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(PUBLIC_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
}

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`🏸 Badminton Club server running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV === "production") {
    console.log(`   Open http://localhost:${PORT} in your browser`);
  }
});
