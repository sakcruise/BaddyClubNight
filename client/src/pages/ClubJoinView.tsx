import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, LogIn, UserPlus, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { inviteApi } from "../services/access";
import type { InvitePreview, RosterMatch } from "../services/access";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

/** Public page for a club/group invite link: sign in, say who you are on the roster, join. */
export default function ClubJoinView() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [matches, setMatches] = useState<RosterMatch[]>([]);
  const [claim, setClaim] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"joined" | "pending" | null>(null);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    inviteApi.preview(token).then(setPreview).catch((e) => { setError(e.message); setPreview(undefined); setLoadFailed(true); });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
      if (!session) sessionStorage.setItem("pending_club_invite", token);
    });
  }, [token, attempt]);

  useEffect(() => {
    if (authed && token && preview?.state === "ok") {
      inviteApi.rosterMatches(token).then(setMatches).catch(() => setMatches([]));
    }
  }, [authed, token, preview]);

  async function join() {
    if (!token) return;
    setBusy(true); setError("");
    try { setResult(await inviteApi.accept(token, claim)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const bg = "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-500)) 100%)";
  const card = "w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-4 text-center";
  const primary = "w-full py-3 rounded-2xl font-display font-black text-white text-sm bg-gradient-to-r from-orange-600 to-orange-500 active:scale-95 transition-all disabled:opacity-60";

  let body: React.ReactNode;
  if (loadFailed) {
    body = (
      <>
        <p className="font-display font-black text-gray-900 text-xl">Couldn't load this invite</p>
        <p className="text-gray-500 text-sm">{error || "Check your connection and try again."}</p>
        <button onClick={() => { setLoadFailed(false); setError(""); setAttempt((a) => a + 1); }} className={primary}>Try again</button>
      </>
    );
  } else if (preview === undefined || authed === null) {
    body = <div className="w-9 h-9 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />;
  } else if (!preview || preview.state !== "ok") {
    body = (
      <>
        <p className="font-display font-black text-gray-900 text-xl">This link no longer works</p>
        <p className="text-gray-500 text-sm">{preview ? (preview.state === "expired" ? "It has expired." : "It was cancelled.") : "It was not found."} Ask the organiser for a new one.</p>
      </>
    );
  } else if (result) {
    body = (
      <>
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center"><Check className="text-green-600" /></div>
        <p className="font-display font-black text-gray-900 text-xl">{result === "joined" ? `You're in ${preview.name}` : "Request sent"}</p>
        <p className="text-gray-500 text-sm">{result === "joined" ? "It now shows in your list of groups and clubs." : "An admin needs to approve you. You'll see it in your list once they do."}</p>
        <button onClick={() => navigate("/spaces", { replace: true })} className={primary}>Go to my groups</button>
      </>
    );
  } else if (!authed) {
    body = (
      <>
        <Building2 className="text-orange-600" />
        <p className="font-display font-black text-gray-900 text-xl">Join {preview.name}</p>
        <p className="text-gray-500 text-sm">Sign in or create an account to join. You'll come straight back here.</p>
        <button onClick={() => { sessionStorage.setItem("pending_auth_mode", "signup_group"); window.location.href = "/"; }} className={primary}>
          <span className="inline-flex items-center gap-2"><UserPlus size={15} /> Create account</span>
        </button>
        <button onClick={() => { window.location.href = "/"; }} className="w-full py-3 rounded-2xl font-display font-black text-sm border-2 border-gray-200 text-gray-700">
          <span className="inline-flex items-center gap-2"><LogIn size={15} /> Sign in</span>
        </button>
      </>
    );
  } else {
    body = (
      <>
        <Building2 className="text-orange-600" />
        <p className="font-display font-black text-gray-900 text-xl">Join {preview.name}</p>
        {matches.length > 0 && (
          <div className="w-full text-left space-y-2">
            <p className="text-sm font-semibold text-gray-700">Is this you?</p>
            {matches.map((m) => (
              <button key={m.member_id} onClick={() => setClaim(claim === m.member_id ? null : m.member_id)}
                className={`w-full rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold ${claim === m.member_id ? "border-orange-500 bg-orange-50" : "border-gray-200"}`}>
                {m.name} <span className="font-normal text-gray-400">· matched by {m.reason}</span>
              </button>
            ))}
            <button onClick={() => setClaim(null)} className={`w-full rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold ${claim === null ? "border-orange-500 bg-orange-50" : "border-gray-200"}`}>
              None of these
            </button>
          </div>
        )}
        {preview.requires_approval && <p className="text-xs text-gray-500">An admin will approve your request.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={join} disabled={busy} className={primary}>{busy ? "Joining…" : preview.requires_approval ? "Ask to join" : "Join"}</button>
      </>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-6" style={{ background: bg }}>
      <div className="bg-white/15 rounded-3xl p-4 border border-white/20"><ShuttlecockIcon size={48} /></div>
      <div className={card}>{body}</div>
    </div>
  );
}
