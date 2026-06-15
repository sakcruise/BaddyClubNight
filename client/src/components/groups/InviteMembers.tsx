import { useState } from "react";
import { Link2, Check, MessageSquare, Mail, Share2 } from "lucide-react";

/**
 * Invite section for a group. Members join by opening the invite link and
 * signing in — there's no manual "add by name". Owners share the link via the
 * phone's Messages app (SMS), Mail, the native share sheet, or by copying it.
 *
 * `variant="dark"` suits the purple GroupDetailView background; `"light"` suits
 * the white settings/members drawer.
 */
export default function InviteMembers({
  inviteLink,
  groupName,
  variant = "dark",
}: {
  inviteLink: string;
  groupName: string;
  variant?: "dark" | "light";
}) {
  const [copied, setCopied] = useState(false);

  const message = `Join "${groupName}" on Badminton Club Night 🏸\n${inviteLink}`;
  const smsHref = `sms:?&body=${encodeURIComponent(message)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(`Join ${groupName} on Badminton`)}&body=${encodeURIComponent(message)}`;
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  function copy() {
    navigator.clipboard?.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `Join ${groupName}`, text: message, url: inviteLink });
    } catch { /* user cancelled — ignore */ }
  }

  const dark = variant === "dark";
  const wrap = dark
    ? "bg-white/10 border-white/20"
    : "bg-white border-gray-100 shadow-sm";
  const heading = dark ? "text-white" : "text-gray-900";
  const sub = dark ? "text-white/50" : "text-gray-400";
  const linkBox = dark ? "text-white/60 bg-black/10 border-white/10" : "text-gray-500 bg-gray-50 border-gray-200";

  // Action button: solid white pill on dark, soft purple on light.
  const action = dark
    ? "bg-white text-purple-700 hover:bg-white/90"
    : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100";

  return (
    <div className={`rounded-2xl border ${wrap} p-4 flex flex-col gap-3`}>
      <div>
        <p className={`font-display font-black text-sm ${heading}`}>Invite members</p>
        <p className={`text-xs font-display mt-0.5 ${sub}`}>
          Share the link — they sign in and join. No accounts to set up for you.
        </p>
      </div>

      {/* The link itself */}
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${linkBox}`}>
        <Link2 size={14} className="flex-shrink-0 opacity-70" />
        <span className="flex-1 text-xs font-mono truncate">{inviteLink}</span>
        <button onClick={copy}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-display font-bold text-xs active:scale-95 transition-all flex-shrink-0 ${action}`}>
          {copied ? <><Check size={12} /> Copied</> : <>Copy</>}
        </button>
      </div>

      {/* Share channels */}
      <div className="grid grid-cols-3 gap-2">
        <a href={smsHref}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl font-display font-bold text-xs active:scale-95 transition-all ${action}`}>
          <MessageSquare size={16} /> Message
        </a>
        <a href={mailHref}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl font-display font-bold text-xs active:scale-95 transition-all ${action}`}>
          <Mail size={16} /> Email
        </a>
        {canShare ? (
          <button onClick={nativeShare}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl font-display font-bold text-xs active:scale-95 transition-all ${action}`}>
            <Share2 size={16} /> Share
          </button>
        ) : (
          <button onClick={copy}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl font-display font-bold text-xs active:scale-95 transition-all ${action}`}>
            <Link2 size={16} /> Copy
          </button>
        )}
      </div>
    </div>
  );
}
