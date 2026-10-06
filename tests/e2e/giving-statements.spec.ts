import { expect, test } from "@playwright/test";
import { inflateSync } from "node:zlib";

import { queryTenantDb } from "./fixtures/api";
import { getDemoCredentials } from "./fixtures/env";
import { authFilePath, SEED_CHURCH_ID } from "./fixtures/roles";

/**
 * G3.3 journey: year-end giving statements. Seeds last calendar year's gifts
 * (church time zone) in the spec, then walks the admin preview, the confirmed
 * send, an idempotent second send, the admin PDF, the member's own PDF and the
 * audit trail. CI and local e2e run in demo mode, so the email send is stubbed
 * (recorded as sent without a provider).
 */

test.describe.configure({ mode: "serial" });

const TAG = `e2e-stmt-${Date.now()}`;
const GUEST_EMAIL = `Guest-${TAG}@Example.test`; // mixed case: grouped by its normalized form
const SUPPRESSED_EMAIL = `suppressed-${TAG}@example.test`;
const GUEST_NAME = `E2E Guest ${TAG}`;
const SUPPRESSED_NAME = `E2E Suppressed ${TAG}`;

let lastYear = 0;
let memberId = "";
let memberName = "";
let optedOutId = "";
let optedOutName = "";
const insertedDonationIds: string[] = [];
let suppressionId = "";
let optedOutPrefCreated = false;
let startedAt = new Date();

/** `<lastYear>-<mm-dd hh:mm>` read as church-local (America/New_York) time. */
function localInstant(monthDayTime: string, yearOffset = 0): string {
  return `${lastYear + yearOffset}-${monthDayTime}`;
}

async function insertGift(values: {
  profileId?: string | null;
  donorName?: string | null;
  donorEmail?: string | null;
  cents: number;
  fund?: string | null;
  status?: string;
  anonymous?: boolean;
  at: string;
}) {
  const { rows } = await queryTenantDb<{ id: string }>(
    `insert into public.donations (church_id, profile_id, donor_name, donor_email, amount_cents, fund_designation, status, is_anonymous, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, ($9::timestamp at time zone 'America/New_York'))
     returning id`,
    [
      SEED_CHURCH_ID,
      values.profileId ?? null,
      values.donorName ?? null,
      values.donorEmail ?? null,
      values.cents,
      values.fund === undefined ? "General" : values.fund,
      values.status ?? "succeeded",
      values.anonymous ?? false,
      values.at,
    ],
  );
  insertedDonationIds.push(rows[0].id);
}

async function statementLogCount(): Promise<number> {
  const { rows } = await queryTenantDb<{ n: string }>(
    "select count(*) as n from public.communication_logs where church_id = $1 and segment_criteria ? 'statementKey'",
    [SEED_CHURCH_ID],
  );
  return Number(rows[0].n);
}

/** Pulls the text drawn on the PDF's pages (pdf-lib writes hex Tj strings in Flate streams). */
function pdfText(body: Buffer): string {
  const raw = body.toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      content = match[1];
    }
    for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      parts.push(Buffer.from(hex[1], "hex").toString("latin1"));
    }
    for (const lit of content.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) parts.push(lit[1]);
  }
  return parts.join("\n");
}

