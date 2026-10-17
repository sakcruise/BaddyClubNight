import { test, expect } from "@playwright/test";
import { apiAs, anonApi, OWNER_ID, MEMBER_ID, ADMIN_ID } from "./helpers";

const CLUB = "e2e00000-0000-4000-8000-0000000000a1";

// Club invite links and roster matching (migration 029). Database level, no browser.
test.describe("invites and roster claim", () => {
  async function cleanup() {
    const owner = await apiAs("e2e_owner");
    await owner.rpc("revoke_group_invite", { p_group: CLUB });
    await owner.from("members").delete().eq("club_id", CLUB);
    for (const u of ["e2e_member", "e2e_admin"]) {
      const c = await apiAs(u);
      await c.rpc("remove_group_person", { p_group: CLUB, p_user: u === "e2e_member" ? MEMBER_ID : ADMIN_ID });
    }
  }
  test.beforeEach(cleanup);
  test.afterAll(cleanup);

  test("only someone with 'manage members' can create or revoke a link", async () => {
    for (const u of ["e2e_member", "e2e_admin"]) {
      const c = await apiAs(u);
      const { error } = await c.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
      expect(error?.message, u).toMatch(/permission/i);
    }
    const owner = await apiAs("e2e_owner");
    const { data, error } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
    expect(error).toBeNull();
    expect(typeof data).toBe("string");
  });

  test("a signed-out visitor can preview a link; a revoked link is refused", async () => {
    const owner = await apiAs("e2e_owner");
    const { data: token } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
    const { data } = await anonApi().rpc("preview_group_invite", { p_token: token });
    expect(data[0]).toMatchObject({ name: "E2E Test Club", kind: "club", state: "ok", requires_approval: false });
    await owner.rpc("revoke_group_invite", { p_group: CLUB });
    const { data: after } = await anonApi().rpc("preview_group_invite", { p_token: token });
    expect(after[0].state).toBe("revoked");
    const m = await apiAs("e2e_member");
    const { error } = await m.rpc("accept_group_invite", { p_token: token });
    expect(error?.message).toMatch(/no longer valid/i);
  });

  test("creating a new link replaces the old one", async () => {
    const owner = await apiAs("e2e_owner");
    const { data: first } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
    await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
    const { data } = await anonApi().rpc("preview_group_invite", { p_token: first });
    expect(data[0].state).toBe("revoked");
  });

  test("accepting a link joins as a plain Member, and shows in the person's list", async () => {
    const owner = await apiAs("e2e_owner");
    const { data: token } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
    const m = await apiAs("e2e_member");
    const { data: res, error } = await m.rpc("accept_group_invite", { p_token: token });
    expect(error).toBeNull();
    expect(res).toBe("joined");
    const { data: mine } = await m.rpc("list_my_groups");
    expect(mine.find((g: { group_id: string }) => g.group_id === CLUB)).toMatchObject({ kind: "club", access: "member", is_owner: false });
    const { data: people } = await owner.rpc("list_group_people", { p_group: CLUB });
    expect(people.find((p: { user_id: string }) => p.user_id === MEMBER_ID)).toMatchObject({ access: "member" });
  });

  test("roster matching: by name, claimed once, and not claimable by someone who does not match", async () => {
    const owner = await apiAs("e2e_owner");
    const { data: row, error: insErr } = await owner.from("members")
      .insert({ club_id: CLUB, name: "E2E Member", member_type: "male" }).select("id").single();
    expect(insErr).toBeNull(); // also proves the manage-members policy lets the club owner write the roster
    const { data: token } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });

    const stranger = await apiAs("e2e_admin"); // display name "E2E Admin" does not match "E2E Member"
    const none = await stranger.rpc("find_my_roster_matches", { p_token: token });
    expect(none.data).toHaveLength(0);
    const bad = await stranger.rpc("accept_group_invite", { p_token: token, p_roster_member: row!.id });
    expect(bad.error?.message).toMatch(/does not match/i);

    const m = await apiAs("e2e_member");
    const found = await m.rpc("find_my_roster_matches", { p_token: token });
    expect(found.data).toHaveLength(1);
    expect(found.data[0]).toMatchObject({ member_id: row!.id, reason: "name" });
    const ok = await m.rpc("accept_group_invite", { p_token: token, p_roster_member: row!.id });
    expect(ok.error).toBeNull();
    const { data: linked } = await owner.from("members").select("user_id").eq("id", row!.id).single();
    expect(linked!.user_id).toBe(MEMBER_ID);
    const again = await m.rpc("find_my_roster_matches", { p_token: token });
    expect(again.data).toHaveLength(0); // already claimed
  });

  test("with approval on: request waits, admin approves and the roster person is linked", async () => {
    const owner = await apiAs("e2e_owner");
    const { data: row } = await owner.from("members").insert({ club_id: CLUB, name: "E2E Member", member_type: "male" }).select("id").single();
    const { data: token } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: true });
    const m = await apiAs("e2e_member");
    const { data: res } = await m.rpc("accept_group_invite", { p_token: token, p_roster_member: row!.id });
    expect(res).toBe("pending");
    const { data: mine } = await m.rpc("list_my_groups");
    expect(mine.find((g: { group_id: string }) => g.group_id === CLUB)).toBeUndefined();
    const { data: reqs } = await owner.rpc("list_join_requests", { p_group: CLUB });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ user_id: MEMBER_ID, claim_name: "E2E Member" });
    // a plain member cannot review
    const denied = await m.rpc("review_join_request", { p_group: CLUB, p_user: MEMBER_ID, p_approve: true });
    expect(denied.error?.message).toMatch(/permission/i);
    const { error } = await owner.rpc("review_join_request", { p_group: CLUB, p_user: MEMBER_ID, p_approve: true });
    expect(error).toBeNull();
    const { data: after } = await m.rpc("list_my_groups");
    expect(after.find((g: { group_id: string }) => g.group_id === CLUB)).toBeDefined();
    const { data: linked } = await owner.from("members").select("user_id").eq("id", row!.id).single();
    expect(linked!.user_id).toBe(MEMBER_ID);
  });

  test("with approval on: a declined request never gets in", async () => {
    const owner = await apiAs("e2e_owner");
    const { data: token } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: true });
    const m = await apiAs("e2e_member");
    await m.rpc("accept_group_invite", { p_token: token });
    await owner.rpc("review_join_request", { p_group: CLUB, p_user: MEMBER_ID, p_approve: false });
    const { data: mine } = await m.rpc("list_my_groups");
    expect(mine.find((g: { group_id: string }) => g.group_id === CLUB)).toBeUndefined();
  });

  test("the people list never shows the club owner as removable and logs invite events", async () => {
    const owner = await apiAs("e2e_owner");
    await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
    const { data: log } = await owner.from("group_activity").select("action").eq("group_id", CLUB).eq("action", "invite_created");
    expect(log!.length).toBeGreaterThan(0);
    const { error } = await owner.rpc("remove_group_person", { p_group: CLUB, p_user: OWNER_ID });
    expect(error?.message).toMatch(/owner/i);
  });
});
