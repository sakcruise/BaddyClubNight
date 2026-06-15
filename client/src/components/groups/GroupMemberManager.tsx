import { Trash2, Users } from "lucide-react";
import { useGroupStore, useMemberStore } from "../../store";
import { groupsApi } from "../../services/groups";
import type { MemberType } from "../../types";
import InviteMembers from "./InviteMembers";

const TYPE_DOT: Record<MemberType, string> = {
  male: "bg-blue-500",
  female: "bg-pink-500",
  guest: "bg-purple-500",
};

/**
 * Group roster shown in the session Settings/Members drawer. Members join by
 * signing in through the invite link (no manual add-by-name). The owner can
 * still remove someone here; removals also drop them from the live member store.
 */
export default function GroupMemberManager({ groupId }: { groupId: string }) {
  const group = useGroupStore((s) => s.groups.find((g) => g.id === groupId));
  const upsertGroup = useGroupStore((s) => s.upsertGroup);
  const setMembers = useMemberStore((s) => s.setMembers);

  // Re-pull the group from Supabase and mirror its roster into the live member store.
  async function refresh() {
    const g = await groupsApi.get(groupId);
    if (!g) return;
    upsertGroup(g);
    setMembers(g.members.map((m) => ({
      id: m.id, name: m.name, member_type: m.member_type, email: "", created_at: m.created_at,
    })));
  }

  async function handleRemove(memberId: string) {
    try {
      await groupsApi.removeMember(memberId);
      await refresh();
    } catch (e: any) {
      alert(`Couldn't remove member: ${e?.message ?? "unknown error"}`);
    }
  }

  const members = group?.members ?? [];
  const inviteLink = group
    ? `${window.location.origin}/groups/join/${group.invite_token}`
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-display font-black text-gray-900">Members</h2>
        <p className="text-sm text-gray-400 font-body mt-0.5">
          {members.length} {members.length === 1 ? "person" : "people"} in {group?.name ?? "this group"}
        </p>
      </div>

      {/* Invite (members join by signing in) */}
      {group && <InviteMembers inviteLink={inviteLink} groupName={group.name} variant="light" />}

      {/* Member list */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-300">
            <Users size={28} />
            <p className="text-gray-400 font-display font-bold text-sm">No members yet — invite some above</p>
          </div>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <span className={`w-8 h-8 rounded-full ${TYPE_DOT[m.member_type]} flex items-center justify-center text-white font-display font-black text-xs flex-shrink-0`}>
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 font-display font-bold text-gray-800 text-sm truncate">{m.name}</span>
              <span className="text-gray-300 text-xs font-display capitalize">{m.member_type}</span>
              <button
                onClick={() => handleRemove(m.id)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors ml-1"
                title="Remove member"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
