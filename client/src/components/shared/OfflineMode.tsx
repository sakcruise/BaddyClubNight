/**
 * OfflineMode — "Work Offline" button + offline status banner.
 *
 * ALWAYS VISIBLE when offline (navigator.onLine = false OR offline-mode flag):
 *   Amber banner "Offline — using cached data" so the user knows why API calls aren't firing.
 *
 * BEFORE CLUB NIGHT (online):
 *   Shows "Work Offline" button → syncs members + config to localStorage → sets offline flag.
 *   This pre-caches data so the night works even without any internet at the venue.
 *
 * AT CLUB (offline flag set):
 *   Shows amber banner "Offline mode — changes saved locally".
 *   Shows "Go Online" button to clear the flag when WiFi is back.
 *
 * AFTER CLUB (back online + offline-mode flag still set):
 *   Shows "Sync to Cloud" button → pushes local session + matches to Supabase.
 */
import { useState, useEffect } from "react";
import { WifiOff, Wifi, CloudUpload, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useMemberStore, useSessionStore, useMatchStore, useSyncStore, useSessionArchiveStore } from "../../store";

function isOfflineMode() {
  return localStorage.getItem("offline-mode") === "true";
}

export default function OfflineMode() {
  const [offline, setOffline]     = useState(isOfflineMode);
  const [syncing, setSyncing]     = useState(false);
  const [caching, setCaching]     = useState(false);
  const [msg, setMsg]             = useState("");
  const [isOnline, setIsOnline]   = useState(navigator.onLine);

  const { setMembers }  = useMemberStore();
  const { session }     = useSessionStore();
  const { matches }     = useMatchStore();
  const { setSyncStatus } = useSyncStore();
  const { archivedSessions, clearArchive } = useSessionArchiveStore();

  // Track browser online/offline events
  useEffect(() => {
    const up = () => {
      setIsOnline(true);
      // Don't auto-clear the offline-mode flag — user must click "Go Online" so we don't
      // accidentally try to sync partial data mid-session
    };
    const down = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // If navigator says we're offline but the flag isn't set yet, show a read-only banner
  const networkOfflineOnly = !isOnline && !offline;

  // ── "Work Offline" — cache data locally ───────────────────────────────────
  async function handleWorkOffline() {
    setCaching(true);
    setMsg("");
    try {
      // Pull members from Supabase into Zustand (already persisted to localStorage)
      const { data: members, error } = await supabase
        .from("members")
        .select("*")
        .neq("member_type", "guest");
      if (error) throw error;

      setMembers((members ?? []).map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email ?? "",
        avatar_url: m.avatar_url ?? undefined,
        member_type: m.member_type ?? "male",
        created_at: m.created_at,
      })));

      localStorage.setItem("offline-mode", "true");
      localStorage.setItem("offline-cached-at", new Date().toISOString());
      setOffline(true);
      setMsg("Ready for offline use 🏸");
    } catch (e: any) {
      setMsg("Cache failed: " + (e.message ?? "unknown error"));
    } finally {
      setCaching(false);
    }
  }

  // ── "Go Online" — clear offline flag ─────────────────────────────────────
  function handleGoOnline() {
    localStorage.removeItem("offline-mode");
    setOffline(false);
    setMsg("");
  }

  // ── "Sync to Cloud" — push ALL archived nights + current session to Supabase ─
  async function handleSync() {
    const hasArchived = archivedSessions.length > 0;
    const hasCurrent  = !!session;
    if (!hasArchived && !hasCurrent) { setMsg("Nothing to sync"); return; }

    setSyncing(true);
    setSyncStatus({ status: "syncing" });
    setMsg("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const clubId = user.id;

      // Build full list: archived completed nights + current active session (if any)
      const toSync: { session: typeof session; matches: typeof matches }[] = [
        ...archivedSessions,
        ...(hasCurrent ? [{ session: session!, matches }] : []),
      ];

      let totalMatches = 0;

      for (const entry of toSync) {
        if (!entry.session) continue;

        // Upsert session row
        await supabase.from("sessions").upsert([{
          id: entry.session.id,
          club_id: clubId,
          club_name: entry.session.club_name,
          date: entry.session.date,
          num_courts: entry.session.num_courts,
          status: entry.session.status,
          created_at: entry.session.created_at,
        }], { onConflict: "id" });

        // Upsert matches for this session
        if (entry.matches.length > 0) {
          await supabase.from("matches").upsert(
            entry.matches.map((m) => ({
              id: m.id,
              club_id: clubId,
              session_id: m.session_id,
              court_id: m.court_id,
              team_a_1: m.team_a[0],
              team_a_2: m.team_a[1],
              team_b_1: m.team_b[0],
              team_b_2: m.team_b[1],
              score_a: m.score_a ?? null,
              score_b: m.score_b ?? null,
              shuttles_used: m.shuttles_used ?? null,
              result: m.result,
              started_at: m.started_at,
              ended_at: m.ended_at ?? null,
            })),
            { onConflict: "id" }
          );
          totalMatches += entry.matches.length;
        }
      }

      // Clear the local archive — it's now in Supabase
      clearArchive();

      setSyncStatus({ status: "idle", last_synced_at: new Date().toISOString(), pending_changes: 0 });
      setMsg(
        `Synced ✓ — ${toSync.length} night${toSync.length !== 1 ? "s" : ""}, ${totalMatches} match${totalMatches !== 1 ? "es" : ""} uploaded`
      );
    } catch (e: any) {
      setSyncStatus({ status: "error", error: e.message });
      setMsg("Sync failed: " + (e.message ?? "unknown"));
    } finally {
      setSyncing(false);
    }
  }

  const cachedAt = localStorage.getItem("offline-cached-at");
  const cachedAtStr = cachedAt
    ? new Date(cachedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  // ── Auto-offline banner: WiFi dropped but user never clicked "Work Offline" ─
  if (networkOfflineOnly) {
    return (
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5">
        <WifiOff size={16} className="text-amber-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-amber-800 font-display font-black text-xs">No internet — using cached data</div>
          <div className="text-amber-600 text-[10px] font-display">All changes are saved locally and will sync when you reconnect</div>
        </div>
      </div>
    );
  }

  // ── Offline banner (shown when offline mode is active) ────────────────────
  if (offline) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5">
          <WifiOff size={16} className="text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-amber-800 font-display font-black text-xs">Offline Mode</div>
            {cachedAtStr && (
              <div className="text-amber-600 text-[10px] font-display">Cached {cachedAtStr}</div>
            )}
          </div>
          <div className="flex gap-1.5">
            {isOnline && (
              <button onClick={handleSync} disabled={syncing}
                className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-display font-black px-2.5 py-1.5 rounded-xl transition-all disabled:opacity-50">
                {syncing
                  ? <RefreshCw size={11} className="animate-spin" />
                  : <CloudUpload size={11} />}
                {syncing
                  ? "Syncing…"
                  : archivedSessions.length > 0
                    ? `Sync (${archivedSessions.length})`
                    : "Sync"}
              </button>
            )}
            <button onClick={handleGoOnline}
              className="flex items-center gap-1 bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-display font-black px-2.5 py-1.5 rounded-xl transition-all">
              <Wifi size={11} /> Go Online
            </button>
          </div>
        </div>
        {msg && (
          <div className={`text-xs font-display font-bold px-3 py-1.5 rounded-xl
            ${msg.includes("failed") || msg.includes("Error")
              ? "bg-red-50 text-red-600 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"}`}>
            {msg}
          </div>
        )}
      </div>
    );
  }

  // ── Online — show "Work Offline" button ───────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <WifiOff size={16} className="text-blue-600 flex-shrink-0" />
          <div>
            <p className="font-display font-black text-blue-900 text-sm">Work Offline</p>
            <p className="font-display text-blue-600 text-[10px]">Cache data before heading to the club without internet</p>
          </div>
        </div>
        <button onClick={handleWorkOffline} disabled={caching}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700
                     text-white px-4 py-2.5 rounded-xl text-sm font-display font-black
                     transition-all disabled:opacity-50 active:scale-95">
          {caching
            ? <RefreshCw size={14} className="animate-spin" />
            : <WifiOff size={14} />}
          {caching ? "Caching data…" : "Cache & Work Offline"}
        </button>
      </div>
      {msg && (
        <div className={`text-xs font-display font-bold px-3 py-1.5 rounded-xl
          ${msg.includes("failed") || msg.includes("Error")
            ? "bg-red-50 text-red-600 border border-red-200"
            : "bg-green-50 text-green-700 border border-green-200"}`}>
          {msg}
        </div>
      )}
    </div>
  );
}
