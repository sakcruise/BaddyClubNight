import { useEffect, useState, useCallback } from "react";
import { Link2, Copy, Check, Ban } from "lucide-react";
import { inviteApi, inviteUrl } from "../../services/access";
import type { InviteInfo, JoinRequest } from "../../services/access";

/** Invite link (expires in 7 days, can be cancelled) and the people waiting for approval. */
export default function InvitePanel({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [approval, setApproval] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [i, r] = await Promise.all([inviteApi.current(groupId), inviteApi.requests(groupId)]);
      setInvite(i); setRequests(r);
      if (i) setApproval(i.requires_approval);
    } catch (e) { setError((e as Error).message); }
  }, [groupId]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); await load(); onChanged(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function copy() {
    if (!invite) return;
    const url = inviteUrl(invite.token);
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this link", url); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const days = invite ? Math.max(0, Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / 86_400_000)) : 0;

  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#eadfd6] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2"><Link2 size={16} className="text-orange-600" /><p className="text-[15px] font-semibold text-gray-900">Invite link</p></div>
        {invite ? (
          <>
            <p className="text-xs text-gray-500 break-all" data-testid="invite-url">{inviteUrl(invite.token)}</p>
            <p className="text-xs text-gray-500">Expires in {days} day{days === 1 ? "" : "s"} · joins as Member{invite.requires_approval ? " · admin approves" : ""}</p>
            <div className="flex gap-2">
              <button onClick={copy} className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy link"}
              </button>
              <button onClick={() => run(() => inviteApi.revoke(groupId))} disabled={busy} className="px-3 py-2.5 rounded-xl border border-[#eadfd6] text-sm font-semibold text-red-600 inline-flex items-center gap-1.5">
                <Ban size={14} /> Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500">One link for everyone, for example to post in WhatsApp. It lasts 7 days and you can cancel it any time.</p>
            <button onClick={() => setApproval((a) => !a)} className="w-full flex items-center gap-3 py-1 text-left">
              <span className="flex-1 text-sm font-medium text-gray-900">An admin approves each person</span>
              <span className={`w-[42px] h-6 rounded-full relative transition-colors ${approval ? "bg-orange-700" : "bg-gray-300"}`} role="switch" aria-checked={approval}>
                <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${approval ? "right-[3px]" : "left-[3px]"}`} />
              </span>
            </button>
            <button onClick={() => run(() => inviteApi.create(groupId, approval))} disabled={busy} className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-60">
              Create invite link
            </button>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {requests.length > 0 && (
        <div className="bg-white border border-[#eadfd6] rounded-2xl p-4 space-y-3">
          <p className="text-[15px] font-semibold text-gray-900">Waiting for approval ({requests.length})</p>
          {requests.map((r) => (
            <div key={r.user_id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{r.display_name}</p>
                <p className="text-xs text-gray-500 truncate">{r.claim_name ? `Says they are ${r.claim_name} on the roster` : "No roster person picked"}</p>
              </div>
              <button onClick={() => run(() => inviteApi.review(groupId, r.user_id, false))} disabled={busy} className="px-3 py-2 rounded-lg border border-[#eadfd6] text-xs font-semibold text-gray-600">Decline</button>
              <button onClick={() => run(() => inviteApi.review(groupId, r.user_id, true))} disabled={busy} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold">Approve</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
