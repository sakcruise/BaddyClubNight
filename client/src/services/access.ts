/**
 * Roles & access — people in a group, their access level (admin | member),
 * free-text title, and the features they may use. Backed by migrations
 * 026/027; all writes go through SECURITY DEFINER functions that enforce the
 * rules (owner-only for admins, no self-edit, everything logged).
 */
import { supabase } from "../lib/supabase";

export type Permission =
  | "manage_members" | "manage_dues" | "manage_sessions"
  | "send_messages" | "manage_costs" | "manage_access";

export const PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "manage_dues",     label: "See and change dues and payments" },
  { key: "manage_members",  label: "Manage members and invites" },
  { key: "manage_sessions", label: "Manage sessions, courts and tournaments" },
  { key: "send_messages",   label: "Send reminders and messages" },
  { key: "manage_costs",    label: "Manage costs (Splitwise)" },
  { key: "manage_access",   label: "Change titles and access" },
];

/** Picking a title pre-ticks the usual features; every tick can still be changed. */
export const TITLE_PRESETS: { title: string; permissions: Permission[] }[] = [
  { title: "Chairman",         permissions: ["manage_members", "manage_dues", "manage_sessions", "send_messages", "manage_costs"] },
  { title: "Treasurer",        permissions: ["manage_dues", "manage_costs", "send_messages"] },
  { title: "Match secretary",  permissions: ["manage_sessions", "send_messages"] },
  { title: "Membership officer", permissions: ["manage_members", "send_messages"] },
];

export interface GroupPerson {
  user_id: string;
  display_name: string;
  email: string | null;
  access: "admin" | "member";
  title: string | null;
  permissions: Permission[];
  status: string;
  is_owner: boolean;
  joined_at: string;
}

export interface MyGroup {
  group_id: string;
  name: string;
  kind: "small" | "club";
  access: "admin" | "member";
  title: string | null;
  is_owner: boolean;
  people: number;
}

export const accessApi = {
  async myGroups(): Promise<MyGroup[]> {
    const { data, error } = await supabase.rpc("list_my_groups");
    if (error) throw new Error(error.message);
    return (data ?? []) as MyGroup[];
  },
  async listPeople(groupId: string): Promise<GroupPerson[]> {
    const { data, error } = await supabase.rpc("list_group_people", { p_group: groupId });
    if (error) throw new Error(error.message);
    return (data ?? []) as GroupPerson[];
  },
  async setAccess(groupId: string, userId: string, access: "admin" | "member", title: string, permissions: Permission[]) {
    const { error } = await supabase.rpc("set_member_access", {
      p_group: groupId, p_user: userId, p_access: access, p_title: title, p_permissions: permissions,
    });
    if (error) throw new Error(error.message);
  },
  async remove(groupId: string, userId: string) {
    const { error } = await supabase.rpc("remove_group_person", { p_group: groupId, p_user: userId });
    if (error) throw new Error(error.message);
  },
};

// ── Invite links and join requests (migration 029) ───────────────────────────
export interface InviteInfo { token: string; requires_approval: boolean; expires_at: string; active: boolean }
export interface InvitePreview { group_id: string; name: string; kind: "small" | "club"; requires_approval: boolean; state: "ok" | "expired" | "revoked" }
export interface RosterMatch { member_id: string; name: string; reason: "phone" | "email" | "name" }
export interface JoinRequest { user_id: string; display_name: string; email: string | null; claim_member_id: string | null; claim_name: string | null; requested_at: string }

export const inviteApi = {
  async create(groupId: string, requiresApproval: boolean): Promise<string> {
    const { data, error } = await supabase.rpc("create_group_invite", { p_group: groupId, p_requires_approval: requiresApproval });
    if (error) throw new Error(error.message);
    return data as string;
  },
  async revoke(groupId: string) {
    const { error } = await supabase.rpc("revoke_group_invite", { p_group: groupId });
    if (error) throw new Error(error.message);
  },
  async current(groupId: string): Promise<InviteInfo | null> {
    const { data, error } = await supabase.rpc("list_group_invites", { p_group: groupId });
    if (error) throw new Error(error.message);
    return ((data ?? []) as InviteInfo[]).find((i) => i.active) ?? null;
  },
  async preview(token: string): Promise<InvitePreview | null> {
    const { data, error } = await supabase.rpc("preview_group_invite", { p_token: token });
    if (error) throw new Error(error.message);
    return ((data ?? [])[0] as InvitePreview) ?? null;
  },
  async rosterMatches(token: string): Promise<RosterMatch[]> {
    const { data, error } = await supabase.rpc("find_my_roster_matches", { p_token: token });
    if (error) throw new Error(error.message);
    return (data ?? []) as RosterMatch[];
  },
  async accept(token: string, rosterMemberId?: string | null): Promise<"joined" | "pending"> {
    const { data, error } = await supabase.rpc("accept_group_invite", { p_token: token, p_roster_member: rosterMemberId ?? null });
    if (error) throw new Error(error.message);
    return data as "joined" | "pending";
  },
  async requests(groupId: string): Promise<JoinRequest[]> {
    const { data, error } = await supabase.rpc("list_join_requests", { p_group: groupId });
    if (error) throw new Error(error.message);
    return (data ?? []) as JoinRequest[];
  },
  async review(groupId: string, userId: string, approve: boolean) {
    const { error } = await supabase.rpc("review_join_request", { p_group: groupId, p_user: userId, p_approve: approve });
    if (error) throw new Error(error.message);
  },
};

export const inviteUrl = (token: string) => `${window.location.origin}/join/${token}`;
