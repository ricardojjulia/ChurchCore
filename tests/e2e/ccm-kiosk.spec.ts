/**
 * Family self check-in kiosk (G2.2) at tablet sizes: 1024x768 and 768x1024.
 *
 * A church admin starts kiosk mode; a family finds their children by phone,
 * family code or QR, checks in and gets a pickup PIN; inactivity returns to the
 * start screen; leaving needs the exit PIN the admin chose at start. Uses the seeded
 * Rivera Household (code HK7M2QX9, phone (555) 019-9): Ana (8, listed), Leo
 * (20, not listed), Zoe (no birth date, not listed), Mateo (6, custody
 * restriction, "see a greeter").
 *
 * Serial on purpose: both viewports check in the same child, and the
 * rate-limit test must not race another test's lookups. Each test starts its
 * own kiosk session (its own device), and every test removes the kiosk
 * check-ins, kiosk sessions and lookup attempts it created, so reruns pass.
 * Idle time is driven by page.clock, because the e2e server is a production
 * build and KIOSK_IDLE_MS_OVERRIDE is ignored in production.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, expect, test, type Page } from "@playwright/test";
import QRCode from "qrcode";

import { queryTenantDb } from "./fixtures/api";
import { getAppUrl, requireEnv } from "./fixtures/env";
import {
  collectPrimaryViolations,
  collectTouchViolations,
  expectNoHorizontalOverflow,
} from "./fixtures/mobile-layout";
import { authFilePath, roles, SEED_CHURCH_ID, signInThroughUi } from "./fixtures/roles";

const ANA_ID = "d0d0d0d0-0000-0000-0000-000000000012";
const RIVERA_CHILD_IDS = ["d0d0d0d0-0000-0000-0000-000000000012", "d0d0d0d0-0000-0000-0000-000000000013", "d0d0d0d0-0000-0000-0000-000000000014", "d0d0d0d0-0000-0000-0000-000000000015"];
const FAMILY_CODE = "HK7M2QX9";
const PHONE = "(555) 019-9";
const EXIT_PIN = "482913";
const SIZES = [
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
] as const;

async function cleanUp() {
  // Belt and braces: no check-in of any source may leave the Rivera children checked in.
  await queryTenantDb(`delete from public.ccm_checkin_sessions where church_id = $1 and child_profile_id = any ($2::uuid[])`, [SEED_CHURCH_ID, RIVERA_CHILD_IDS]);
  await queryTenantDb(`delete from public.ccm_checkin_sessions where church_id = $1 and checkin_source = 'kiosk'`, [SEED_CHURCH_ID]);
  await queryTenantDb(`delete from public.ccm_kiosk_lookup_attempts where church_id = $1`, [SEED_CHURCH_ID]);
  await queryTenantDb(`delete from public.ccm_kiosk_sessions where church_id = $1`, [SEED_CHURCH_ID]);
}

async function startKiosk(page: Page, note = "e2e tablet", pin = EXIT_PIN) {
  await page.goto("/app/church-admin/children/kiosk");
  // The app shell renders its children in two responsive containers; use the visible one.
  await page.getByLabel(/Device name|Nombre del dispositivo/).locator("visible=true").fill(note);
  await page.getByLabel(/Exit PIN \(6|PIN de salida \(6/).locator("visible=true").fill(pin);
  await page.getByLabel(/Repeat the exit PIN|Repite el PIN/).locator("visible=true").fill(pin);
  await page.locator("[data-primary-action]:visible").first().click();
  await page.waitForURL((url) => url.pathname === "/kiosk/children");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function lookupPhone(page: Page, phone = PHONE) {
  await page.getByRole("button", { name: "Use my phone number" }).click();
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Find my children" }).click();
}

async function lookupCode(page: Page, code = FAMILY_CODE) {
  await page.getByRole("button", { name: "Use my family code" }).click();
  await page.getByLabel("Family code").fill(code);
  await page.getByRole("button", { name: "Find my children" }).click();
}

async function expectLayout(page: Page, root?: ReturnType<Page["locator"]>) {
  await expectNoHorizontalOverflow(page);
  expect(await collectTouchViolations(page, root), "controls under 44px").toEqual([]);
  expect(await collectPrimaryViolations(page, root), "primary actions under 64px").toEqual([]);
}

async function chooseAnaAndCheckInOn(page: Page) {
  await chooseAnaAndCheckIn(page);
}

async function chooseAnaAndCheckIn(page: Page) {
  await page.getByRole("button", { name: /Ana R\./ }).click();
  await page.getByRole("group", { name: "Choose a room" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Check in 1" }).click();
  await expect(page.getByRole("heading", { name: "You're checked in!" })).toBeVisible();
}

/** A one-frame y4m of a QR code, for Chromium's fake camera. */
function writeQrVideo(text: string): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const w = 640;
  const h = 480;
  const margin = 4;
  const scale = Math.floor(Math.min(w, h) / (qr.modules.size + margin * 2));
  const side = (qr.modules.size + margin * 2) * scale;
  const x0 = Math.floor((w - side) / 2);
  const y0 = Math.floor((h - side) / 2);
  const luma = Buffer.alloc(w * h, 235);
  for (let y = 0; y < qr.modules.size; y++) {
    for (let x = 0; x < qr.modules.size; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          luma[(y0 + (y + margin) * scale + dy) * w + x0 + (x + margin) * scale + dx] = 16;
        }
      }
    }
  }
  const chroma = Buffer.alloc((w / 2) * (h / 2), 128);
  const header = Buffer.from(`YUV4MPEG2 W${w} H${h} F30:1 Ip A1:1 C420jpeg\nFRAME\n`);
  const dir = mkdtempSync(join(tmpdir(), "kiosk-qr-"));
  const file = join(dir, "qr.y4m");
  writeFileSync(file, Buffer.concat([header, luma, chroma, chroma]));
  return file;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(cleanUp);
