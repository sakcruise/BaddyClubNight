import { test, expect } from "@playwright/test";
import { apiAs, anonApi, resetMember, GROUP_ID, OWNER_ID, ADMIN_ID, MEMBER_ID } from "./helpers";

// Database rules for roles & access (migrations 026-028). No browser needed.
test.describe("roles: database rules", () => {
  test.beforeEach(resetMember);
  test.afterAll(resetMember);

  test("anonymous users cannot call the role functions", async () => {
    const anon = anonApi();
    for (const [fn, args] of [
      ["list_group_people", { p_group: GROUP_ID }],
      ["list_my_groups", {}],
      ["set_member_access", { p_group: GROUP_ID, p_user: MEMBER_ID, p_access: "admin", p_title: "", p_permissions: [] }],
      ["remove_group_person", { p_group: GROUP_ID, p_user: MEMBER_ID }],
    ] as const) {
      const { error } = await anon.rpc(fn, args as never);
      expect(error, fn).not.toBeNull();
    }
  });

  test("owner sees all three people, owner flagged", async () => {
    const owner = await apiAs("e2e_owner");
    const { data, error } = await owner.rpc("list_group_people", { p_group: GROUP_ID });
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data.find((p: { user_id: string }) => p.user_id === OWNER_ID).is_owner).toBe(true);
  });

  test("list_my_groups shows the group with the right role", async () => {
    const m = await apiAs("e2e_member");
    const { data } = await m.rpc("list_my_groups");
    const g = data.find((x: { group_id: string }) => x.group_id === GROUP_ID);
    expect(g).toMatchObject({ kind: "small", access: "member", is_owner: false });
    const a = await apiAs("e2e_admin");
    const { data: ad } = await a.rpc("list_my_groups");
    expect(ad.find((x: { group_id: string }) => x.group_id === GROUP_ID)).toMatchObject({ access: "admin", title: "Treasurer" });
  });

  test("a plain member cannot change anyone's access", async () => {
    const m = await apiAs("e2e_member");
    const { error } = await m.rpc("set_member_access", { p_group: GROUP_ID, p_user: ADMIN_ID, p_access: "member", p_title: "", p_permissions: [] });
    expect(error?.message).toMatch(/permission/i);
  });

  test("an admin without 'change access' cannot change a member", async () => {
    const a = await apiAs("e2e_admin");
    const { error } = await a.rpc("set_member_access", { p_group: GROUP_ID, p_user: MEMBER_ID, p_access: "admin", p_title: "", p_permissions: [] });
    expect(error?.message).toMatch(/permission/i);
  });

  test("nobody changes their own access, and the owner is untouchable", async () => {
    const o = await apiAs("e2e_owner");
    const self = await o.rpc("set_member_access", { p_group: GROUP_ID, p_user: OWNER_ID, p_access: "member", p_title: "", p_permissions: [] });
    expect(self.error?.message).toMatch(/owner/i);
  });

  test("owner can make a member an admin with features, and it is logged", async () => {
    const o = await apiAs("e2e_owner");
    const { error } = await o.rpc("set_member_access", { p_group: GROUP_ID, p_user: MEMBER_ID, p_access: "admin", p_title: "Chairman", p_permissions: ["manage_members", "manage_dues"] });
    expect(error).toBeNull();
    const { data } = await o.rpc("list_group_people", { p_group: GROUP_ID });
    const row = data.find((p: { user_id: string }) => p.user_id === MEMBER_ID);
    expect(row).toMatchObject({ access: "admin", title: "Chairman" });
    expect(row.permissions.sort()).toEqual(["manage_dues", "manage_members"]);
    const { data: log } = await o.from("group_activity").select("action").eq("group_id", GROUP_ID).eq("action", "access_changed").limit(1);
    expect(log?.length).toBe(1);
  });

  test("a plain member is not allowed to read the activity log", async () => {
    const m = await apiAs("e2e_member");
    const { data } = await m.from("group_activity").select("id").eq("group_id", GROUP_ID);
    expect(data ?? []).toHaveLength(0);
  });

  test("only the owner can grant 'change access'; an admin with it can manage members only", async () => {
    const o = await apiAs("e2e_owner");
    await o.rpc("set_member_access", { p_group: GROUP_ID, p_user: ADMIN_ID, p_access: "admin", p_title: "Treasurer", p_permissions: ["manage_dues", "manage_costs", "manage_access"] });
    const a = await apiAs("e2e_admin");
    // admin with manage_access can promote a member, but not grant manage_access
    const grant = await a.rpc("set_member_access", { p_group: GROUP_ID, p_user: MEMBER_ID, p_access: "admin", p_title: "", p_permissions: ["manage_access"] });
    expect(grant.error?.message).toMatch(/owner/i);
    const ok = await a.rpc("set_member_access", { p_group: GROUP_ID, p_user: MEMBER_ID, p_access: "admin", p_title: "Secretary", p_permissions: ["manage_members"] });
    expect(ok.error).toBeNull();
    // once the member is an admin, only the owner may touch them
    const touch = await a.rpc("set_member_access", { p_group: GROUP_ID, p_user: MEMBER_ID, p_access: "member", p_title: "", p_permissions: [] });
    expect(touch.error?.message).toMatch(/only the owner/i);
    const rm = await a.rpc("remove_group_person", { p_group: GROUP_ID, p_user: MEMBER_ID });
    expect(rm.error?.message).toMatch(/only the owner/i);
    // restore the admin's original features
    await o.rpc("set_member_access", { p_group: GROUP_ID, p_user: ADMIN_ID, p_access: "admin", p_title: "Treasurer", p_permissions: ["manage_dues", "manage_costs"] });
  });

  test("the owner cannot be removed", async () => {
    const o = await apiAs("e2e_owner");
    const { error } = await o.rpc("remove_group_person", { p_group: GROUP_ID, p_user: OWNER_ID });
    expect(error?.message).toMatch(/owner/i);
  });
});
