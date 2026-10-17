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