test.afterEach(cleanUp);
test.afterAll(cleanUp);

for (const size of SIZES) {
  test.describe(`Kiosk at ${size.name}`, () => {
    test.use({ storageState: authFilePath("church-admin"), viewport: { width: size.width, height: size.height } });

    test("start page and start screen: tablet targets, no overflow, focus on the heading", async ({ page }) => {
      await page.goto("/app/church-admin/children/kiosk");
      await expect(page.getByRole("button", { name: "Start kiosk mode" }).locator("visible=true")).toBeVisible();
      // Staff page: 44px targets and no overflow (the 64px rule is for the kiosk screens).
      await expectNoHorizontalOverflow(page);
      expect(await collectTouchViolations(page), "start page controls under 44px").toEqual([]);
      await startKiosk(page);
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeFocused();
      await expectLayout(page);
      const rows = await queryTenantDb(`select device_note, ended_at from public.ccm_kiosk_sessions where church_id = $1`, [SEED_CHURCH_ID]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].device_note).toBe("e2e tablet");
    });

    test("phone lookup shows first name and last initial only; custody child sees a greeter", async ({ page }) => {
      await startKiosk(page);
      await lookupPhone(page);
      await expect(page.getByRole("heading", { name: "Who is checking in?" })).toBeFocused();
      await expect(page.getByRole("button", { name: /Ana R\./ })).toBeEnabled();
      const mateo = page.getByRole("button", { name: /Mateo R\./ });
      await expect(mateo).toBeDisabled();
      await expect(mateo).toContainText("Please see a greeter");
      await expect(page.getByText("Leo")).toHaveCount(0);
      await expect(page.getByText("Zoe")).toHaveCount(0);
      await expect(page.getByText("Rivera")).toHaveCount(0);
      await expect(page.getByText("Marta")).toHaveCount(0);
      await page.getByRole("button", { name: /Ana R\./ }).click();
      await page.getByRole("group", { name: "Choose a room" }).getByRole("button").first().click();
      await expectLayout(page);
    });

    test("code lookup (typed lower-case with a dash) finds the household", async ({ page }) => {
      await startKiosk(page);
      await lookupCode(page, "hk7m-2qx9");
      await expect(page.getByRole("button", { name: /Ana R\./ })).toBeVisible();
    });

    test("check in: PIN shown once, recorded as a kiosk check-in, then marked already checked in", async ({ page }) => {
      await startKiosk(page);
      await lookupPhone(page);
      await chooseAnaAndCheckIn(page);
      await expect(page.getByText(/^Pickup code for Ana R\.$/)).toBeVisible();
      await expectLayout(page);

      const rows = await queryTenantDb<{ checkin_source: string; status: string }>(
        `select checkin_source, status from public.ccm_checkin_sessions where church_id = $1 and child_profile_id = $2`,
        [SEED_CHURCH_ID, ANA_ID],
      );
      expect(rows.rows).toEqual([{ checkin_source: "kiosk", status: "checked_in" }]);

      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
      await lookupCode(page);
      const ana = page.getByRole("button", { name: /Ana R\./ });
      await expect(ana).toBeDisabled();
      await expect(ana).toContainText("Already checked in");
      const after = await queryTenantDb(`select 1 from public.ccm_checkin_sessions where church_id = $1 and child_profile_id = $2`, [SEED_CHURCH_ID, ANA_ID]);
      expect(after.rows).toHaveLength(1);
    });

    test("no match gets the neutral message", async ({ page }) => {
      await startKiosk(page);
      await lookupPhone(page, "(555) 000-1234");
      await expect(page.locator("main").getByRole("alert")).toHaveText("We couldn't find that. Please see a greeter.");
    });

    test("five failed lookups pause this kiosk, with a clear message", async ({ page }) => {
      await startKiosk(page);
      await page.getByRole("button", { name: "Use my phone number" }).click();
      let paused = false;
      for (let i = 0; i < 7 && !paused; i++) {
        await page.getByLabel("Phone number").fill(`555000${1000 + i}`);
        await page.getByRole("button", { name: "Find my children" }).click();
        const alert = page.locator("main").getByRole("alert");
        await expect(alert).toBeVisible();
        paused = /Please wait/.test((await alert.textContent()) ?? "");
      }
      expect(paused, "a pause message appeared within 7 tries").toBe(true);
      await expect(page.locator("main").getByRole("alert")).toContainText("or see a greeter");
    });

    test("idle: the start screen returns, family data is gone, and the admin stays signed in", async ({ page }) => {
      await startKiosk(page);
      await page.clock.install();
      await page.reload();
      await lookupPhone(page);
      await page.getByRole("button", { name: /Ana R\./ }).click();

      await page.clock.fastForward(55_000);
      await expect(page.getByText(/This screen will clear in/)).toBeVisible();
      await page.clock.fastForward(8_000);
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
      await expect(page.getByText("Ana R.")).toHaveCount(0);
      // Still the admin's kiosk, not signed out and not locked.
      await expect(page.getByRole("heading", { name: "Kiosk needs a staff sign-in" })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
    });

    test("idle warning: I'm still here keeps the screen", async ({ page }) => {
      await startKiosk(page);
      await page.clock.install();
      await page.reload();
      await lookupPhone(page);
      await page.clock.fastForward(55_000);
      const stay = page.getByRole("button", { name: "I'm still here" });
      await expect(stay).toBeVisible();
      expect(await collectPrimaryViolations(page, page.getByRole("dialog", { name: "Are you still there?" }))).toEqual([]);
      await stay.click();
      await page.clock.fastForward(20_000);
      await expect(page.getByRole("heading", { name: "Who is checking in?" })).toBeVisible();
    });

    test("exit: wrong PIN refused, right PIN leaves; the dialog meets tablet targets", async ({ page }) => {
      await startKiosk(page);
      await page.getByRole("button", { name: "Exit kiosk" }).click();
      const dialog = page.getByRole("dialog", { name: "Leave kiosk mode" });
      await expect(dialog).toBeVisible();
      expect(await collectTouchViolations(page, dialog), "dialog controls under 44px").toEqual([]);
      expect(await collectPrimaryViolations(page, dialog), "dialog primary under 64px").toEqual([]);
      // Digits only, six at most.
      await dialog.getByLabel("Exit PIN").pressSequentially("12ab34567890");
      await expect(dialog.getByLabel("Exit PIN")).toHaveValue("123456");
      await dialog.getByRole("button", { name: "Leave kiosk mode" }).click();
      await expect(dialog.getByText("That PIN was not right.")).toBeVisible();
      await expect(dialog.getByLabel("Exit PIN")).toHaveValue("");
      await expect(page).toHaveURL(/\/kiosk\/children$/);

      await dialog.getByLabel("Exit PIN").fill(EXIT_PIN);
      await dialog.getByRole("button", { name: "Leave kiosk mode" }).click();
      await page.waitForURL((url) => url.pathname.startsWith("/app/church-admin"));
      const rows = await queryTenantDb<{ ended: boolean }>(`select ended_at is not null as ended from public.ccm_kiosk_sessions where church_id = $1`, [SEED_CHURCH_ID]);
      expect(rows.rows).toEqual([{ ended: true }]);
      // The admin is still signed in and no longer locked to the kiosk.
      await page.goto("/app/church-admin");
      await expect(page).toHaveURL(/\/app\/church-admin$/);
    });

    test("an exit dialog left open on the start screen times out and clears the PIN", async ({ page }) => {
      await startKiosk(page);
      await page.clock.install();
      await page.reload();
      await page.getByRole("button", { name: "Exit kiosk" }).click();
      const dialog = page.getByRole("dialog", { name: "Leave kiosk mode" });
      await dialog.getByLabel("Exit PIN").fill("123");
      await page.clock.fastForward(61_000);
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "Exit kiosk" }).click();
      await expect(page.getByRole("dialog", { name: "Leave kiosk mode" }).getByLabel("Exit PIN")).toHaveValue("");
    });

    test("the PIN screen returns to the start screen by itself after 20 seconds", async ({ page }) => {
      await startKiosk(page);
      await page.clock.install();
      await page.reload();
      await lookupPhone(page);
      await chooseAnaAndCheckIn(page);
      await expect(page.getByTestId("kiosk-auto-return")).toContainText("seconds");
      await page.clock.fastForward(21_000);
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
      await expect(page.getByTestId("kiosk-pin")).toHaveCount(0);
    });

    test("a second tablet lookup spends the first one's token: the stale check-in goes back to start", async ({ page, context }) => {
      await startKiosk(page);
      await lookupPhone(page);
      await expect(page.getByRole("heading", { name: "Who is checking in?" })).toBeVisible();
      const other = await context.newPage();
      await other.goto("/kiosk/children");
      await lookupCode(other);
      await expect(other.getByRole("heading", { name: "Who is checking in?" })).toBeVisible();
      // The first page's household token was replaced by the second lookup.
      await page.getByRole("button", { name: /Ana R\./ }).click();
      await page.getByRole("group", { name: "Choose a room" }).getByRole("button").first().click();
      await page.getByRole("button", { name: "Check in 1" }).click();
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
      const none = await queryTenantDb(`select 1 from public.ccm_checkin_sessions where child_profile_id = $1`, [ANA_ID]);
      expect(none.rows).toHaveLength(0);
      // The second page's token is still good.
      await chooseAnaAndCheckInOn(other);
    });

    test("the language picker on the start screen switches the kiosk to Spanish", async ({ page }) => {
      await startKiosk(page);
      await page.getByRole("combobox", { name: "Language" }).click();
      await page.getByRole("option", { name: "Español", exact: true }).click();
      await expect(page.getByRole("heading", { name: /Bienvenido/ })).toBeVisible();
      await expectLayout(page);
    });

    test("while kiosk mode is on, app pages return to the kiosk", async ({ page }) => {
      await startKiosk(page);
      await page.goto("/app/church-admin");
      await expect(page).toHaveURL(/\/kiosk\/children$/);
      await page.goto("/app/church-admin/children/checkin");
      await expect(page).toHaveURL(/\/kiosk\/children$/);
      // The admin's data routes are closed too, not only the pages.
      await page.goto("/api/reports/custom?entity=people");
      await expect(page).toHaveURL(/\/kiosk\/children$/);
    });

    test("a dead kiosk cookie shows the locked screen and traps app pages (release is tested signed-out below)", async ({ page, context }) => {
      await context.addCookies([{ name: "cc_kiosk", value: randomUUID(), url: getAppUrl(), httpOnly: true, sameSite: "Strict" }]);
      await page.goto("/kiosk/children");
      await expect(page.getByRole("heading", { name: "Kiosk needs a staff sign-in" })).toBeVisible();
      await expect(page.getByText("Ana")).toHaveCount(0);
      await expectLayout(page);
      // Trapped: app pages come back here.
      await page.goto("/app/church-admin");
      await expect(page).toHaveURL(/\/kiosk\/children$/);

      await expect(page.getByRole("button", { name: "Release this device" })).toBeVisible();
    });

    test("camera unavailable: the family is told and can type the code", async ({ page }) => {
      await startKiosk(page);
      await page.getByRole("button", { name: "Scan my family QR code" }).click();
      await expect(page.getByText("We can't use the camera. Please type your family code instead.")).toBeVisible();
      await expectLayout(page);
      await page.getByRole("button", { name: "Type my code instead" }).click();
      await page.getByLabel("Family code").fill(FAMILY_CODE);
      await page.getByRole("button", { name: "Find my children" }).click();
      await expect(page.getByRole("button", { name: /Ana R\./ })).toBeVisible();
    });

    test("QR scan with a fake camera finds the household", async () => {
      const video = writeQrVideo(FAMILY_CODE);
      const browser = await chromium.launch({
        args: [
          "--use-fake-device-for-media-stream",
          "--use-fake-ui-for-media-stream",
          `--use-file-for-fake-video-capture=${video}`,
        ],
      });
      try {
        const context = await browser.newContext({
          baseURL: getAppUrl(),
          storageState: authFilePath("church-admin"),
          viewport: { width: size.width, height: size.height },
          permissions: ["camera"],
        });
        const page = await context.newPage();
        await startKiosk(page);
        await page.getByRole("button", { name: "Scan my family QR code" }).click();
        await expect(page.getByRole("button", { name: /Ana R\./ })).toBeVisible({ timeout: 20_000 });
        await context.close();
      } finally {
        await browser.close();
      }
    });
  });
}

