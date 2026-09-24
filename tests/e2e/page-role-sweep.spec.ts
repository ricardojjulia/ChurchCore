/**
 * Page × role sweep (Story A, AC5/AC6), driven entirely by
 * tests/coverage-manifest.json. Every page is visited by every identity plus a
 * signed-out visitor, and the outcome is checked against the manifest's
 * allowedRoles / public / controlPlane / sweepMode fields.
 *
 * - Allowed + render: stays on the URL, document is not 5xx, no error UI, no
 *   console errors outside fixtures/console-allowlist.ts.
 * - Allowed + redirect: leaves the URL cleanly (no 5xx, no error UI).
 * - Denied: redirected away (never a 5xx), except pages listed in
 *   INLINE_DENIAL, which render an in-page "Access Denied" state.
 * - Signed out: protected pages land on /sign-in; public pages render.
 * - Dynamic pages whose backing table has no seed rows (dynamicParams null)
 *   are visited with a nonexistent id: allowed roles must get a clean
 *   not-found, never a crash. (Segments with a loading.tsx stream their
 *   response, so notFound() renders with a 200 status; the check is "no 5xx,
 *   no error UI", not "status 404".)
 * - The church-admin identity is the same person as super-admin (a real
 *   platform admin), so it is not asserted denied on /control pages; tenant-role
 *   denial there is covered by secretary, pastor, ministry-leader and member.
 *
 * A seeded id that disappears makes its allowed-role check fail (render
 * checks assert Next's not-found UI is absent), so dynamic fixtures can't rot
 * silently.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { isAllowlisted } from "./fixtures/console-allowlist";
import { getTenantDbUrl } from "./fixtures/env";
import { authFilePath, identityIds, roles, type IdentityId } from "./fixtures/roles";

type SweepMode = "render" | "redirect" | "invalid-token";

interface PageEntry {
  path: string;
  allowedRoles: IdentityId[];
  public?: boolean;
  controlPlane?: boolean;
  dynamicParams?: Record<string, string> | null;
  sweepMode?: SweepMode;
  /** Where an allowed identity ends up; "$homePath" means its own homePath. */
  redirectsTo?: string;
  /** Per-identity override of redirectsTo. */
  redirectsToByRole?: Partial<Record<IdentityId, string>>;
  deniedRedirectsTo?: string;
  /** Where a nonexistent-record visit lands when the page redirects instead of rendering not-found. */
  missingRecordRedirectsTo?: string;
  /** Text an invalid-token page must show. */
  expectText?: string;
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/coverage-manifest.json"), "utf8"),
) as { pages: Record<string, PageEntry> };

/**
 * Pages that answer a denied role with an in-page message instead of a
 * redirect: the message must show and the page's own content must not.
 */
const INLINE_DENIAL: Record<string, { message: string; absentHeading: string }> = {
  "/app/church-admin/localization": { message: "Access Denied", absentHeading: "Localization" },
};

/**
 * Known app bugs, keyed `${identity} ${path}`. Instead of a blanket test.fail
 * (which would stay green on any failure, a new 5xx included), each pins the
 * bug's exact current symptom. When the bug is fixed the symptom disappears,
 * the test fails, and the entry must be removed.
 */
const KNOWN_BUGS: Record<string, { reason: string; landing?: string; text?: string }> = {
  "secretary /hq": {
    reason:
      "app/hq/layout.tsx gates on current_user_role(), which reads profiles.role, while the rest of the app uses " +
      "church_memberships.role. The local secretary's profile role is member_volunteer (seed.sql sets 'secretary'; " +
      "the cause of that drift is a Council Review 18 follow-up), so /hq sends her to /app and on to her homePath.",
    landing: "/app/secretary",
  },
  "secretary /app/communications/history/[logId]": {
    reason:
      "The page's gate admits secretary, but communication_logs RLS (can_manage_church) excludes her, so the log " +
      "renders as not found. Council Review 17 F7 / Review 18 follow-up 1.",
    text: "This page could not be found",
  },
};

const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const INVALID_TOKEN = "e2e-invalid-token";

type Visitor = IdentityId | "signed-out";
const visitors: Visitor[] = [...identityIds, "signed-out"];

const sqlParamCache = new Map<string, string>();

/**
 * Resolves a `$sql:` dynamicParams value against the local tenant DB, for seed
 * rows whose ids are random on every seed. Runs at collection time with psql
 * (the env guard has already confirmed the DB is local). A query that returns
 * nothing throws, so a vanished fixture fails the run loudly.
 */
