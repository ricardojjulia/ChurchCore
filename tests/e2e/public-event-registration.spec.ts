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

  // G3.0c: a paid event. CI and local e2e run in demo mode, so the payment
  // step is the demo payment (the live card form is Stripe's own iframe,
  // covered by unit tests and owner action O7's real test-mode run).
  test.describe("a paid public event (G3.0c)", () => {
    const title = `E2E Paid Retreat ${Date.now()}`;
    let eventId = "";

    test.beforeAll(async () => {
      const { rows } = await queryTenantDb<{ id: string }>(
        `insert into public.events (church_id, title, location, starts_at, ends_at, category, visibility, rsvp_enabled, approval_status)
         values ($1, $2, 'Hall', timezone('utc', now()) + interval '20 days', timezone('utc', now()) + interval '20 days 2 hours',
                 'outreach', 'public', true, 'approved')
         returning id`,
        [CHURCH_ID, title],
      );
      eventId = rows[0].id;
      await queryTenantDb(
        `insert into public.event_registration_settings (event_id, church_id, registration_open, capacity, price_cents, currency)
         values ($1, $2, true, 10, 1500, 'usd')`,
        [eventId, CHURCH_ID],
      );
    });

    test.afterAll(async () => {
      // Cascades to its settings, registrations and payment rows.
      if (eventId) await queryTenantDb("delete from public.events where id = $1", [eventId]);
    });

    async function registerAndReachPayment(page: import("@playwright/test").Page, email: string) {
      await page.goto("/portal/events/register?church=grace-harbor");
      const card = page.locator(".mantine-Paper-root", { hasText: title }).last();
      await card.getByRole("button", { name: "Register" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/Payment required: \$15\.00/)).toBeVisible();
      await dialog.getByRole("textbox", { name: /Full name/i }).fill("E2E Payer");
      await dialog.getByRole("textbox", { name: /Email/i }).fill(email);
      await dialog.getByRole("button", { name: "Submit registration" }).click();
      await expect(dialog.getByText("Pay $15.00 to complete your registration")).toBeVisible();
      // The registration form is replaced by the payment step.
      await expect(dialog.getByRole("button", { name: "Submit registration" })).toHaveCount(0);
      return dialog;
    }

    test("registers, pays, and the registration is recorded as paid", async ({ page }) => {
      const email = `payer-${Date.now()}@example.test`;
      const dialog = await registerAndReachPayment(page, email);
      await dialog.getByRole("button", { name: /Complete Demo Payment/ }).click();
      await expect(dialog.getByText("Payment received. Your registration is complete.")).toBeVisible();

      const { rows } = await queryTenantDb<{ payment_status: string }>(
        "select payment_status from public.event_registrations where registrant_email = $1 and event_id = $2",
        [email, eventId],
      );
      expect(rows).toEqual([{ payment_status: "paid" }]);
    });

    test("closing without paying cancels the unpaid registration, freeing its place", async ({ page }) => {
      const email = `leaver-${Date.now()}@example.test`;
      const dialog = await registerAndReachPayment(page, email);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await expect
        .poll(async () => {
          const { rows } = await queryTenantDb<{ status: string }>(
            "select status from public.event_registrations where registrant_email = $1 and event_id = $2",
            [email, eventId],
          );
          return rows.map((row) => row.status);
        })
        .toEqual(["cancelled"]);
    });
  });
});
