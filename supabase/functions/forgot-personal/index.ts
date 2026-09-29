// Password reset for personal/group accounts.
//
// These accounts sign in with a synthetic auth email (username@baddyapp.internal),
// so Supabase's own reset email can never reach them. Instead the caller proves
// they own the account with username + the real email on file, and we hand back
// a single-use recovery link for the browser they're already in.
//
// No JWT: the user is logged out. The username/email match is the check.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { message: "POST only" });

  let username = "", email = "";
  try {
    const body = await req.json();
    username = String(body.username ?? "").trim().toLowerCase();
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return json(400, { message: "Invalid request" });
  }
  if (!username || !email) return json(400, { message: "Username and email are required" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: row, error } = await admin
    .from("accounts")
    .select("username, email, recovery_email")
    .eq("username", username)
    .maybeSingle();
  if (error || !row) return json(404, { message: "No account found with that username" });

  const onFile = [row.email, row.recovery_email].filter(Boolean).map((e: string) => e.toLowerCase());
  if (!onFile.includes(email)) return json(401, { message: "Email doesn't match our records" });

  const origin = req.headers.get("origin") ?? undefined;
  const { data, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: `${row.username}@baddyapp.internal`,
    options: origin ? { redirectTo: origin } : undefined,
  });
  if (linkErr || !data?.properties?.action_link) {
    return json(500, { message: linkErr?.message ?? "Could not generate reset link" });
  }

  return json(200, { reset_link: data.properties.action_link });
});
