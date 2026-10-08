import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

import { queryTenantDb } from "./fixtures/api";
import { getTenantDbUrl } from "./fixtures/env";
import { authFilePath, SEED_CHURCH_ID } from "./fixtures/roles";

/**
 * G4.1 journey: a church admin imports the Planning Center and Breeze fixtures
 * (tests/fixtures/imports, see its README for how much of each header row is
 * verified) through the real import pages, in the order people, events, giving,
 * attendance, tags. Then re-imports everything and checks nothing doubles, and
 * that a second church holding the same Breeze ID is never linked.
 * Seeds nothing it does not also remove.
 */

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ storageState: authFilePath("church-admin") });

const TAG = `e2e-g41-${Date.now()}`;
const OTHER_CHURCH_ID = "00000000-0000-0000-0000-00000000e4a1";
const OTHER_PROFILE_ID = "00000000-0000-0000-0000-00000000e4a2";
const startedAt = new Date();

const MEMBER_NUMBERS = ["90001", "90002", "90003", "90004", "5001", "5002", "5003", "5004"];
const EVENT_SOURCE_IDS = ["pco-evt-1", "pco-evt-2", "brz-evt-1", "brz-evt-2", "brz-evt-3"];
const GROUP_NAMES = ["Adult Class", "New Members 2026"];

function fixture(path: string) {
  return readFileSync(join(process.cwd(), "tests/fixtures/imports", path), "utf8");
}

async function count(sql: string, values: unknown[] = []): Promise<number> {
  const { rows } = await queryTenantDb<{ n: string }>(sql, values);
  return Number(rows[0]?.n ?? 0);
}

