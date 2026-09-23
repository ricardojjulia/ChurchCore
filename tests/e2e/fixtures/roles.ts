/**
 * Per-identity fixtures for the Playwright suite: the 5 demo users, plus a
 * second identity (`church-admin`) for sarah@churchcoreops.app, who is both
 * a control-plane platform admin AND a real `church_memberships` row at
 * Grace Harbor (see supabase/seed.sql, `church_admin` role) — Story A brief
 * AC1.
 *
 * Deliberately does not import `lib/auth.ts` (Playwright specs stay outside
 * the app's module graph) — `appContextCookieName` and the
 * `StoredAppContextSelection` shape below are a verified-by-reading copy of
 * `lib/auth.ts`'s `appContextCookieName` / `writeAppContextSelection`.
 *
 * Context-resolution mechanism (see lib/auth.ts `resolveAppContext`):
 *   - secretary/pastor/ministry-leader/member each have exactly one real
 *     `church_memberships` row for their own role, so signing in with no
 *     stored app-context selection already resolves to their homePath —
 *     no cookie needed.
 *   - super-admin (sarah) is a platform admin with NO stored selection ->
 *     resolveAppContext defaults platform admins to control context ->
 *     already lands on /control — no cookie needed either.
 *   - church-admin (sarah, in her *church* role) needs an explicit stored
 *     selection, because her default resolution is control (above). The
 *     app's only in-product path to that is `launchTenantViewAction`
 *     (app/control/actions.ts), a control-plane "view tenant" flow gated
 *     behind extra tenant-connection-status/audit-log plumbing that's
 *     awkward to drive from a test and irrelevant to what we're testing
 *     here. Instead this sets the exact cookie JSON
 *     `writeAppContextSelection` itself would write
 *     (`{kind:"church",churchId,roleId,source:"membership"}`) via
 *     `context.addCookies` — verified against `resolveAppContext`'s
 *     `storedSelection.source === "membership"` branch, which looks the
 *     `churchId` up in the signed-in user's own real `memberships` (sarah's
 *     `church_admin` row), not against impersonation/tenantViews. Per the
 *     Story A brief, this is an accepted alternative to a live UI action:
 *     "context.addCookies with the exact JSON the server writes is
 *     acceptable if resolveAppContext validates it against the user's real
 *     memberships."
 *   - The cookie is httpOnly (`writeAppContextSelection`), so a
 *     `page.evaluate(() => document.cookie = ...)` write is silently
 *     dropped by the browser once a same-named httpOnly cookie already
 *     exists, and creates a *non-httpOnly* cookie (readable by any script on
 *     the page) when none exists yet — both are worse than
 *     `context.addCookies`, which sets it at the CDP/browser level exactly
 *     like a real `Set-Cookie: ...; HttpOnly` response would, indistinguishable
 *     server-side. (The three original specs' `page.evaluate` cookie writes
 *     happened to still work only because they targeted `secretary` /
 *     `member` identities whose *default* membership-based resolution
 *     already matched what they were trying to set — see the git history of
 *     the 3 migrated specs.)
 */
import type { BrowserContext, Page } from "@playwright/test";

/** Grace Harbor's church_id — see supabase/seed.sql `v_church_id`. */
export const SEED_CHURCH_ID = "11111111-0000-0000-0000-000000000001";

/** Mirrors lib/auth.ts's `appContextCookieName` exactly. */
export const appContextCookieName = "churchcore_ops_app_context";

export type ChurchRoleId = "church-admin" | "secretary" | "pastor" | "ministry-leader" | "member";
export type IdentityId = "super-admin" | ChurchRoleId;

/** Mirrors lib/auth.ts's `StoredAppContextSelection` exactly. */
export type StoredAppContextSelection =
  | { kind: "control" }
  | { kind: "church"; churchId: string; roleId: ChurchRoleId; source: "membership" | "impersonation" };

export interface RoleFixture {
  id: IdentityId;
  /** Env var name in .demo-credentials.local holding this identity's sign-in email. */
  emailEnvVar: string;
  /** Path this identity lands on after a fresh sign-in with the right app context. */
  homePath: string;
  controlPlane: boolean;
  /**
   * Seeded via `context.addCookies` before sign-in when this identity's
   * default `resolveAppContext` resolution would NOT already land it on
   * `homePath` (only `church-admin`, today — see the file header).
   */
  appContextSelection?: StoredAppContextSelection;
}

