import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MASTER_USERNAME = process.env.MASTER_USERNAME ?? "";

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
  const username = user.user_metadata?.username ?? "";
  if (!MASTER_USERNAME || username !== MASTER_USERNAME) {
    res.status(403).json({ message: "Forbidden — master account only" });
    return null;
  }
  return user.id;
}

// ── List all accounts ─────────────────────────────────────────────────────────
adminRouter.get("/accounts", async (req, res) => {
  if (!await requireMaster(req, res)) return;

  // Join accounts table with auth.users for created_at
  const { data: rows, error } = await supabaseAdmin
    .from("accounts")
    .select("username, display_name, email, recovery_email, user_id, created_at")
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ message: error.message }); return; }

  // Enrich with account_type from user metadata
  const enriched = await Promise.all((rows ?? []).map(async (row) => {
    if (!row.user_id) return { ...row, account_type: "unknown" };
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    return {
      ...row,
      account_type: user?.user_metadata?.account_type ?? "unknown",
      auth_created_at: user?.created_at,
    };
  }));

  res.json(enriched);
});

// ── Delete an account ─────────────────────────────────────────────────────────
adminRouter.delete("/accounts/:userId", async (req, res) => {
  if (!await requireMaster(req, res)) return;

  const { userId } = req.params;

  // Delete auth user — cascades to accounts row if FK is set up
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) { res.status(500).json({ message: authErr.message }); return; }

  // Also delete accounts row directly in case cascade isn't wired
  await supabaseAdmin.from("accounts").delete().eq("user_id", userId);

  res.json({ ok: true });
});
