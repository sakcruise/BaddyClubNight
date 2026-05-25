import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { membersRouter } from "./routes/members.js";
import { sessionsRouter } from "./routes/sessions.js";
import { matchesRouter } from "./routes/matches.js";
import { queueRouter } from "./routes/queue.js";
import { syncRouter } from "./routes/sync.js";
import { aiRouter } from "./routes/ai.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Ensure DB is initialised on startup
import "./db/index.js";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/sessions", matchesRouter);   // /:sessionId/matches
app.use("/api/matches", matchesRouter);    // /:matchId/score
app.use("/api/sessions", queueRouter);
app.use("/api/sync", syncRouter);
app.use("/api/ai", aiRouter);

app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`🏸 Badminton Club server running on http://localhost:${PORT}`);
});
