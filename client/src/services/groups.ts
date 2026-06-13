/**
 * Friends-Groups API — talks to Supabase directly (online only).
 *
 * Backed by migration 003_groups.sql: `groups` + `group_members`, owner-scoped
 * RLS, plus the SECURITY DEFINER functions `get_group_by_invite` / `join_group`
 * for the invite-link flow.
 *
 * Row ↔ type mapping:
 *   groups        → Group   (theme_key→themeKey, members[] joined in)
 *   group_members → GroupMember (display_name→name, joined_at→created_at)
 */
import { supabase } from "../lib/supabase";
import type { Group, GroupMember, MemberType } from "../types";

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

function check<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw new Error(error.message ?? "Supabase error");
  if (data === null) throw new Error("No data returned");
  return data;
}

function rowToMember(m: any): GroupMember {
  return {
    id: m.id,
    name: m.display_name,
    member_type: (m.member_type ?? "male") as MemberType,
    created_at: m.joined_at,
  };
}

function rowToGroup(g: any): Group {
  return {
    id: g.id,
    name: g.name,
    venue: g.venue ?? "",
    num_courts: g.num_courts ?? 1,
    themeKey: g.theme_key ?? "orange",
    invite_token: g.invite_token,
    members: (g.group_members ?? []).map(rowToMember),
    created_at: g.created_at,
  };
}

export const groupsApi = {
  /** All groups the signed-in person owns, members included. */
  list: async (): Promise<Group[]> => {
    const ownerId = await getUserId();
    const { data, error } = await supabase
      .from("groups")
      .select("*, group_members(*)")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    return check(data, error).map(rowToGroup);
  },

  get: async (id: string): Promise<Group | null> => {
    const { data, error } = await supabase
      .from("groups")
      .select("*, group_members(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToGroup(data) : null;
  },

  create: async (
    name: string,
    opts?: Partial<Pick<Group, "venue" | "num_courts" | "themeKey">>
  ): Promise<Group> => {
    const ownerId = await getUserId();
    const { data, error } = await supabase
      .from("groups")
      .insert({
        owner_id: ownerId,
        name: name.trim(),
        venue: opts?.venue ?? null,
        num_courts: opts?.num_courts ?? 1,
        theme_key: opts?.themeKey ?? "orange",
        invite_token: crypto.randomUUID().slice(0, 8),
      })
      .select("*, group_members(*)")
      .single();
    return rowToGroup(check(data, error));
  },

  update: async (
    id: string,
    patch: Partial<Pick<Group, "name" | "venue" | "num_courts" | "themeKey">>
  ): Promise<void> => {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.venue !== undefined) row.venue = patch.venue;
    if (patch.num_courts !== undefined) row.num_courts = patch.num_courts;
    if (patch.themeKey !== undefined) row.theme_key = patch.themeKey;
    const { error } = await supabase.from("groups").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ── Members ──────────────────────────────────────────────────────────────
  addMember: async (groupId: string, name: string, member_type: MemberType = "male"): Promise<GroupMember> => {
    const { data, error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, display_name: name.trim(), member_type })
      .select()
      .single();
    return rowToMember(check(data, error));
  },

  updateMember: async (memberId: string, patch: Partial<Pick<GroupMember, "name" | "member_type">>): Promise<void> => {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.display_name = patch.name;
    if (patch.member_type !== undefined) row.member_type = patch.member_type;
    const { error } = await supabase.from("group_members").update(row).eq("id", memberId);
    if (error) throw new Error(error.message);
  },

  removeMember: async (memberId: string): Promise<void> => {
    const { error } = await supabase.from("group_members").delete().eq("id", memberId);
    if (error) throw new Error(error.message);
  },

  // ── Invite / join by link ────────────────────────────────────────────────
  /** Preview a group from an invite token (works for anyone with the link). */
  getByInvite: async (token: string): Promise<{ id: string; name: string; member_count: number } | null> => {
    const { data, error } = await supabase.rpc("get_group_by_invite", { p_token: token });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { id: row.id, name: row.name, member_count: Number(row.member_count) } : null;
  },

  /** Join a group via its invite token. Returns the joined group id. */
  join: async (token: string, displayName: string, member_type: MemberType = "male"): Promise<string> => {
    const { data, error } = await supabase.rpc("join_group", {
      p_token: token,
      p_display_name: displayName.trim(),
      p_member_type: member_type,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
};