function resolveSqlParam(pagePath: string, sql: string): string {
  const cached = sqlParamCache.get(sql);
  if (cached) return cached;
  const value = execFileSync("psql", [getTenantDbUrl(), "-Atc", sql], { encoding: "utf8" }).trim();
  if (!value) {
    throw new Error(`Seed query for ${pagePath} returned no row: ${sql}`);
  }
  sqlParamCache.set(sql, value);
  return value;
}

function resolvePath(entry: PageEntry, visitor: Visitor): { url: string; missingRecord: boolean } {
  let missingRecord = false;
  const url = entry.path.replace(/\[([^\]]+)\]/g, (_, param: string) => {
    const value = entry.dynamicParams?.[param];
    if (value === "$identity") {
      // /app/[role]: each identity visits its own role segment.
      return visitor === "signed-out" || visitor === "super-admin" ? "member" : visitor;
    }
    if (value?.startsWith("$sql:")) return resolveSqlParam(entry.path, value.slice("$sql:".length));
    if (value) return value;
    if (entry.sweepMode === "invalid-token") return INVALID_TOKEN;
    missingRecord = true;
    return MISSING_ID;
  });
  return { url, missingRecord };
}

function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isAllowlisted(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (!isAllowlisted(err.message)) errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

async function expectNoErrorUi(page: Page) {
  // PageErrorBoundary (components/application/page-error-boundary.tsx) and
  // app/global-error.tsx (Next's generic error page).
  await expect(page.getByText("Something went wrong", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
}

async function waitToLeave(page: Page, requestedPath: string) {
  // Redirects thrown from Server Components can arrive as a streamed
  // NEXT_REDIRECT applied on hydration, after the load event — wait for the
  // URL to change instead of reading page.url() right after goto().
  await page.waitForURL((url) => url.pathname !== requestedPath, { timeout: 15_000 });
}

/**
 * Where a denied visitor must end up:
 * - /sign-in when signed out;
 * - /sign-in (?force=1) for a tenant role on a control-plane page, since
 *   requireControlPlaneSession offers an account switch;
 * - /control for super-admin on a tenant page (requireChurchSession sends a
 *   control-context session to its homePath). This only shows once the two
 *   local stacks have distinct auth cookie names, as hosted projects do;
 *   sharing one name made it look like /sign-in;
 * - the page's documented `deniedRedirectsTo` when it sends denied roles
 *   somewhere specific and the visitor is allowed there (otherwise that page
 *   redirects them on to their homePath);
 * - otherwise the visitor's own homePath (redirect(session.homePath)).
 */
function expectedDeniedLanding(entry: PageEntry, visitor: Visitor): string {
  if (visitor === "signed-out") return "/sign-in";
  if (entry.controlPlane) return "/sign-in";
  if (visitor === "super-admin") return roles[visitor].homePath;
  if (entry.deniedRedirectsTo) {
    // The target may deny this visitor too, in which case its own gate sends
    // them on to their homePath; the final landing is what counts.
    const target = manifest.pages[entry.deniedRedirectsTo];
    if (target?.allowedRoles.includes(visitor)) return entry.deniedRedirectsTo;
  }
  return roles[visitor].homePath;
}

/**
 * Where an allowed visitor of a redirect-only page must end up. Signed-out
 * visitors of the public redirect-only pages land on /sign-in, because every
 * destination is gated.
 */
function expectedRedirectLanding(entry: PageEntry, visitor: Visitor): string | null {
  if (visitor === "signed-out") return "/sign-in";
  const target = entry.redirectsToByRole?.[visitor] ?? entry.redirectsTo;
  if (!target) return null;
  return target === "$homePath" ? roles[visitor].homePath : target;
}

function isAllowed(entry: PageEntry, visitor: Visitor): boolean {
  if (visitor === "signed-out") return Boolean(entry.public);
  return entry.allowedRoles.includes(visitor);
}

for (const visitor of visitors) {
  test.describe(`as ${visitor}`, () => {
    if (visitor !== "signed-out") {
      test.use({ storageState: authFilePath(visitor) });
    }

    for (const entry of Object.values(manifest.pages)) {
      // Public pages are checked signed out; signed-in visitors of public
      // pages are only redirected onward by design and add no signal.
      if (entry.public && visitor !== "signed-out") continue;
      if (entry.controlPlane && visitor === "church-admin") continue;

      const { url, missingRecord } = resolvePath(entry, visitor);
      const requestedPath = url.split("?")[0];
      const allowed = isAllowed(entry, visitor);
      const mode: SweepMode = entry.sweepMode ?? "render";
      const bugKey = `${visitor} ${entry.path}`;

      test(`${entry.path} → ${allowed ? mode : "denied"}`, async ({ page }) => {
        const consoleErrors = captureConsoleErrors(page);
        const response = await page.goto(url);
        const status = response?.status() ?? 0;
        expect(status, `document status for ${url}`).toBeLessThan(500);

        const knownBug = KNOWN_BUGS[bugKey];
        if (knownBug) {
          test.info().annotations.push({ type: "known bug", description: knownBug.reason });
          await page.waitForLoadState("networkidle");
          if (knownBug.landing) expect(new URL(page.url()).pathname).toBe(knownBug.landing);
          if (knownBug.text) await expect(page.getByText(knownBug.text, { exact: false }).first()).toBeVisible();
          return;
        }

        if (!allowed) {
          const inline = INLINE_DENIAL[entry.path];
          if (inline && visitor !== "signed-out" && !roles[visitor].controlPlane) {
            await expect(page.getByText(inline.message).first()).toBeVisible();
            await expect(page.getByRole("heading", { name: inline.absentHeading, exact: true })).toHaveCount(0);
            return;
          }
          await waitToLeave(page, requestedPath);
          // Assert exactly where a denied visitor lands, so a gate that
          // redirects to the wrong (possibly protected) page can't pass.
          await expect
            .poll(() => new URL(page.url()).pathname, { message: `denied landing for ${visitor} on ${url}` })
            .toBe(expectedDeniedLanding(entry, visitor));
          await expectNoErrorUi(page);
          return;
        }

        if (mode === "redirect") {
          await waitToLeave(page, requestedPath);
          const expected = expectedRedirectLanding(entry, visitor);
          if (expected) {
            await expect
              .poll(() => new URL(page.url()).pathname, { message: `redirect landing for ${visitor} on ${url}` })
              .toBe(expected);
          }
          await expectNoErrorUi(page);
          return;
        }

        if (mode === "invalid-token") {
          await page.waitForLoadState("networkidle");
          expect(new URL(page.url()).pathname, `stayed on ${requestedPath}`).toBe(requestedPath);
          if (entry.expectText) await expect(page.getByText(entry.expectText).first()).toBeVisible();
          await expectNoErrorUi(page);
          expect(consoleErrors, `console errors on ${url} as ${visitor}`).toEqual([]);
          return;
        }

        if (missingRecord) {
          // No seed rows exist for this record type: a nonexistent id must
          // produce a clean not-found, never a server error (status < 500 is
          // asserted above).
          await page.waitForLoadState("networkidle");
          // The allowed role must still be on the page (seeing its not-found
          // state) or on its documented fallback, not bounced by its gate.
          const landed = new URL(page.url()).pathname;
          expect([requestedPath, entry.missingRecordRedirectsTo].filter(Boolean), `landing for ${url}`).toContain(landed);
          await expectNoErrorUi(page);
          expect(consoleErrors, `console errors on ${url} as ${visitor}`).toEqual([]);
          return;
        }

        await page.waitForLoadState("networkidle");
        expect(new URL(page.url()).pathname, `stayed on ${requestedPath}`).toBe(requestedPath);
        expect(status, `document status for ${url}`).toBeLessThan(400);
        await expectNoErrorUi(page);
        // A seeded dynamic id that no longer exists renders Next's not-found
        // UI (with a 200 when the segment streams) — fail loudly on that.
        await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
        expect(consoleErrors, `console errors on ${url} as ${visitor}`).toEqual([]);
      });
    }
  });
}

// /app/[role] only serves the caller's own role: each church identity visiting
// another role's workspace is sent back to its own homePath.
test.describe("cross-role /app/[role]", () => {
  const churchIdentities = identityIds.filter((id) => !roles[id].controlPlane);
  for (const [index, identity] of churchIdentities.entries()) {
    const otherRole = churchIdentities[(index + 1) % churchIdentities.length];
    test.describe(`as ${identity}`, () => {
      test.use({ storageState: authFilePath(identity) });
      test(`/app/${otherRole} → own homePath`, async ({ page }) => {
        const response = await page.goto(`/app/${otherRole}`);
        expect(response?.status() ?? 0).toBeLessThan(500);
        await expect.poll(() => new URL(page.url()).pathname).toBe(roles[identity].homePath);
        await expectNoErrorUi(page);
      });
    });
  }
});
