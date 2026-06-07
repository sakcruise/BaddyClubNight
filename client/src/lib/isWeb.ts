/**
 * Returns true when running on the public Vercel web app.
 * Returns false when running locally on the Pi (localhost).
 *
 * On the Pi, the client talks to the local Express server via /api/*.
 * On Vercel, there is no Express server — the client reads from Supabase directly.
 */
export function isWeb(): boolean {
  return window.location.hostname !== "localhost" &&
         window.location.hostname !== "127.0.0.1" &&
         !window.location.hostname.startsWith("192.168.");
}
