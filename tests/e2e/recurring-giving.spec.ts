import { expect, test } from "@playwright/test";

import { queryTenantDb, signStripeWebhook } from "./fixtures/api";
import { getDemoCredentials, getWebhookSecret } from "./fixtures/env";
import { authFilePath, SEED_CHURCH_ID } from "./fixtures/roles";

/**
 * G3.1 + G3.2 journeys. CI and local e2e run in demo mode, where payments are
 * stubbed: no card step, and gifts are recorded at once. The live card and
 * subscription flow is Stripe's own (unit-tested against the exact requests,
 * and owner action O7's real test-mode run).
 */

// These tests share the seed member's recurring gifts and clean up by
// profile: run them one at a time, never alongside each other (PR #177
// review; the suite is fullyParallel).
test.describe.configure({ mode: "serial" });

async function memberProfileId(): Promise<string> {
  const { memberEmail } = getDemoCredentials();
  const { rows } = await queryTenantDb<{ id: string }>(
    "select p.id from public.profiles p join auth.users u on u.id = p.user_id where u.email = $1 and p.church_id = $2",
    [memberEmail, SEED_CHURCH_ID],
  );
  return rows[0].id;
}

test.describe("a member's recurring gift", () => {
  test.use({ storageState: authFilePath("member") });

  test.afterEach(async () => {
    await queryTenantDb("delete from public.recurring_gifts where profile_id = $1", [await memberProfileId()]);
  });

  test("sets one up, pauses and resumes it, changes it, then cancels it", async ({ page }) => {
    await page.goto("/app/member/giving");
    await page.getByRole("button", { name: "Set up a recurring gift" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: "Amount" }).fill("40");
    await drawer.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Recurring gift set up (dev mode)")).toBeVisible();

    const gift = page.locator(".mantine-Paper-root", { hasText: "$40.00 / month" }).last();
    await expect(gift.getByText("Active")).toBeVisible();
    const { rows } = await queryTenantDb<{ status: string; frequency: string; amount_cents: number }>(
      "select status, frequency, amount_cents from public.recurring_gifts where profile_id = $1",
      [await memberProfileId()],
    );
    expect(rows).toEqual([{ status: "active", frequency: "monthly", amount_cents: 4000 }]);

    await gift.getByRole("button", { name: "Pause" }).click();
    await expect(gift.getByText("Paused")).toBeVisible();
    await gift.getByRole("button", { name: "Resume" }).click();
    await expect(gift.getByText("Active")).toBeVisible();

    // Change: a new amount and frequency (G3 definition of done: create,
    // change and cancel). The gift is a dev-mode stub with no Stripe
    // subscription, so the change is recorded locally with no Stripe call.
    await gift.getByRole("button", { name: "Change" }).click();
    const changeDrawer = page.getByRole("dialog");
    await expect(changeDrawer.getByText("Change recurring gift")).toBeVisible();
    await changeDrawer.getByRole("textbox", { name: "Amount" }).fill("55");
    await changeDrawer.getByRole("combobox", { name: "How often" }).click();
    await page.getByRole("option", { name: "Every two weeks" }).click();
    await changeDrawer.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Recurring gift updated")).toBeVisible();

    const changed = page.locator(".mantine-Paper-root", { hasText: "$55.00 / two weeks" }).last();
    await expect(changed.getByText("Active")).toBeVisible();
    await expect(page.locator(".mantine-Paper-root", { hasText: "$40.00 / month" })).toHaveCount(0);
    const after = await queryTenantDb<{ status: string; frequency: string; amount_cents: number; fund_designation: string }>(
      "select status, frequency, amount_cents, fund_designation from public.recurring_gifts where profile_id = $1",
      [await memberProfileId()],
    );
    expect(after.rows).toEqual([{ status: "active", frequency: "biweekly", amount_cents: 5500, fund_designation: "General" }]);

    await changed.getByRole("button", { name: "Cancel" }).click();
    await changed.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(page.getByText("Recurring gift cancelled")).toBeVisible();
    await expect(page.locator(".mantine-Paper-root", { hasText: "$55.00 / two weeks" })).toHaveCount(0);
  });
});

test.describe("church admin: recurring gifts", () => {
  test.use({ storageState: authFilePath("church-admin") });

  test("lists the church's recurring gifts, never naming an anonymous giver", async ({ page }) => {
    const profileId = await memberProfileId();
    const { rows } = await queryTenantDb<{ id: string }>(
      `insert into public.recurring_gifts (church_id, profile_id, amount_cents, fund_designation, frequency, start_date, status, is_anonymous, stripe_subscription_id)
       values ($1, $2, 7700, 'Missions', 'weekly', current_date, 'active', true, 'sub_stub_e2e_' || gen_random_uuid())
       returning id`,
      [SEED_CHURCH_ID, profileId],
    );
    try {
      await page.goto("/app/church-admin/giving");
      await page.getByRole("tab", { name: "Recurring" }).click();
      const row = page.getByRole("row", { name: /\$77\.00/ });
      await expect(row.getByText("Anonymous")).toBeVisible();
      await expect(row.getByText("Missions")).toBeVisible();
    } finally {
      await queryTenantDb("delete from public.recurring_gifts where id = $1", [rows[0].id]);
    }
  });
});