/** Opens an import page, pastes the CSV, picks the source system and runs the dry run. */
async function dryRun(page: Page, path: string, source: RegExp | null, name: string, csv: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  if (source) {
    await expect(async () => {
      await page.getByRole("combobox", { name: "Source system" }).click({ timeout: 2000 });
      await page.getByRole("option", { name: source }).click({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  }
  await expect(async () => {
    await page.getByLabel("Source filename").fill(`${TAG}-${name}`, { timeout: 2000 });
    await page.getByLabel("CSV content").fill(csv, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "Run dry import" }).click();
  await expect(page.getByRole("button", { name: "Commit batch" })).toBeVisible({ timeout: 30_000 });
}

async function commit(page: Page, summary: string) {
  await page.getByRole("button", { name: "Commit batch" }).click();
  await expect(page.getByText(summary)).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(async () => {
  // A second church whose person uses Breeze ID 5001 as well.
  await queryTenantDb(
    `insert into public.churches (id, name, slug) values ($1, 'Import Other Church', $2) on conflict (id) do nothing`,
    [OTHER_CHURCH_ID, `import-other-${Date.now()}`],
  );
  await queryTenantDb(
    `insert into public.profiles (id, church_id, full_name, email, member_number)
     values ($1, $2, 'Other Church Person', $3, '5001')`,
    [OTHER_PROFILE_ID, OTHER_CHURCH_ID, `other-${TAG}@example.test`],
  );
  // A group whose name differs from the "Hospitality" tag only by case.
  await queryTenantDb(
    `insert into public.groups (church_id, name, category, description) values ($1, 'hospitality', 'general', $2)`,
    [SEED_CHURCH_ID, `pre-existing ${TAG}`],
  );
});

test.afterAll(async () => {
  const seedProfiles = (
    await queryTenantDb<{ id: string }>(
      "select id from public.profiles where church_id = $1 and member_number = any($2::text[])",
      [SEED_CHURCH_ID, MEMBER_NUMBERS],
    )
  ).rows.map((r) => r.id);
  const groups = (
    await queryTenantDb<{ id: string }>(
      "select id from public.groups where church_id = $1 and (lower(name) = 'hospitality' or name = any($2::text[]))",
      [SEED_CHURCH_ID, GROUP_NAMES],
    )
  ).rows.map((r) => r.id);
  const donations = (
    await queryTenantDb<{ id: string }>(
      `select id from public.donations where church_id = $1
         and (source_id like 'pco-giv-%' or source_id like 'brz-giv-%' or source_id in ('PCO-REMOTE-77', 'ch_example_0001'))`,
      [SEED_CHURCH_ID],
    )
  ).rows.map((r) => r.id);
  const attendance = (
    await queryTenantDb<{ id: string }>(
      "select id from public.attendance where church_id = $1 and source_id like 'brz-att-%'",
      [SEED_CHURCH_ID],
    )
  ).rows.map((r) => r.id);
  const events = (
    await queryTenantDb<{ id: string }>(
      "select id from public.events where church_id = $1 and source_id = any($2::text[])",
      [SEED_CHURCH_ID, EVENT_SOURCE_IDS],
    )
  ).rows.map((r) => r.id);
  const memberships = (
    await queryTenantDb<{ id: string }>("select id from public.group_members where church_id = $1 and group_id = any($2::uuid[])", [
      SEED_CHURCH_ID,
      groups,
    ])
  ).rows.map((r) => r.id);
  const families = (
    await queryTenantDb<{ id: string }>(
      "select id from public.families where church_id = $1 and family_name in ('Lovelace Household', 'Babbage Household', 'Hopper Household')",
      [SEED_CHURCH_ID],
    )
  ).rows.map((r) => r.id);

  await queryTenantDb("delete from public.attendance where id = any($1::uuid[])", [attendance]);
  await queryTenantDb("delete from public.donations where id = any($1::uuid[])", [donations]);
  await queryTenantDb("delete from public.group_members where id = any($1::uuid[])", [memberships]);
  await queryTenantDb("delete from public.groups where id = any($1::uuid[])", [groups]);
  await queryTenantDb("delete from public.events where id = any($1::uuid[])", [events]);
  await queryTenantDb("delete from public.profiles where id = any($1::uuid[])", [seedProfiles]);
  await queryTenantDb("delete from public.families where id = any($1::uuid[])", [families]);
  await queryTenantDb(
    `delete from public.import_batch_rows where batch_id in
       (select id from public.import_batches where church_id = $1 and source_filename like $2)`,
    [SEED_CHURCH_ID, `${TAG}-%`],
  );
  await queryTenantDb("delete from public.import_batches where church_id = $1 and source_filename like $2", [
    SEED_CHURCH_ID,
    `${TAG}-%`,
  ]);
  // Audit entries this run caused on the rows it created.
  await queryTenantDb(
    `delete from public.audit_log
      where church_id = $1 and changed_at >= $2
        and record_id = any($3::uuid[])`,
    [SEED_CHURCH_ID, startedAt, [...seedProfiles, ...groups, ...donations, ...attendance, ...events, ...memberships, ...families]],
  );

  // The second church: removed table by table with triggers off, because
  // deleting a church cascades into tables whose audit triggers reference it.
  const client = new pg.Client({ connectionString: getTenantDbUrl() });
  await client.connect();
  try {
    await client.query("set session_replication_role = replica");
    for (const table of ["audit_log", "profiles"]) {
      await client.query(`delete from public.${table} where church_id = $1`, [OTHER_CHURCH_ID]);
    }
    await client.query("delete from public.churches where id = $1", [OTHER_CHURCH_ID]);
  } finally {
    await client.query("set session_replication_role = origin");
    await client.end();
  }
});

test("people: Planning Center then Breeze exports create everyone; a re-import only updates", async ({ page }) => {
  await dryRun(page, "/app/church-admin/people/import", /Planning Center/, "pco-people.csv", fixture("planning-center/people.csv"));
  await expect(page.getByText("create 4", { exact: true })).toBeVisible();
  await commit(page, "Created 4, updated 0, failed 0");

  await dryRun(page, "/app/church-admin/people/import", /Breeze/, "brz-people.csv", fixture("breeze/people.csv"));
  await expect(page.getByText("create 4", { exact: true })).toBeVisible();
  await commit(page, "Created 4, updated 0, failed 0");

  expect(
    await count("select count(*) as n from public.profiles where church_id = $1 and member_number = any($2::text[])", [
      SEED_CHURCH_ID,
      MEMBER_NUMBERS,
    ]),
  ).toBe(8);
  // Breeze: the first of several addresses is primary; names are First + Last.
  const maria = await queryTenantDb<{ full_name: string; email: string }>(
    "select full_name, email from public.profiles where church_id = $1 and member_number = '5001'",
    [SEED_CHURCH_ID],
  );
  expect(maria.rows[0]).toEqual({ full_name: "Maria Santos", email: "maria.santos@example.org" });
  // Planning Center: Given Name used when First Name is blank; Nickname never imported.
  const charles = await queryTenantDb<{ full_name: string }>(
    "select full_name from public.profiles where church_id = $1 and member_number = '90002'",
    [SEED_CHURCH_ID],
  );
  expect(charles.rows[0]?.full_name).toBe("Charles Babbage");
  expect(await count("select count(*) as n from public.families where church_id = $1 and family_name = 'Lovelace Household'", [SEED_CHURCH_ID])).toBe(1);

  // Re-import: matched by vendor id, nothing created.
  await dryRun(page, "/app/church-admin/people/import", /Planning Center/, "pco-people-again.csv", fixture("planning-center/people.csv"));
  await expect(page.getByText("create 0", { exact: true })).toBeVisible();
  await expect(page.getByText("update 4", { exact: true })).toBeVisible();
  await commit(page, "Created 0, updated 4, failed 0");
  expect(
    await count("select count(*) as n from public.profiles where church_id = $1 and member_number = any($2::text[])", [
      SEED_CHURCH_ID,
      MEMBER_NUMBERS,
    ]),
  ).toBe(8);
});


test("people: uploading a vendor file without choosing a source detects the vendor and rejects nothing", async ({ page }) => {
  await page.goto("/app/church-admin/people/import");
  await page.waitForLoadState("networkidle");
  // Default source is Generic CSV; the upload alone must switch it.
  await expect(async () => {
    await page
      .locator('input[type="file"]')
      .setInputFiles(join(process.cwd(), "tests/fixtures/imports/breeze/people.csv"), { timeout: 2000 });
    await expect(page.getByText("Detected a Breeze file; source set to Breeze.")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Source filename").fill(`${TAG}-detect-people.csv`);
  await page.getByRole("button", { name: "Run dry import" }).click();
  await expect(page.getByText("update 4", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("reject 0", { exact: true })).toBeVisible();

  // Pasting a Planning Center file also switches the source and clears the old result.
  await page.getByLabel("CSV content").fill(fixture("planning-center/people.csv"));
  await expect(page.getByText("Detected a Planning Center file; source set to Planning Center.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit batch" })).toHaveCount(0);
  await page.getByRole("button", { name: "Run dry import" }).click();
  await expect(page.getByText("reject 0", { exact: true })).toBeVisible({ timeout: 30_000 });
});

test("events: both calendars import with church-local times", async ({ page }) => {
  await dryRun(page, "/app/church-admin/events/import", /Planning Center/, "pco-events.csv", fixture("planning-center/events.csv"));
  await commit(page, "Created 2, updated 0, failed 0");
  await dryRun(page, "/app/church-admin/events/import", /Breeze/, "brz-events.csv", fixture("breeze/events.csv"));
  await commit(page, "Created 3, updated 0, failed 0");

  expect(
    await count("select count(*) as n from public.events where church_id = $1 and source_id = any($2::text[])", [
      SEED_CHURCH_ID,
      EVENT_SOURCE_IDS,
    ]),
  ).toBe(5);

  // 10:30 am on 2026-09-06 in the church's own time zone, not in UTC.
  const sunday = await queryTenantDb<{ local: string }>(
    `select to_char(e.starts_at at time zone c.timezone, 'YYYY-MM-DD HH24:MI') as local
       from public.events e join public.churches c on c.id = e.church_id
      where e.church_id = $1 and e.source_id = 'brz-evt-1'`,
    [SEED_CHURCH_ID],
  );
  expect(sunday.rows[0]?.local).toBe("2026-09-06 10:30");
});

test("giving: links by vendor id and email, keeps anonymous and unmatched gifts anonymous, skips zero and refunds", async ({ page }) => {
  await dryRun(page, "/app/church-admin/giving/import", /Planning Center/, "pco-giving.csv", fixture("planning-center/giving.csv"));
  await expect(page.getByText("reject 2", { exact: true })).toBeVisible();
  await commit(page, "Created 6, updated 0, failed 0");

  await dryRun(page, "/app/church-admin/giving/import", /Breeze/, "brz-giving.csv", fixture("breeze/giving.csv"));
  await expect(page.getByText("reject 2", { exact: true })).toBeVisible();
  await commit(page, "Created 5, updated 0, failed 0");

  const donations = await count(
    `select count(*) as n from public.donations where church_id = $1
       and (source_id like 'pco-giv-%' or source_id like 'brz-giv-%' or source_id in ('PCO-REMOTE-77', 'ch_example_0001'))`,
    [SEED_CHURCH_ID],
  );
  expect(donations).toBe(11);

  // $1,250.00 from Ada, linked by email to the Planning Center person.
  const ada = await queryTenantDb<{ amount_cents: number; is_anonymous: boolean; member_number: string }>(
    `select d.amount_cents, d.is_anonymous, p.member_number
       from public.donations d join public.profiles p on p.id = d.profile_id
      where d.church_id = $1 and d.source_id like 'pco-giv-%' and d.amount_cents = 125000`,
    [SEED_CHURCH_ID],
  );
  expect(ada.rows).toEqual([{ amount_cents: 125000, is_anonymous: false, member_number: "90001" }]);

  // Breeze ID 5002 linked via Processor ID gift; the church's own person, never the other church's 5001.
  const joel = await queryTenantDb<{ church_id: string; member_number: string }>(
    `select p.church_id, p.member_number from public.donations d join public.profiles p on p.id = d.profile_id
      where d.church_id = $1 and d.source_id = 'ch_example_0001'`,
    [SEED_CHURCH_ID],
  );
  expect(joel.rows).toEqual([{ church_id: SEED_CHURCH_ID, member_number: "5002" }]);
  expect(await count("select count(*) as n from public.donations where profile_id = $1", [OTHER_PROFILE_ID])).toBe(0);
  expect(
    await count(
      `select count(*) as n from public.donations d join public.profiles p on p.id = d.profile_id
        where d.church_id = $1 and p.church_id <> d.church_id`,
      [SEED_CHURCH_ID],
    ),
  ).toBe(0);

  // Anonymous and unmatched Breeze gifts have no donor.
  expect(
    await count(
      `select count(*) as n from public.donations
        where church_id = $1 and source_id like 'brz-giv-%' and profile_id is null and is_anonymous`,
      [SEED_CHURCH_ID],
    ),
  ).toBe(2);
  // Zero and negative amounts never become gifts.
  expect(await count("select count(*) as n from public.donations where church_id = $1 and amount_cents <= 0", [SEED_CHURCH_ID])).toBe(0);

  // Re-import: explicit ids update, content-derived ids are "Already imported".
  await dryRun(page, "/app/church-admin/giving/import", /Breeze/, "brz-giving-again.csv", fixture("breeze/giving.csv"));
  await expect(page.getByText("create 0", { exact: true })).toBeVisible();
  await commit(page, "Created 0, updated 1, failed 0");
  await dryRun(page, "/app/church-admin/giving/import", /Planning Center/, "pco-giving-again.csv", fixture("planning-center/giving.csv"));
  await expect(page.getByText("create 0", { exact: true })).toBeVisible();
  await commit(page, "Created 0, updated 1, failed 0");

  expect(
    await count(
      `select count(*) as n from public.donations where church_id = $1
         and (source_id like 'pco-giv-%' or source_id like 'brz-giv-%' or source_id in ('PCO-REMOTE-77', 'ch_example_0001'))`,
      [SEED_CHURCH_ID],
    ),
  ).toBe(11);
});

test("attendance: Breeze check-ins match people and events, skip anonymous and unknowns, and repeat safely", async ({ page }) => {
  await dryRun(page, "/app/church-admin/attendance/import", /Breeze/, "brz-attendance.csv", fixture("breeze/attendance.csv"));
  await expect(page.getByText("create 3", { exact: true })).toBeVisible();
  await expect(page.getByText("skip 4", { exact: true })).toBeVisible();
  await commit(page, "Created 3, updated 0, failed 0");

  const rows = await queryTenantDb<{ member_number: string; title: string }>(
    `select p.member_number, e.title
       from public.attendance a
       join public.profiles p on p.id = a.profile_id
       join public.events e on e.id = a.event_id
      where a.church_id = $1 and a.source_id like 'brz-att-%'
      order by p.member_number`,
    [SEED_CHURCH_ID],
  );
  expect(rows.rows).toEqual([
    { member_number: "5001", title: "Sunday Service" },
    { member_number: "5002", title: "Sunday Service" },
    { member_number: "5003", title: "Youth Night" },
  ]);
  // No event was created from attendance.
  expect(await count("select count(*) as n from public.events where church_id = $1 and title = 'Unknown Event'", [SEED_CHURCH_ID])).toBe(0);

  await dryRun(page, "/app/church-admin/attendance/import", /Breeze/, "brz-attendance-again.csv", fixture("breeze/attendance.csv"));
  await expect(page.getByText("create 0", { exact: true })).toBeVisible();
  await commit(page, "Created 0, updated 3, failed 0");
  expect(await count("select count(*) as n from public.attendance where church_id = $1 and source_id like 'brz-att-%'", [SEED_CHURCH_ID])).toBe(3);
});

test("tags: Breeze tags join existing groups by name, create missing ones closed, and never duplicate", async ({ page }) => {
  await dryRun(page, "/app/church-admin/groups/import", /Breeze/, "brz-tags.csv", fixture("breeze/tags.csv"));
  await expect(page.getByText("create 5", { exact: true })).toBeVisible();
  await commit(page, "Created 5, updated 0, failed 0");

  // "Hospitality" matched the pre-existing "hospitality" group, so no second group.
  expect(await count("select count(*) as n from public.groups where church_id = $1 and lower(name) = 'hospitality'", [SEED_CHURCH_ID])).toBe(1);
  expect(
    await count(
      `select count(*) as n from public.group_members gm join public.groups g on g.id = gm.group_id
        where g.church_id = $1 and lower(g.name) = 'hospitality' and gm.role = 'member' and gm.status = 'active'`,
      [SEED_CHURCH_ID],
    ),
  ).toBe(3);

  const created = await queryTenantDb<{ name: string; is_open: boolean; category: string; description: string | null }>(
    "select name, is_open, category, description from public.groups where church_id = $1 and name = any($2::text[]) order by name",
    [SEED_CHURCH_ID, GROUP_NAMES],
  );
  expect(created.rows).toEqual([
    { name: "Adult Class", is_open: false, category: "general", description: null },
    {
      name: "New Members 2026",
      is_open: false,
      category: "general",
      description: "Imported from Breeze tag folder: Youth>>Students",
    },
  ]);

  // The person from the second church (also Breeze ID 5001) was never added anywhere.
  expect(await count("select count(*) as n from public.group_members where profile_id = $1", [OTHER_PROFILE_ID])).toBe(0);

  // Re-import: everyone is already a member; nothing to create.
  await dryRun(page, "/app/church-admin/groups/import", /Breeze/, "brz-tags-again.csv", fixture("breeze/tags.csv"));
  await expect(page.getByText("create 0", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit batch" })).toBeDisabled();
  expect(
    await count(
      `select count(*) as n from public.group_members gm join public.groups g on g.id = gm.group_id
        where g.church_id = $1 and (lower(g.name) = 'hospitality' or g.name = any($2::text[]))`,
      [SEED_CHURCH_ID, GROUP_NAMES],
    ),
  ).toBe(5);
});
