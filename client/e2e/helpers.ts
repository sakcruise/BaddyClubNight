import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const GROUP_ID = "e2e00000-0000-4000-8000-0000000000a0";
export const OWNER_ID = "e2e00000-0000-4000-8000-000000000001";
export const ADMIN_ID = "e2e00000-0000-4000-8000-000000000002";
export const MEMBER_ID = "e2e00000-0000-4000-8000-000000000003";
export const PASSWORD = "E2e-Test-Pass-1!";

const URL = "https://minhnhrdvgvlqajjcbph.supabase.co";
const KEY = "sb_publishable_H8XJmKqpfPoFtoNFxnl7kA_oHOklkrW";

/** Sign in through the real login screen. */
export async function login(page: Page, username: string) {
  await page.goto("/");
  await page.getByPlaceholder("User ID").fill(username);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/ }).click();
  await expect(page.getByPlaceholder("User ID")).toBeHidden({ timeout: 20_000 });
}

/** A Supabase client signed in as a fixture user, for testing the database rules directly. */
export async function apiAs(username: string) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: `${username}@baddyapp.internal`, password: PASSWORD });
  if (error) throw new Error(`login ${username}: ${error.message}`);
  return c;
}

export function anonApi() {
  return createClient(URL, KEY, { auth: { persistSession: false } });
}

/** Put the member back to a plain Member so tests can be re-run. */
export async function resetMember() {
  const owner = await apiAs("e2e_owner");
  await owner.rpc("set_member_access", { p_group: GROUP_ID, p_user: MEMBER_ID, p_access: "member", p_title: "", p_permissions: [] });
}