test.beforeAll(async () => {
  startedAt = new Date(Date.now() - 1000);
  const year = await queryTenantDb<{ y: number }>(
    "select (extract(year from (now() at time zone 'America/New_York'))::int - 1) as y",
  );
  lastYear = year.rows[0].y;

  const member = await queryTenantDb<{ id: string; full_name: string }>(
    "select p.id, p.full_name from public.profiles p join auth.users u on u.id = p.user_id where u.email = $1 and p.church_id = $2",
    [getDemoCredentials().memberEmail, SEED_CHURCH_ID],
  );
  memberId = member.rows[0].id;
  memberName = member.rows[0].full_name;

  // A profile with an email and no preference row yet, to opt out.
  const other = await queryTenantDb<{ id: string; full_name: string }>(
    `select p.id, p.full_name from public.profiles p
     where p.church_id = $1 and p.id <> $2 and p.email is not null and p.full_name is not null
       and not exists (select 1 from public.notification_preferences np where np.profile_id = p.id)
     order by p.id limit 1`,
    [SEED_CHURCH_ID, memberId],
  );
  optedOutId = other.rows[0].id;
  optedOutName = other.rows[0].full_name;
  await queryTenantDb("insert into public.notification_preferences (church_id, profile_id, email_opt_in) values ($1, $2, false)", [
    SEED_CHURCH_ID,
    optedOutId,
  ]);
  optedOutPrefCreated = true;

  // Member: a named gift, an anonymous gift at 11:30 pm Dec 31 church time (UTC date: Jan 1), and a refunded gift.
  await insertGift({ profileId: memberId, cents: 10000, fund: "General", at: localInstant("06-15 12:00") });
  await insertGift({ profileId: memberId, cents: 5000, fund: "Missions", anonymous: true, at: localInstant("12-31 23:30") });
  await insertGift({ profileId: memberId, cents: 99900, fund: "General", status: "refunded", at: localInstant("06-16 12:00") });
  // Just outside the range: 12:30 am Jan 1 of the next year, and a gift from the year before.
  await insertGift({ profileId: memberId, cents: 88800, at: localInstant("01-01 00:30", 1) });
  // Guest donor (no profile), email in mixed case, two gifts that group together.
  await insertGift({ donorName: GUEST_NAME, donorEmail: GUEST_EMAIL, cents: 5000, at: localInstant("03-01 09:00") });
  await insertGift({ donorName: GUEST_NAME, donorEmail: GUEST_EMAIL.toLowerCase(), cents: 2500, fund: null, at: localInstant("04-01 09:00") });
  // Opted-out member profile.
  await insertGift({ profileId: optedOutId, cents: 3000, at: localInstant("05-05 10:00") });
  // Guest whose email is suppressed.
  await insertGift({ donorName: SUPPRESSED_NAME, donorEmail: SUPPRESSED_EMAIL, cents: 2000, at: localInstant("07-07 10:00") });
  // No profile and no email, anonymous: un-statementable.
  await insertGift({ anonymous: true, cents: 1111, fund: "Building", at: localInstant("08-08 10:00") });

  const suppression = await queryTenantDb<{ id: string }>(
    "insert into public.communication_suppressions (church_id, channel, contact, reason) values ($1, 'email', $2, 'bounce') returning id",
    [SEED_CHURCH_ID, SUPPRESSED_EMAIL],
  );
  suppressionId = suppression.rows[0].id;
});

test.afterAll(async () => {
  if (insertedDonationIds.length) {
    await queryTenantDb("delete from public.donations where id = any($1::uuid[])", [insertedDonationIds]);
  }
  if (suppressionId) await queryTenantDb("delete from public.communication_suppressions where id = $1", [suppressionId]);
  if (optedOutPrefCreated) {
    await queryTenantDb("delete from public.notification_preferences where church_id = $1 and profile_id = $2", [
      SEED_CHURCH_ID,
      optedOutId,
    ]);
  }
  await queryTenantDb("delete from public.communication_logs where church_id = $1 and segment_criteria ? 'statementKey'", [
    SEED_CHURCH_ID,
  ]);
  // Audit rows this run wrote (statement audits, plus trigger rows for the rows above).
  await queryTenantDb(
    `delete from public.audit_log where church_id = $1 and changed_at >= $2 and (
       table_name = 'giving_statements'
       or (table_name = 'donations' and record_id = any($3::uuid[]))
       or (table_name in ('notification_preferences', 'communication_suppressions', 'communication_logs') and changed_at >= $2)
     )`,
    [SEED_CHURCH_ID, startedAt, insertedDonationIds],
  );
});

