import { test, expect } from "@playwright/test";
import { login, apiAs, gotoSettled, MEMBER_ID } from "./helpers";

const CLUB = "e2e00000-0000-4000-8000-0000000000a1";

async function cleanup() {
  const owner = await apiAs("e2e_owner");
  await owner.rpc("revoke_group_invite", { p_group: CLUB });
  await owner.from("members").delete().eq("club_id", CLUB);
  const m = await apiAs("e2e_member");
  await m.rpc("remove_group_person", { p_group: CLUB, p_user: MEMBER_ID });
}

// Invite link screens: organiser creates a link, a person opens it and joins.
test.describe("invites: screens", () => {
  test.beforeEach(cleanup);
  test.afterAll(cleanup);

  test("organiser creates a link; a member opens it, picks their roster name and joins", async ({ browser }) => {
    const owner = await apiAs("e2e_owner");
    await owner.from("members").insert({ club_id: CLUB, name: "E2E Member", member_type: "male" });

    const ownerCtx = await browser.newContext();
    const op = await ownerCtx.newPage();
    await login(op, "e2e_owner");
    await gotoSettled(op, `/groups/${CLUB}/people`, "People & roles");
    // an earlier run may have left a live link: cancel it so the create button shows
    const cancel = op.getByRole("button", { name: "Cancel" });
    if (await cancel.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await cancel.click();
    }
    await op.getByRole("button", { name: "Create invite link" }).click();
    const url = await op.getByTestId("invite-url").innerText();
    expect(url).toMatch(/\/join\/[0-9a-f]{32}$/);
    await op.screenshot({ path: "e2e-shots/invite-created.png" });

    const memberCtx = await browser.newContext();
    const mp = await memberCtx.newPage();
    await login(mp, "e2e_member");
    await mp.goto(url.replace(/^https?:\/\/[^/]+/, ""));
    const retry = mp.getByRole("button", { name: "Try again" });
    if (await retry.isVisible({ timeout: 15_000 }).catch(() => false)) await retry.click();
    await expect(mp.getByText("Join E2E Test Club")).toBeVisible();
    await expect(mp.getByText("Is this you?")).toBeVisible();
    await mp.getByRole("button", { name: /E2E Member/ }).click();
    await mp.screenshot({ path: "e2e-shots/invite-join.png" });
    await mp.getByRole("button", { name: "Join", exact: true }).click();
    await expect(mp.getByText("You're in E2E Test Club")).toBeVisible();

    await op.reload();
    await expect(op.getByText("E2E Member")).toBeVisible();
    await ownerCtx.close(); await memberCtx.close();
  });

  test("a cancelled link shows 'no longer works'", async ({ browser }) => {
    const owner = await apiAs("e2e_owner");
    const { data: token } = await owner.rpc("create_group_invite", { p_group: CLUB, p_requires_approval: false });
    await owner.rpc("revoke_group_invite", { p_group: CLUB });
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`/join/${token}`);
    await expect(p.getByText("This link no longer works")).toBeVisible();
    await ctx.close();
  });
});
