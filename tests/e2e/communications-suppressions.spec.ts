import { expect, test, type Page } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";
import { authFilePath, SEED_CHURCH_ID } from "./fixtures/roles";

/**
 * S11 journey: /app/communications/suppressions. An admin adds a manual
 * suppression and sees it, is refused a duplicate, removes a seeded bounce
 * with a reason (audited), and sees unsubscribe and spam rows locked. A pastor
 * sees the list with no controls. Seeds its own rows and removes them after.
 */

test.describe.configure({ mode: "serial" });

const TAG = `e2e-supp-${Date.now()}`;
const MANUAL_EMAIL = `manual-${TAG}@example.test`;
const BOUNCE_EMAIL = `bounce-${TAG}@example.test`;
const UNSUB_EMAIL = `unsub-${TAG}@example.test`;
const SPAM_EMAIL = `spam-${TAG}@example.test`;
const startedAt = new Date();

/**
 * Next streams this route and briefly keeps the pre-hydration markup next to
 * the hydrated copy, so a label can resolve to two inputs for a moment. Wait
 * until the page has settled to one before interacting.
 */
async function settled(page: Page) {
  // The count can read 1 before the duplicate appears (1 → 2 → 1), so wait for
  // the network to go quiet first, then for a single input.
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Search by contact or name")).toHaveCount(1);
}

/** Fills the search box, retrying while hydration briefly duplicates it. */
async function search(page: Page, text: string) {
  await expect(async () => {
    await page.getByLabel("Search by contact or name").fill(text, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

async function seed(contact: string, reason: string, notes: string) {
  await queryTenantDb(
    `insert into public.communication_suppressions (church_id, channel, contact, reason, notes)
     values ($1, 'email', $2, $3, $4)`,
    [SEED_CHURCH_ID, contact, reason, notes],
  );
}

test.beforeAll(async () => {
  await seed(BOUNCE_EMAIL, "bounce", `bounce note ${TAG}`);
  await seed(UNSUB_EMAIL, "unsubscribe", `unsub note ${TAG}`);
  await seed(SPAM_EMAIL, "complaint", `spam note ${TAG}`);
});

test.afterAll(async () => {
  const { rows } = await queryTenantDb<{ id: string }>(
    "select id from public.communication_suppressions where church_id = $1 and contact like $2",
    [SEED_CHURCH_ID, `%${TAG}%`],
  );
  const ids = rows.map((r) => r.id);
  await queryTenantDb("delete from public.communication_suppressions where church_id = $1 and contact like $2", [
    SEED_CHURCH_ID,
    `%${TAG}%`,
  ]);
  // Audit rows for this run: the app's explicit removal entry (old_values carries the contact) and the table trigger's.
  await queryTenantDb(
    `delete from public.audit_log
      where church_id = $1 and table_name = 'communication_suppressions' and changed_at >= $2
        and (record_id = any($3::uuid[]) or old_values::text like $4 or new_values::text like $4)`,
    [SEED_CHURCH_ID, startedAt, ids, `%${TAG}%`],
  );
});

test.describe("church admin", () => {
  test.use({ storageState: authFilePath("church-admin") });

  test("adds a manual suppression, sees it, and a duplicate is refused", async ({ page }) => {
    await page.goto("/app/communications/suppressions");
    await settled(page);
    await expect(page.getByRole("heading", { name: "Suppressions", level: 2 })).toBeVisible();

    await page.getByRole("textbox", { name: "Contact", exact: true }).fill("not-an-email");
    await page.getByRole("button", { name: "Add suppression" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();

    await page.getByRole("textbox", { name: "Contact", exact: true }).fill(MANUAL_EMAIL.toUpperCase());
    await page.getByLabel("Notes (optional)").fill(`manual note ${TAG}`);
    await page.getByRole("button", { name: "Add suppression" }).click();
    await expect(page.getByText("Contact suppressed.")).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(MANUAL_EMAIL) });
    await expect(row).toContainText("Added by staff");
    await expect(row).toContainText(`manual note ${TAG}`);

    await page.getByRole("textbox", { name: "Contact", exact: true }).fill(MANUAL_EMAIL);
    await page.getByRole("button", { name: "Add suppression" }).click();
    await expect(page.getByText(/already suppressed/)).toBeVisible();
  });

  test("removes a seeded bounce with a reason, audited; locked rows cannot be removed", async ({ page }) => {
    await page.goto("/app/communications/suppressions");
    await settled(page);
    await search(page, TAG);

    const unsub = page.getByRole("row", { name: new RegExp(UNSUB_EMAIL) });
    await expect(unsub).toContainText("Unsubscribed (link or STOP)");
    await expect(unsub).toContainText("Only the person can opt back in");
    await expect(unsub.getByRole("button", { name: /Remove/ })).toHaveCount(0);
    const spam = page.getByRole("row", { name: new RegExp(SPAM_EMAIL) });
    await expect(spam).toContainText("Marked as spam");
    await expect(spam.getByRole("button", { name: /Remove/ })).toHaveCount(0);

    await page.getByRole("button", { name: `Remove suppression for ${BOUNCE_EMAIL}` }).click();
    const dialog = page.getByRole("dialog", { name: "Remove suppression" });
    await expect(dialog.getByRole("button", { name: "Remove suppression" })).toBeDisabled();
    await dialog.getByLabel(/Reason/).fill("Mailbox fixed");
    await dialog.getByRole("button", { name: "Remove suppression" }).click();
    await expect(page.getByText(`${BOUNCE_EMAIL} can receive messages again.`)).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(BOUNCE_EMAIL) })).toHaveCount(0);

    const gone = await queryTenantDb("select 1 from public.communication_suppressions where church_id = $1 and contact = $2", [
      SEED_CHURCH_ID,
      BOUNCE_EMAIL,
    ]);
    expect(gone.rows).toHaveLength(0);
    const audit = await queryTenantDb<{ old_values: Record<string, string>; actor_role: string | null }>(
      `select old_values, actor_role from public.audit_log
        where church_id = $1 and table_name = 'communication_suppressions' and operation = 'DELETE'
          and old_values->>'removal_reason' = 'Mailbox fixed' and old_values->>'contact' = $2`,
      [SEED_CHURCH_ID, BOUNCE_EMAIL],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_role).toBe("church-admin");

    // The locked rows are untouched.
    const locked = await queryTenantDb("select 1 from public.communication_suppressions where church_id = $1 and contact in ($2, $3)", [
      SEED_CHURCH_ID,
      UNSUB_EMAIL,
      SPAM_EMAIL,
    ]);
    expect(locked.rows).toHaveLength(2);
  });

  test("the Suppressions item is in the sub-nav of History, Compose and Templates", async ({ page }) => {
    for (const path of ["history", "compose", "templates"]) {
      await page.goto(`/app/communications/${path}`);
      await expect(page.getByRole("link", { name: /Suppressions/ }).first()).toBeVisible();
    }
  });
});

test.describe("pastor", () => {
  test.use({ storageState: authFilePath("pastor") });

  test("sees the list without add or remove controls", async ({ page }) => {
    await page.goto("/app/communications/suppressions");
    await settled(page);
    await search(page, TAG);
    await expect(page.getByRole("row", { name: new RegExp(UNSUB_EMAIL) })).toBeVisible();
    await expect(page.getByText("Add a suppression")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  });
});