test.describe("Kiosk in Spanish at 1024x768", () => {
  test.use({ storageState: authFilePath("church-admin"), viewport: { width: 1024, height: 768 } });

  test("Spanish copy keeps the targets and the layout", async ({ page, context }) => {
    await context.addCookies([{ name: "churchcore_ops_locale", value: "es", url: getAppUrl() }]);
    await startKiosk(page);
    await expect(page.getByRole("heading", { name: /Bienvenido/ })).toBeVisible();
    await expectLayout(page);
    await page.getByRole("button", { name: "Usar mi número de teléfono" }).click();
    await page.getByLabel("Número de teléfono").fill(PHONE);
    await page.getByRole("button", { name: "Buscar a mis hijos" }).click();
    await expect(page.getByRole("heading", { name: "¿Quién se registra?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mateo R\./ })).toContainText("Habla con un anfitrión");
    await expectLayout(page);
  });
});

// Releasing signs the admin out of the server session, which in Supabase revokes
// the login's other refresh tokens too. So it runs last, on its own fresh sign-in,
// and then refreshes the shared church-admin storage state for anything after it.
test.describe("Kiosk release and expiry sign the device out", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  async function freshAdmin(page: Page) {
    await signInThroughUi(page, {
      email: requireEnv(roles["church-admin"].emailEnvVar),
      password: requireEnv("CHURCHCORE_OPS_DEV_PASSWORD"),
      redirectTo: roles["church-admin"].homePath,
    });
  }

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await freshAdmin(page);
    await context.storageState({ path: authFilePath("church-admin") });
    await context.close();
  });

  test("an expired kiosk (started over 16 hours ago) shows the locked screen; Release signs out and /app asks for sign-in", async ({ page, context }) => {
    await freshAdmin(page);
    await startKiosk(page);
    await queryTenantDb(`update public.ccm_kiosk_sessions set started_at = now() - interval '17 hours' where church_id = $1`, [SEED_CHURCH_ID]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Kiosk needs a staff sign-in" })).toBeVisible();
    await expect(page.getByText("Ana")).toHaveCount(0);

    await page.getByRole("button", { name: "Release this device" }).click();
    await page.waitForURL((url) => url.pathname === "/sign-in");
    expect((await context.cookies()).filter((c) => c.name === "cc_kiosk")).toHaveLength(0);

    // Signed out for real: the admin app asks for a sign-in, it does not open.
    await page.goto("/app/church-admin");
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto("/app/church-admin/people");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("Release on a stuck device (forged cookie) lands on sign-in with the admin signed out", async ({ page, context }) => {
    await freshAdmin(page);
    await context.addCookies([{ name: "cc_kiosk", value: randomUUID(), url: getAppUrl(), httpOnly: true, sameSite: "Strict" }]);
    await page.goto("/kiosk/children");
    await page.getByRole("button", { name: "Release this device" }).click();
    await page.waitForURL((url) => url.pathname === "/sign-in");
    await page.goto("/app/church-admin");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
