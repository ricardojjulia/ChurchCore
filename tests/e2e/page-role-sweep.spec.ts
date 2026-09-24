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
  redirectsTo?: string;
  deniedRedirectsTo?: string;
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/coverage-manifest.json"), "utf8"),
) as { pages: Record<string, PageEntry> };

/** Pages that answer a denied role with an in-page message instead of a redirect. */
const INLINE_DENIAL: Record<string, string> = {
  "/app/church-admin/localization": "Access Denied",
};

/**
 * Known app bugs the sweep surfaces, as `${identity} ${path}` → reason. Each
 * pair still runs under test.fail(), so the day it's fixed the suite reports an
 * unexpected pass and the entry must be removed.
 */
const KNOWN_BUGS: Record<string, string> = {
  "secretary /hq":
    "app/hq/layout.tsx gates on current_user_role(), which reads profiles.role, while the rest of the " +
    "app uses church_memberships.role. The seeded secretary's profile role is member_volunteer, so " +
    "current_user_role() returns 'member' and /hq redirects her to /app. Two role sources disagree.",
  "secretary /app/communications/history/[logId]":
    "The page's gate admits secretary, but communication_logs RLS (communication_logs_select_management = " +
    "can_manage_church) excludes secretary, so the log renders as not found. Council Review 17 follow-up F7.",
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
 * - /sign-in for super-admin on a tenant page: its session belongs to the
 *   control-plane auth, so requireSession finds no tenant user;
 * - the page's documented `deniedRedirectsTo` when it sends denied roles
 *   somewhere specific and the visitor is allowed there (otherwise that page
 *   redirects them on to their homePath);
 * - otherwise the visitor's own homePath (redirect(session.homePath)).
 */
function expectedDeniedLanding(entry: PageEntry, visitor: Visitor): string {
  if (visitor === "signed-out") return "/sign-in";
  if (entry.controlPlane) return "/sign-in";
  if (visitor === "super-admin") return "/sign-in";
  if (entry.deniedRedirectsTo) {
    // The target may deny this visitor too, in which case its own gate sends
    // them on to their homePath; the final landing is what counts.
    const target = manifest.pages[entry.deniedRedirectsTo];
    if (target?.allowedRoles.includes(visitor)) return entry.deniedRedirectsTo;
  }
  return roles[visitor].homePath;
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
        if (KNOWN_BUGS[bugKey]) test.fail(true, KNOWN_BUGS[bugKey]);

        const consoleErrors = captureConsoleErrors(page);
        const response = await page.goto(url);
        const status = response?.status() ?? 0;
        expect(status, `document status for ${url}`).toBeLessThan(500);

        if (!allowed) {
          const inline = INLINE_DENIAL[entry.path];
          if (inline && visitor !== "signed-out" && !roles[visitor].controlPlane) {
            await expect(page.getByText(inline).first()).toBeVisible();
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
          if (entry.redirectsTo && visitor !== "signed-out") {
            expect(new URL(page.url()).pathname).toBe(entry.redirectsTo);
          }
          await expectNoErrorUi(page);
          return;
        }

        if (missingRecord) {
          // No seed rows exist for this record type: a nonexistent id must
          // produce a clean not-found, never a server error (status < 500 is
          // asserted above).
          await page.waitForLoadState("networkidle");
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

// Guard against a silently shrinking sweep: every identity in roles.ts must
// have a storageState produced by the setup project.
test("every identity has a role fixture", () => {
  for (const id of identityIds) expect(roles[id].homePath).toMatch(/^\//);
});