export const roles: Record<IdentityId, RoleFixture> = {
  "super-admin": {
    id: "super-admin",
    emailEnvVar: "CHURCHCORE_OPS_DEMO_ADMIN_EMAIL", // sarah@churchcoreops.app
    homePath: "/control",
    controlPlane: true,
  },
  "church-admin": {
    id: "church-admin",
    emailEnvVar: "CHURCHCORE_OPS_DEMO_ADMIN_EMAIL", // sarah@churchcoreops.app, same login, church context
    homePath: "/app/church-admin",
    controlPlane: false,
    appContextSelection: {
      kind: "church",
      churchId: SEED_CHURCH_ID,
      roleId: "church-admin",
      source: "membership",
    },
  },
  secretary: {
    id: "secretary",
    emailEnvVar: "CHURCHCORE_OPS_DEMO_SECRETARY_EMAIL", // olivia@graceharbor.church
    homePath: "/app/secretary",
    controlPlane: false,
  },
  pastor: {
    id: "pastor",
    emailEnvVar: "CHURCHCORE_OPS_DEMO_PASTOR_EMAIL", // miriam@graceharbor.church
    homePath: "/app/pastor",
    controlPlane: false,
  },
  "ministry-leader": {
    id: "ministry-leader",
    emailEnvVar: "CHURCHCORE_OPS_DEMO_MINISTRY_LEADER_EMAIL", // robert@graceharbor.church
    homePath: "/app/ministry-leader",
    controlPlane: false,
  },
  member: {
    id: "member",
    emailEnvVar: "CHURCHCORE_OPS_DEMO_MEMBER_EMAIL", // david@graceharbor.church
    homePath: "/app/member",
    controlPlane: false,
  },
};

export const identityIds = Object.keys(roles) as IdentityId[];

/** Where auth.setup.ts saves, and specs load, each identity's storageState. */
export function authFilePath(identity: IdentityId): string {
  return `tests/e2e/.auth/${identity}.json`;
}

/** Sets the exact `churchcore_ops_app_context` cookie JSON the server itself would write (see the file header). */
export async function seedAppContextCookie(
  context: BrowserContext,
  appUrl: string,
  selection: StoredAppContextSelection,
): Promise<void> {
  await context.addCookies([
    {
      name: appContextCookieName,
      value: JSON.stringify(selection),
      url: appUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Signs in through the real /sign-in UI (email/password form,
 * app/sign-in/actions.ts's `signInAction`), then waits for the exact
 * `redirectTo` pathname — failing fast with a clear message rather than
 * hanging if sign-in didn't land there (wrong credentials, an unexpected
 * `/sign-in?error=...` bounce, or an app-context mismatch redirecting
 * elsewhere).
 */
export async function signInThroughUi(
  page: Page,
  params: { email: string; password: string; redirectTo: string },
): Promise<void> {
  const { email, password, redirectTo } = params;

  await page.goto(`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  try {
    await page.waitForURL((url) => url.pathname === redirectTo, { timeout: 15_000 });
  } catch {
    throw new Error(
      `Sign-in as ${email} did not land on ${redirectTo} within 15s (ended up at ${page.url()}). ` +
        "Check credentials in .demo-credentials.local and, for a church-role identity, its app-context cookie.",
    );
  }
}

/**
 * Fails fast with a clear, named error instead of hanging on a later
 * `expect(...).toBeVisible()` that was really waiting for protected content
 * that will never render — the real cause being a stale/invalid
 * storageState (session expired, or generated against a different local
 * Supabase instance) that bounced the page to /sign-in. Story A brief edge
 * case: "A stale storageState fails clearly."
 */
export function assertNotSignedOut(page: Page): void {
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/sign-in") {
    throw new Error(
      `Expected an authenticated page but was redirected to /sign-in (storageState looks stale or invalid). ` +
        `Re-run the "setup" project to refresh tests/e2e/.auth/*.json: npx playwright test --project=setup`,
    );
  }
}
