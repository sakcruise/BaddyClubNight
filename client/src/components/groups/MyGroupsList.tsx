import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users, ChevronRight } from "lucide-react";
import { accessApi } from "../../services/access";
import type { MyGroup } from "../../services/access";
import { supabase } from "../../lib/supabase";
import { useGroupStore } from "../../store";

/** Every group and club this login is in, with the person's role in each. */
export default function MyGroupsList({ onPick }: { onPick?: () => void }) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    accessApi.myGroups().then(setGroups).catch((e) => setError((e as Error).message));
  }, []);

  function open(g: MyGroup) {
    onPick?.();
    if (g.kind === "club") {
      // The club-night screens still run under the owner's own login.
      if (g.group_id === me) { useGroupStore.getState().setAppMode("club"); navigate("/"); }
      else navigate(`/groups/${g.group_id}/people`);
    } else {
      useGroupStore.getState().setAppMode("friends");
      navigate(`/groups/${g.group_id}`);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!groups) return <p className="text-sm text-gray-400">Loading…</p>;
  if (groups.length === 0) return <p className="text-sm text-gray-500">You are not in any group or club yet.</p>;

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <button key={g.group_id} onClick={() => open(g)}
          className="w-full bg-white border border-[#eadfd6] rounded-2xl px-4 py-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${g.kind === "club" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"}`}>
            {g.kind === "club" ? <Building2 size={18} /> : <Users size={18} />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-gray-900 truncate">{g.name}</span>
            <span className="block text-xs text-gray-500 truncate">
              {g.kind === "club" ? "Club" : "Group"} · {g.is_owner ? "Owner" : g.access === "admin" ? "Admin" : "Member"}
              {g.title ? ` · ${g.title}` : ""} · {g.people} {g.people === 1 ? "person" : "people"}
            </span>
          </span>
          <ChevronRight size={16} className="text-gray-300" />
        </button>
      ))}
    </div>
  );
}
