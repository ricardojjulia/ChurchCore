/**
 * Building a service plan from scratch, as a church admin (G1.11).
 *
 * Gap 1's definition of done asks for journeys that build a plan and add
 * songs, not only work on the seeded plan (Council Review 24 found none did).
 * This one creates a plan, adds a song that isn't in the library yet (which
 * creates it), adds it again from the library, adds a position, assigns a
 * volunteer by hand and auto-fills the rest — checking the database at each
 * step. It creates its own data, marked, and cleans up.
 */
import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";
import { authFilePath } from "./fixtures/roles";

const PLAN_NAME = "E2E Build Journey Plan";
const SONG_TITLE = "E2E Build Journey Hymn";

async function planId(): Promise<string | undefined> {
  const res = await queryTenantDb<{ id: string }>(`select id from public.service_plans where name = $1`, [PLAN_NAME]);
  return res.rows[0]?.id;
}

async function cleanUp() {
  const id = await planId();
  if (id) {
    await queryTenantDb(
      `delete from public.communication_logs
       where church_id = (select church_id from public.service_plans where id = $1)
         and (subject like '%: please confirm %' or subject like '%: reminder to confirm %')
         and recipient_id in (select assigned_user_id from public.volunteer_shifts where plan_id = $1)`,
      [id],
    );
    await queryTenantDb(`delete from public.volunteer_shifts where plan_id = $1`, [id]);
    await queryTenantDb(`delete from public.service_plan_items where plan_id = $1`, [id]);
    await queryTenantDb(`delete from public.service_plan_positions where plan_id = $1`, [id]);
    const event = await queryTenantDb<{ event_id: string | null }>(`select event_id from public.service_plans where id = $1`, [id]);
    await queryTenantDb(`delete from public.service_plans where id = $1`, [id]);
    // The event created with the plan (it had none linked).
    if (event.rows[0]?.event_id) {
      await queryTenantDb(`delete from public.events where id = $1 and title = $2`, [event.rows[0].event_id, PLAN_NAME]);
    }
  }
  await queryTenantDb(`delete from public.song_library where title = $1`, [SONG_TITLE]);
}

test.describe("Service plan build journey (G1.11)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: authFilePath("church-admin") });

  test.beforeEach(cleanUp);
  test.afterAll(cleanUp);

  test("an admin builds a plan, adds songs, assigns by hand and auto-fills", async ({ page }) => {
    // A service five weeks out, in the church's own calendar.
    const serviceDate = (
      await queryTenantDb<{ d: string }>(
        `select ((now() at time zone c.timezone)::date + 35)::text as d
         from public.churches c where c.slug = 'grace-harbor' or c.name ilike 'Grace Harbor%' limit 1`,
      )
    ).rows[0].d;

    // 1. Create the plan; the app opens its builder.
    await page.goto("/app/church-admin/volunteers/schedules");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "New Plan" }).click();
    const create = page.getByRole("dialog", { name: "New Service Plan" });
    await create.getByLabel("Plan name").fill(PLAN_NAME);
    await create.getByLabel("Service date").fill(serviceDate);
    await create.getByLabel("Service time").fill("10:00");
    await create.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/app\/church-admin\/volunteers\/schedules\/[0-9a-f-]{36}$/);
    const id = await planId();
    expect(id).toBeTruthy();
    expect(page.url()).toContain(id!);
    await page.waitForLoadState("networkidle");

    // No event was linked, so the plan got its own — at 10:00 in the church's
    // zone, as a real instant — or no one could be assigned to it.
    const event = await queryTenantDb<{ title: string; matches: boolean }>(
      `select e.title, e.starts_at = ((sp.service_date + time '10:00') at time zone c.timezone) as matches
       from public.service_plans sp
       join public.events e on e.id = sp.event_id
       join public.churches c on c.id = sp.church_id
       where sp.id = $1`,
      [id],
    );
    expect(event.rows).toEqual([{ title: PLAN_NAME, matches: true }]);

    // 2. Add a song that isn't in the library: it's created, then added.
    const search = page.getByLabel("Search song library");
    await search.fill(SONG_TITLE);
    await page.getByRole("button", { name: `Create "${SONG_TITLE}" as a new song` }).click();
    await page.getByLabel("Key").fill("G");
    await page.getByRole("button", { name: "Add song" }).click();
    await expect
      .poll(async () =>
        (await queryTenantDb<{ n: string }>(
          `select count(*) as n from public.service_plan_items where plan_id = $1 and title = $2`,
          [id, SONG_TITLE],
        )).rows[0].n,
      )
      .toBe("1");
    const library = await queryTenantDb<{ default_key: string }>(
      `select default_key from public.song_library where title = $1`,
      [SONG_TITLE],
    );
    expect(library.rows).toEqual([{ default_key: "G" }]);

    // 3. Add it again, this time found in the library.
    await search.fill(SONG_TITLE);
    const result = page.locator(".mantine-Paper-root", { hasText: SONG_TITLE }).filter({
      has: page.getByRole("button", { name: "Add", exact: true }),
    });
    await result.getByRole("button", { name: "Add", exact: true }).click();
    await expect
      .poll(async () =>
        (await queryTenantDb<{ n: string }>(
          `select count(*) as n from public.service_plan_items where plan_id = $1 and title = $2`,
          [id, SONG_TITLE],
        )).rows[0].n,
      )
      .toBe("2");
    // Still one library entry: the second add reused it.
    expect(
      (await queryTenantDb<{ n: string }>(`select count(*) as n from public.song_library where title = $1`, [SONG_TITLE]))
        .rows[0].n,
    ).toBe("1");

    // 4. Add a position needing two greeters.
    await page.getByRole("button", { name: "Add Position" }).click();
    const addPosition = page.getByRole("dialog", { name: "Add Position" });
    await addPosition.getByLabel("Role type").click();
    await page.getByRole("option", { name: "Greeter" }).click();
    await addPosition.getByLabel("Quantity needed").fill("2");
    await addPosition.getByRole("button", { name: "Add", exact: true }).click();
    await expect(addPosition).toBeHidden();

    // 5. Assign one volunteer by hand.
    const position = page.locator('[data-testid^="plan-position-"]', { hasText: "Greeter" });
    await position.getByRole("button", { name: "Assign" }).click();
    const assign = page.getByRole("dialog");
    await assign.getByPlaceholder("Search by name or email").fill("Maya");
    await assign.locator(".mantine-Paper-root", { hasText: "Maya Martinez" }).getByRole("button", { name: "Assign" }).click();
    await expect(page.getByText(/^Maya Martinez assigned as Greeter\./)).toBeVisible();

    // 6. Auto-fill the remaining slot.
    await page.getByRole("button", { name: "Auto-fill plan" }).click();
    await page.getByRole("button", { name: /^Apply 1 assignment/ }).click();
    await expect
      .poll(async () =>
        (await queryTenantDb<{ n: string }>(
          `select count(*) as n from public.volunteer_shifts where plan_id = $1 and confirmation_status <> 'declined'`,
          [id],
        )).rows[0].n,
      )
      .toBe("2");

    // Both shifts are on the service date, in the church's wall-clock form (ADR 0023).
    const shifts = await queryTenantDb<{ day: string; clock: string }>(
      `select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD') as day, to_char(starts_at at time zone 'UTC', 'HH24:MI') as clock
       from public.volunteer_shifts where plan_id = $1`,
      [id],
    );
    expect(shifts.rows).toEqual([
      { day: serviceDate, clock: "10:00" },
      { day: serviceDate, clock: "10:00" },
    ]);
  });
});
