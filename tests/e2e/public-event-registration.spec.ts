import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";

/**
 * S10: a signed-out visitor registers for a public event. The page used to
 * show no events at all (it read settings through the visitor's anon client,
 * which can't see them), and submissions inserted directly through an
 * anon-writable policy that's now dropped. The page reads, and the action
 * writes, on the server through the church-scoped admin client.
 */

const CHURCH_ID = "11111111-0000-0000-0000-000000000001";

test.describe("public event registration (signed out)", () => {
  test("lists only public, open events and registers a visitor", async ({ page }) => {
    const email = `visitor-${Date.now()}@example.test`;
    await page.goto("/portal/events/register?church=grace-harbor");

    // Public events from the seed, but not the members-only ones.
    const pantry = page.locator(".mantine-Paper-root", { hasText: "Neighborhood Food Pantry" }).last();
    await expect(pantry).toBeVisible();
    await expect(page.getByText("Sunday Worship Gathering")).toBeVisible();
    await expect(page.getByText("Youth Worship Night")).toHaveCount(0);

    try {
      await pantry.getByRole("button", { name: "Register" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: /Full name/i }).fill("E2E Visitor");
      await dialog.getByRole("textbox", { name: /Email/i }).fill(email);
      await dialog.getByRole("button", { name: "Submit registration" }).click();

      await expect(dialog.getByText("Registration confirmed.")).toBeVisible();

      const { rows } = await queryTenantDb<{ status: string; church_id: string; profile_id: string | null }>(
        "select status, church_id, profile_id from public.event_registrations where registrant_email = $1",
        [email],
      );
      expect(rows).toEqual([{ status: "confirmed", church_id: CHURCH_ID, profile_id: null }]);
    } finally {
      await queryTenantDb("delete from public.event_registrations where registrant_email = $1", [email]);
    }
  });
});
