/**
 * Member write journeys, as a real signed-in member (S8).
 *
 * Members have no INSERT/UPDATE policy on donations, attendance or
 * group_members, and the event_rsvps self policy compared a profile id with
 * the login id — so giving, group join and RSVP all failed for real members,
 * and registration capacity was counted through RLS (members only see their
 * own rows), so it was never enforced. These journeys pin the fixes end to
 * end. Each creates its own data, marked, and cleans it up.
 */
import { expect, test } from "@playwright/test";

import { queryTenantDb } from "./fixtures/api";
import { authFilePath } from "./fixtures/roles";

const MEMBER_EMAIL = "david@graceharbor.church";
const MARK = "e2e-member-writes";

async function member() {
  const res = await queryTenantDb<{ id: string; church_id: string }>(
    `select id, church_id from public.profiles where email = $1`,
    [MEMBER_EMAIL],
  );
  return res.rows[0];
}

async function cleanUp() {
  await queryTenantDb(`delete from public.donations where note = $1`, [MARK]);
  await queryTenantDb(`delete from public.group_members where group_id in (select id from public.groups where name = $1)`, [MARK]);
  await queryTenantDb(`delete from public.groups where name = $1`, [MARK]);
  await queryTenantDb(`delete from public.events where title like $1`, [`${MARK}%`]);
}

test.describe("Member writes (S8)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: authFilePath("member") });

  test.beforeEach(cleanUp);
  test.afterAll(cleanUp);

  test("a member gives (stub mode) and the gift is recorded as succeeded", async ({ page }) => {
    const me = await member();
    await page.goto("/app/member/giving");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Give now" }).click();
    await page.getByLabel("Note (optional)").fill(MARK);
    await page.getByRole("button", { name: /^Give \$25\.00/ }).click();
    await expect(page.getByText("Gift recorded (dev mode)")).toBeVisible();

    const rows = await queryTenantDb<{ status: string; profile_id: string; amount_cents: number }>(
      `select status, profile_id, amount_cents from public.donations where note = $1`,
      [MARK],
    );
    expect(rows.rows).toEqual([{ status: "succeeded", profile_id: me.id, amount_cents: 2500 }]);
  });

  test("a member asks to join an open group", async ({ page }) => {
    const me = await member();
    await queryTenantDb(
      `insert into public.groups (church_id, name, is_open, is_active) values ($1, $2, true, true)`,
      [me.church_id, MARK],
    );

    await page.goto("/app/member/groups");
    await page.waitForLoadState("networkidle");
    await page.locator(".mantine-Paper-root, .mantine-Card-root", { hasText: MARK }).getByRole("button", { name: "Join" }).click();
    await expect(page.getByText("Request sent! A leader will confirm your membership.")).toBeVisible();

    const rows = await queryTenantDb<{ status: string }>(
      `select gm.status from public.group_members gm join public.groups g on g.id = gm.group_id
       where g.name = $1 and gm.profile_id = $2`,
      [MARK, me.id],
    );
    expect(rows.rows).toEqual([{ status: "pending" }]);
  });

  test("a member RSVPs to an event", async ({ page }) => {
    const me = await member();
    const title = `${MARK} potluck`;
    const event = await queryTenantDb<{ id: string }>(
      // Noon on the church's own today: the calendar shows the church's month,
      // and UTC's today is already tomorrow in a New York evening (G1.6).
      `insert into public.events (church_id, title, starts_at, ends_at, category, visibility, rsvp_enabled)
       select c.id, $2,
              ((now() at time zone c.timezone)::date + time '12:00') at time zone c.timezone,
              ((now() at time zone c.timezone)::date + time '14:00') at time zone c.timezone,
              'general', 'members', true
       from public.churches c where c.id = $1
       returning id`,
      [me.church_id, title],
    );

    await page.goto("/app/calendar");
    await page.waitForLoadState("networkidle");
    await page.getByText(title).first().click();
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText("RSVP updated.").first()).toBeVisible();

    const rows = await queryTenantDb<{ status: string }>(
      `select status::text from public.event_rsvps where event_id = $1 and user_id = $2`,
      [event.rows[0].id, me.id],
    );
    expect(rows.rows).toEqual([{ status: "yes" }]);
  });

  test("registration is refused once an event is full, counting everyone's registrations", async ({ page }) => {
    const me = await member();
    const title = `${MARK} workshop`;
    // Capacity 1, already taken by someone else — a member's own RLS view can't see that row.
    await queryTenantDb(
      `with ev as (
         insert into public.events (church_id, title, starts_at, ends_at, category, visibility)
         values ($1, $2, now() + interval '10 days', now() + interval '10 days 2 hours', 'general', 'members')
         returning id, church_id
       ), settings as (
         insert into public.event_registration_settings (event_id, church_id, registration_open, capacity, waitlist_enabled)
         select id, church_id, true, 1, false from ev
       )
       insert into public.event_registrations (event_id, church_id, registrant_name, status, payment_status)
       select id, church_id, 'Someone Else', 'confirmed', 'not_required' from ev`,
      [me.church_id, title],
    );

    await page.goto("/app/member");
    await page.waitForLoadState("networkidle");
    // The panel is itself a Paper; the event's own row is the innermost (last) match.
    await page.locator(".mantine-Paper-root", { hasText: title }).last().getByRole("button", { name: "Register" }).click();
    await page.getByRole("button", { name: "Submit registration" }).click();
    await expect(page.getByText("This event is full and does not have a waitlist.")).toBeVisible();

    const mine = await queryTenantDb<{ n: string }>(
      `select count(*) as n from public.event_registrations r join public.events e on e.id = r.event_id
       where e.title = $1 and r.profile_id = $2`,
      [title, me.id],
    );
    expect(Number(mine.rows[0].n)).toBe(0);
  });
});