test.describe("church admin: statements journey", () => {
  test.use({ storageState: authFilePath("church-admin") });

  let pdfHref = "";
  let logsAfterFirstSend = 0;

  test("previews last year with reasons, excluding refunded and out-of-range gifts, and changes nothing", async ({ page }) => {
    const logsBefore = await statementLogCount();
    await page.goto("/app/church-admin/giving");
    await page.getByRole("tab", { name: "Statements" }).click();
    await page.getByRole("button", { name: "Preview" }).click();

    // Staff see NAMED gifts only: member 100 (their anonymous 50 at 11:30 pm Dec 31 is not attributed), guest 75,
    // opted out 30, suppressed 20 = 225. Anonymous gifts are one unattributed line: 50 + the 11.11 un-statementable.
    // Scoped to the Statements panel: the (hidden) Analytics tab also counts
    // donors over a rolling window, so a bare "4 donors" can match twice.
    const panel = page.getByRole("tabpanel", { name: "Statements" });
    await expect(panel.getByText(`${lastYear}-01-01 to ${lastYear}-12-31`)).toBeVisible();
    await expect(panel.getByText("4 donors", { exact: true })).toBeVisible();
    await expect(panel.getByText("Named gifts total $225.00; anonymous gifts $61.11 (2)")).toBeVisible();
    await expect(panel.getByText("2 will be emailed · 2 skipped")).toBeVisible();

    const table = page.getByRole("table", { name: "Statement recipients" });
    const member = table.getByRole("row", { name: new RegExp(memberName) });
    await expect(member).toContainText("$100.00"); // named gift only; refunded and next-year gifts are out
    await expect(member).not.toContainText("$150.00");
    await expect(member).not.toContainText("$50.00");
    await expect(member).toContainText("Will email");
    await expect(table.getByRole("row", { name: new RegExp(GUEST_NAME) })).toContainText("$75.00");
    await expect(table.getByRole("row", { name: new RegExp(GUEST_NAME) })).toContainText("Will email");
    await expect(table.getByRole("row", { name: new RegExp(optedOutName) })).toContainText("Opted out of email");
    await expect(table.getByRole("row", { name: new RegExp(optedOutName) })).toContainText("$30.00");
    await expect(table.getByRole("row", { name: new RegExp(SUPPRESSED_NAME) })).toContainText("Email suppressed");
    await expect(table.getByRole("row", { name: new RegExp(SUPPRESSED_NAME) })).toContainText("bounced");

    // The un-statementable gift is shown as Anonymous, with its date, amount and fund.
    const lost = page.getByRole("table", { name: "Un-statementable gifts" });
    await expect(lost.getByRole("row", { name: /\$11\.11/ })).toContainText("Anonymous");
    await expect(lost.getByRole("row", { name: /\$11\.11/ })).toContainText("Building");
    await expect(lost.getByRole("row", { name: /\$11\.11/ })).toContainText(`${lastYear}-08-08`);

    // No donor email is ever rendered to staff.
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain(GUEST_EMAIL.toLowerCase());
    expect(bodyText).not.toContain(SUPPRESSED_EMAIL);

    pdfHref = (await page.getByRole("link", { name: `Download PDF for ${GUEST_NAME}` }).getAttribute("href")) ?? "";
    expect(pdfHref).toContain("/api/giving/statements/pdf?donor=");
    expect(await statementLogCount()).toBe(logsBefore); // a preview sends and writes nothing
  });

  test("sends through the confirm modal, shows the summary, and a second send emails no one again", async ({ page }) => {
    await page.goto("/app/church-admin/giving");
    await page.getByRole("tab", { name: "Statements" }).click();
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("tabpanel", { name: "Statements" }).getByText("4 donors", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Send statements" }).click();
    const modal = page.getByRole("dialog", { name: "Email statements?" });
    await expect(modal).toContainText("2 donors will be emailed");
    await expect(modal).toContainText("2 will be skipped");
    await modal.getByRole("button", { name: "Confirm and send" }).click();
    await expect(page.getByText("Sent 2. Skipped 2 (no email 0, opted out 1, suppressed 1, already sent 0). Failed 0.")).toBeVisible();

    const { rows } = await queryTenantDb<{ status: string; error_code: string | null; body_preview: string }>(
      "select status, error_code, body_preview from public.communication_logs where church_id = $1 and segment_criteria ? 'statementKey' order by created_at",
      [SEED_CHURCH_ID],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("sent");
      expect(row.body_preview).not.toMatch(/\$|\d{2,}\.\d{2}/); // no amounts in the log
    }
    logsAfterFirstSend = await statementLogCount();

    // Second send: nothing new is emailed or logged.
    await page.getByRole("button", { name: "Send statements" }).click();
    await page.getByRole("dialog", { name: "Email statements?" }).getByRole("button", { name: "Confirm and send" }).click();
    await expect(page.getByText(/Sent 0\. Skipped 4 \(.*already sent 2\)\. Failed 0\./)).toBeVisible();
    expect(await statementLogCount()).toBe(logsAfterFirstSend);
  });

  test("downloads one donor's PDF through the API route, audited with a hashed guest ref", async ({ page }) => {
    expect(pdfHref).not.toBe("");
    const response = await page.request.get(pdfHref);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const text = pdfText(body);
    expect(text).toContain(GUEST_NAME);
    expect(text).toContain("$75.00");
    expect(text).toContain("Unassigned");

    // Staff get a donor's NAMED gifts only: the member's own anonymous $50.00 is not in the admin PDF.
    const memberPdf = await page.request.get(
      `/api/giving/statements/pdf?donor=${encodeURIComponent(`p:${memberId}`)}&start=${lastYear}-01-01&end=${lastYear}-12-31`,
    );
    expect(memberPdf.status()).toBe(200);
    const memberText = pdfText(await memberPdf.body());
    expect(memberText).toContain("$100.00");
    expect(memberText).not.toContain("$50.00");
    expect(memberText).not.toContain("$150.00");

    // A raw e: donor key is rejected.
    const rawKey = await page.request.get(
      `/api/giving/statements/pdf?donor=${encodeURIComponent(`e:${GUEST_EMAIL.toLowerCase()}`)}&start=${lastYear}-01-01&end=${lastYear}-12-31`,
    );
    expect(rawKey.status()).toBe(400);

    // A donor from the batch who wasn't emailed (opted out) can still be downloaded.
    const optedOut = await page.request.get(
      `/api/giving/statements/pdf?donor=${encodeURIComponent(`p:${optedOutId}`)}&start=${lastYear}-01-01&end=${lastYear}-12-31`,
    );
    expect(optedOut.status()).toBe(200);
    expect((await optedOut.body()).subarray(0, 4).toString("latin1")).toBe("%PDF");

    // An unknown donor and an invalid range generate nothing.
    const unknown = await page.request.get(
      `/api/giving/statements/pdf?donor=p:00000000-0000-0000-0000-000000000000&start=${lastYear}-01-01&end=${lastYear}-12-31`,
    );
    expect(unknown.status()).toBe(404);
    const badRange = await page.request.get(`/api/giving/statements/pdf?donor=p:${memberId}&start=${lastYear}-12-31&end=${lastYear}-01-01`);
    expect(badRange.status()).toBe(400);
  });

  test("audits the batch send and the PDF download without donor emails or amounts", async () => {
    const { rows } = await queryTenantDb<{ new_values: Record<string, unknown>; actor_id: string | null; church_id: string; actor_role: string | null }>(
      "select new_values, actor_id, church_id, actor_role from public.audit_log where table_name = 'giving_statements' and church_id = $1 and changed_at >= $2 order by changed_at",
      [SEED_CHURCH_ID, startedAt],
    );
    const batches = rows.filter((r) => r.new_values.action === "batch_send");
    expect(batches).toHaveLength(2); // the first send and the idempotent re-send
    expect(batches[0]).toMatchObject({ church_id: SEED_CHURCH_ID, actor_role: "church-admin" });
    expect(batches[0].actor_id).not.toBeNull();
    expect(batches[0].new_values).toMatchObject({
      start: `${lastYear}-01-01`,
      end: `${lastYear}-12-31`,
      sent: 2,
      failed: 0,
      skipped: { opted_out: 1, suppressed: 1, no_email: 0, already_sent: 0 },
    });

    const downloads = rows.filter((r) => r.new_values.action === "pdf_download");
    expect(downloads.length).toBeGreaterThanOrEqual(2);
    const guestDownload = downloads.find((r) => String(r.new_values.donorRef).startsWith("h:"));
    expect(guestDownload?.new_values).toMatchObject({ start: `${lastYear}-01-01`, end: `${lastYear}-12-31` });

    const serialized = JSON.stringify(rows.map((r) => r.new_values)).toLowerCase();
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain(GUEST_NAME.toLowerCase());
    expect(serialized).not.toMatch(/amount|cents/);
  });
});

test.describe("member: own statement", () => {
  test.use({ storageState: authFilePath("member") });

  test("sees the download on the giving page and gets only their own PDF, with their anonymous gift", async ({ page }) => {
    await page.goto("/app/member/giving");
    const link = page.getByRole("link", { name: "Download statement" });
    await expect(link).toHaveAttribute("href", `/api/member/giving-statement?year=${lastYear}`);

    const response = await page.request.get(`/api/member/giving-statement?year=${lastYear}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    const body = await response.body();
    expect(body.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const text = pdfText(body);
    expect(text).toContain("$150.00"); // 100 + the member's own anonymous 50; refunded 999 and next-year gifts are out
    expect(text).toContain("$50.00");
    expect(text).toContain("Missions");
    expect(text).not.toContain("$75.00"); // the guest's gifts
    expect(text).not.toContain("$30.00"); // another profile's gift
    expect(text).not.toContain("$999.00");

    // A donor parameter is ignored: still the member's own statement.
    const other = await page.request.get(`/api/member/giving-statement?year=${lastYear}&donor=p:${optedOutId}`);
    expect(other.status()).toBe(200);
    expect(pdfText(await other.body())).toContain("$150.00");

    // A year with no gifts is a 404 JSON, never an empty PDF; a bad year is a 400.
    const none = await page.request.get(`/api/member/giving-statement?year=${lastYear - 5}`);
    expect(none.status()).toBe(404);
    expect((await none.json()).error).toContain(String(lastYear - 5));
    expect((await page.request.get("/api/member/giving-statement?year=abc")).status()).toBe(400);
  });

  test("a member cannot reach the admin statement route", async ({ page }) => {
    const response = await page.request.get(`/api/giving/statements/pdf?donor=p:${memberId}&start=${lastYear}-01-01&end=${lastYear}-12-31`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  });
});
