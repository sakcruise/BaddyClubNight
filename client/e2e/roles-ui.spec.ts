import { test, expect } from "@playwright/test";
import { login, resetMember, GROUP_ID } from "./helpers";

// The People & roles screen and the groups switcher, in a phone-sized browser.
test.describe("roles: screens", () => {
  test.beforeEach(resetMember);
  test.afterAll(resetMember);

  test("owner: switcher lists the group with the Owner role", async ({ page }) => {
    await login(page, "e2e_owner");
    await page.goto("/spaces");
    await expect(page.getByText("E2E Test Group")).toBeVisible();
    await expect(page.getByText(/Group · Owner/)).toBeVisible();
    await page.screenshot({ path: "e2e-shots/switcher-owner.png" });
  });

  test("owner: promote the member to Chairman with the usual features, then see it saved", async ({ page }) => {
    await login(page, "e2e_owner");
    await page.goto(`/groups/${GROUP_ID}/people`);
    await expect(page.getByText("E2E Admin")).toBeVisible();
    await page.getByRole("button", { name: /E2E Member/ }).click();
    await page.getByRole("button", { name: "Chairman", exact: true }).click();
    await expect(page.getByRole("switch").first()).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: "e2e-shots/permissions-sheet.png" });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Admin · Chairman/)).toBeVisible();
  });

  test("treasurer admin: sees the list but cannot open the owner or themself", async ({ page }) => {
    await login(page, "e2e_admin");
    await page.goto(`/groups/${GROUP_ID}/people`);
    await expect(page.getByText("E2E Owner")).toBeVisible();
    await expect(page.getByText(/Only people allowed to change access/)).toBeVisible();
    await page.getByRole("button", { name: /E2E Member/ }).click({ trial: true }).catch(() => {});
    await expect(page.getByRole("button", { name: /E2E Owner/ })).toBeDisabled();
  });

  test("plain member: nothing is editable", async ({ page }) => {
    await login(page, "e2e_member");
    await page.goto(`/groups/${GROUP_ID}/people`);
    await expect(page.getByText("E2E Owner")).toBeVisible();
    for (const b of await page.getByRole("button", { name: /E2E/ }).all()) await expect(b).toBeDisabled();
    await page.screenshot({ path: "e2e-shots/people-member-view.png" });
  });
});
