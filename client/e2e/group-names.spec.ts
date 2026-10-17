import { test, expect } from "@playwright/test";
import { apiAs, GROUP_ID, MEMBER_ID } from "./helpers";

const PLACEHOLDER = "e2e00000-0000-4000-8000-0000000000b4";
const MEMBER_ROW = "e2e00000-0000-4000-8000-0000000000b3";

// Friends groups: only a person can rename themself. The organiser can rename placeholders only.
test.describe("friends group: who can change a name", () => {
  test.afterAll(async () => {
    const owner = await apiAs("e2e_owner");
    await owner.from("group_members").update({ display_name: "E2E Placeholder" }).eq("id", PLACEHOLDER);
    await owner.from("group_members").update({ display_name: "E2E Member" }).eq("id", MEMBER_ROW);
  });

  test("organiser cannot rename a person who has a login", async () => {
    const owner = await apiAs("e2e_owner");
    const { data, error } = await owner.from("group_members").update({ display_name: "Hacked" }).eq("id", MEMBER_ROW).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // silently skipped by the rules
    const { data: row } = await owner.from("group_members").select("display_name").eq("id", MEMBER_ROW).single();
    expect(row!.display_name).toBe("E2E Member");
  });

  test("organiser can rename a placeholder", async () => {
    const owner = await apiAs("e2e_owner");
    const { data, error } = await owner.from("group_members").update({ display_name: "E2E Renamed" }).eq("id", PLACEHOLDER).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("a placeholder cannot be turned into a login-linked person by the organiser", async () => {
    const owner = await apiAs("e2e_owner");
    const { data } = await owner.from("group_members").update({ member_user_id: MEMBER_ID }).eq("id", PLACEHOLDER).select("id");
    expect(data ?? []).toHaveLength(0);
  });

  test("the person renames themself through update_my_name", async () => {
    const m = await apiAs("e2e_member");
    const { error } = await m.rpc("update_my_name", { p_name: "E2E Member" });
    expect(error).toBeNull();
    const { data: row } = await m.from("group_members").select("display_name").eq("id", MEMBER_ROW).single();
    expect(row!.display_name).toBe("E2E Member");
  });

  test("a plain member cannot rename someone else in the group", async () => {
    const m = await apiAs("e2e_member");
    const { data } = await m.from("group_members").update({ display_name: "Nope" }).eq("id", PLACEHOLDER).select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