test.describe("the public giving page (signed out)", () => {
  test("records a real one-time gift for the church, with no recurring option", async ({ page }) => {
    const email = `giver-${Date.now()}@example.test`;
    try {
      await page.goto("/give/grace-harbor");
      await expect(page.getByRole("textbox", { name: /Frequency/i })).toHaveCount(0);
      await page.getByRole("button", { name: "$25", exact: true }).click();
      await page.getByRole("textbox", { name: /Email/i }).fill(email);
      await page.getByRole("button", { name: /Complete Demo Gift|Give/ }).last().click();
      await expect(page.getByRole("heading", { level: 3 })).toBeVisible();

      const { rows } = await queryTenantDb<{ church_id: string; amount_cents: number; status: string; completed: boolean; receipted: boolean }>(
        `select church_id, amount_cents, status, completed_at is not null as completed, receipt_sent_at is not null as receipted
         from public.donations where donor_email = $1`,
        [email],
      );
      expect(rows).toEqual([{ church_id: SEED_CHURCH_ID, amount_cents: 2500, status: "succeeded", completed: true, receipted: true }]);
    } finally {
      await queryTenantDb("delete from public.donations where donor_email = $1", [email]);
    }
  });
});

test.describe("POST /api/webhooks/stripe — a recurring installment, retried (G3.2)", () => {
  test("a retry resumes a half-finished installment, and a repeated delivery records nothing twice", async ({ request }) => {
    const stamp = Date.now();
    const subscriptionId = `sub_e2e_${stamp}`;
    const invoiceId = `in_e2e_${stamp}`;
    const gift = await queryTenantDb<{ id: string }>(
      `insert into public.recurring_gifts (church_id, profile_id, amount_cents, fund_designation, frequency, start_date, status, stripe_subscription_id)
       values ($1, $2, 3000, 'General', 'monthly', current_date, 'active', $3) returning id`,
      [SEED_CHURCH_ID, await memberProfileId(), subscriptionId],
    );
    // An earlier attempt got as far as the receipt and then died before
    // writing completed_at (the completion marker, written last).
    const sentAt = "2026-10-02T12:00:00.000Z";
    await queryTenantDb(
      `insert into public.donations (church_id, amount_cents, status, is_recurring, recurring_gift_id, stripe_invoice_id, receipt_sent_at)
       values ($1, 3000, 'succeeded', true, $2, $3, $4)`,
      [SEED_CHURCH_ID, gift.rows[0].id, invoiceId, sentAt],
    );
    const body = JSON.stringify({
      type: "invoice.paid",
      data: {
        object: {
          id: invoiceId,
          subscription: subscriptionId,
          amount_paid: 3000,
          currency: "usd",
          metadata: { church_id: SEED_CHURCH_ID },
          lines: { data: [{ period: { end: Math.floor(Date.parse("2026-12-01T00:00:00Z") / 1000) } }] },
        },
      },
    });
    const deliver = () =>
      request.post("/api/webhooks/stripe", {
        data: body,
        headers: { "content-type": "application/json", "stripe-signature": signStripeWebhook(body, getWebhookSecret("stripe")) },
      });

    try {
      expect((await deliver()).status()).toBe(200);
      expect((await deliver()).status()).toBe(200); // Stripe delivers it again

      const { rows } = await queryTenantDb<{ status: string; completed: boolean; receipt_sent_at: string }>(
        `select status, completed_at is not null as completed, receipt_sent_at from public.donations where stripe_invoice_id = $1`,
        [invoiceId],
      );
      // One row; completed now; the receipt from the first attempt kept
      // (claimed already), so no second receipt was sent.
      expect(rows).toEqual([{ status: "succeeded", completed: true, receipt_sent_at: new Date(sentAt) }]);
      const giftRow = await queryTenantDb<{ next_payment_at: Date; paid: boolean }>(
        `select next_payment_at, last_payment_at is not null as paid from public.recurring_gifts where id = $1`,
        [gift.rows[0].id],
      );
      expect(giftRow.rows[0]).toEqual({ next_payment_at: new Date("2026-12-01T00:00:00Z"), paid: true });
    } finally {
      await queryTenantDb("delete from public.donations where stripe_invoice_id = $1", [invoiceId]);
      await queryTenantDb("delete from public.recurring_gifts where id = $1", [gift.rows[0].id]);
    }
  });
});
