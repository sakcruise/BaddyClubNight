import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ShuttlecockIcon from "../components/shared/ShuttlecockIcon";

/**
 * Public, unauthenticated page — required by both app stores as a reachable
 * privacy policy URL, even for an app with no ads/tracking/analytics.
 */
export default function PrivacyPolicyView() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <ShuttlecockIcon size={24} />
        <span className="font-display font-black text-gray-900">Club Night</span>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8 prose-sm">
        <h1 className="font-display font-black text-2xl text-gray-900 mb-1">Privacy Policy</h1>
        <p className="text-gray-400 text-sm font-body mb-8">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="flex flex-col gap-6 text-gray-700 font-body text-sm leading-relaxed">
          <section>
            <h2 className="font-display font-bold text-base text-gray-900 mb-2">What this app is</h2>
            <p>Club Night is a tool for running badminton (and friends-group) game nights — managing check-ins, courts, queues, and match results. It does not show ads, sell data, or use third-party analytics or advertising trackers.</p>
          </section>

          <section>
            <h2 className="font-display font-bold text-base text-gray-900 mb-2">What information is stored</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li><strong>Account details</strong> — an email address and password (or sign-in via a magic link), used only to identify who owns which club or group.</li>
              <li><strong>Member names</strong> — first and last name of players in a club roster or friends group, entered by the organiser or by players themselves when checking in or joining via an invite link.</li>
              <li><strong>Session activity</strong> — check-in times, queue position, court assignments, match scores, and shuttle usage, all tied to a specific club night or group session.</li>
              <li><strong>No location, contacts, camera, or microphone access</strong> is requested or used by this app.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold text-base text-gray-900 mb-2">Where data is stored</h2>
            <p>Data is stored in a Supabase-hosted database (PostgreSQL) accessed over an encrypted connection. When "Work Offline" is used, session data is also cached locally on the device and synced back once you're online again.</p>
          </section>

          <section>
            <h2 className="font-display font-bold text-base text-gray-900 mb-2">Who can see it</h2>
            <p>Club data is visible only to the club's admin account. Friends-group data is visible to the group's owner and to members who've joined that specific group via its invite link — never to other groups or clubs using the app.</p>
          </section>

          <section>
            <h2 className="font-display font-bold text-base text-gray-900 mb-2">Data deletion</h2>
            <p>An organiser can remove a member from a roster or group at any time from within the app. To request full account or club deletion, contact the club or group's organiser, or reach out using the details below.</p>
          </section>

          <section>
            <h2 className="font-display font-bold text-base text-gray-900 mb-2">Contact</h2>
            <p>Questions about this policy or your data can be sent to the app's organiser/administrator directly.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
