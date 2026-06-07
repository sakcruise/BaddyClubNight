/**
 * Runs the SQL migration against Supabase using the management API.
 * Usage: node scripts/run-migration.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL         = "https://minhnhrdvgvlqajjcbph.supabase.co";
const SERVICE_ROLE_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pbmhuaHJkdmd2bHFhampjYnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTcyNjg0MywiZXhwIjoyMDk1MzAyODQzfQ.O7YgsoxEzY0nt4RCEtxiHDJwBUDGG_igrScG_7BF4Dk";
const PROJECT_REF          = "minhnhrdvgvlqajjcbph";

const sql = readFileSync(
  path.join(__dirname, "../supabase/migrations/002_add_club_auth.sql"),
  "utf-8"
);

// Use Supabase Management API to run SQL
const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Management API needs a personal access token — try service role as fallback
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  }
);

if (!res.ok) {
  const err = await res.text();
  console.error("❌ Management API failed:", res.status, err);
  console.log("\nTrying via PostgREST rpc instead...");

  // Fallback: split into individual statements and try each via rpc
  // This won't work for DDL but let's report clearly
  console.log("\n⚠️  Cannot run DDL via REST API directly.");
  console.log("Please run the migration manually in Supabase Dashboard → SQL Editor:");
  console.log("File: supabase/migrations/002_add_club_auth.sql");
  process.exit(1);
}

const data = await res.json();
console.log("✅ Migration ran successfully:", JSON.stringify(data, null, 2));
