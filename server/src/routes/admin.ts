import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MASTER_USERNAME = process.env.MASTER_USERNAME ?? "";
console.log("[admin] MASTER_USERNAME from env:", JSON.stringify(MASTER_USERNAME));

export const adminRouter = Router();

/** Verify the bearer token and confirm the caller is the master user. */
async function requireMaster(req: Request, res: Response): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorised" });
    return null;
  }
  const token = auth.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ message: "Invalid token" });
    return null;
  }

  // Try user_metadata first, then fall back to accounts table lookup
  let username = user.user_metadata?.username ?? "";
  if (!username) {
    const { data: row } = await supabaseAdmin
      .from("accounts")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();
    username = row?.username ?? "";
  }

  console.log("[admin] resolved username:", JSON.stringify(username), "| MASTER:", JSON.stringify(MASTER_USERNAME));

  if (!MASTER_USERNAME || username !== MASTER_USERNAME) {
    res.status(403).json({ message: "Forbidden — master account only" });
    return null;
  }
  return user.id;
}

// ── List all accounts ─────────────────────────────────────────────────────────
adminRouter.get("/accounts", async (req, res) => {
  try { if (!await requireMaster(req, res)) return; }
  catch (e) { console.error("[admin] requireMaster threw:", e); res.status(500).json({ message: "Auth check failed" }); return; }

  // Join accounts table with auth.users for created_at
  const { data: rows, error } = await supabaseAdmin
    .from("accounts")
    .select("username, display_name, email, recovery_email, user_id, account_type, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin] accounts query error:", error);
    res.status(500).json({ message: error.message }); return;
  }

  res.json(rows ?? []);
});

// ── Delete an account ─────────────────────────────────────────────────────────
adminRouter.delete("/accounts/:userId", async (req, res) => {
  try { if (!await requireMaster(req, res)) return; }
  catch (e) { res.status(500).json({ message: "Auth check failed" }); return; }

  const { userId } = req.params;
  console.log("[admin] delete request for userId:", JSON.stringify(userId));

  if (!userId || userId === "null" || userId === "undefined") {
    // No auth user — just delete the accounts row by username if possible
    res.status(400).json({ message: "No user_id — delete the row manually in Supabase" });
    return;
  }

  // Clean up all user data before deleting the auth user.
  // Delete in dependency order (leaves first, then parents).
  const cleanups: Array<{ table: string; col: string }> = [
    { table: "session_rsvps",  col: "user_id"        },
    { table: "group_members",  col: "member_user_id" },
    { table: "groups",         col: "owner_id"       },
    { table: "queue_entries",  col: "club_id"        },
    { table: "matches",        col: "club_id"        },
    { table: "sessions",       col: "club_id"        },
    { table: "members",        col: "club_id"        },
    { table: "accounts",       col: "user_id"        },
  ];
  for (const { table, col } of cleanups) {
    const { error: e } = await supabaseAdmin.from(table).delete().eq(col, userId);
    if (e) console.warn(`[admin] cleanup ${table}.${col}:`, e.message);
  }

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error("[admin] deleteUser error:", authErr.message, authErr);
    res.status(500).json({ message: authErr.message }); return;
  }

  res.json({ ok: true });
});
