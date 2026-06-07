import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://minhnhrdvgvlqajjcbph.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pbmhuaHJkdmd2bHFhampjYnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTcyNjg0MywiZXhwIjoyMDk1MzAyODQzfQ.O7YgsoxEzY0nt4RCEtxiHDJwBUDGG_igrScG_7BF4Dk"
);

// Check columns exist on members table
const { data, error } = await supabase.from("members").select("id, club_id, member_type").limit(1);
if (error) {
  console.error("❌ members check failed:", error.message);
} else {
  console.log("✅ members table has club_id + member_type");
}

// Check sessions
const { data: s, error: se } = await supabase.from("sessions").select("id, club_id, synced_at").limit(1);
if (se) console.error("❌ sessions check failed:", se.message);
else    console.log("✅ sessions table has club_id + synced_at");

// Check matches
const { data: m, error: me } = await supabase.from("matches").select("id, club_id, score_a, ended_at").limit(1);
if (me) console.error("❌ matches check failed:", me.message);
else    console.log("✅ matches table has club_id + score_a + ended_at");

// Check auth users exist
const { data: users, error: ue } = await supabase.auth.admin.listUsers();
if (ue) console.error("❌ auth users check failed:", ue.message);
else    console.log(`✅ ${users.users.length} club(s) registered in Supabase Auth:`, users.users.map(u => u.email));
