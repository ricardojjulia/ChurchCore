// Edge-safe constants for the children's check-in kiosk (G2.2). No server-only
// imports: proxy.ts uses these.

/** httpOnly cookie holding only the ccm_kiosk_sessions row id (a random v4 uuid). */
export const KIOSK_COOKIE_NAME = "cc_kiosk";

/** A started kiosk stops being valid on the server this long after it started. */
export const KIOSK_MAX_AGE_SECONDS = 16 * 60 * 60;

/**
 * The cookie deliberately outlives the server-side limit above, so an expired
 * kiosk always reaches the locked screen (whose Release signs the admin out)
 * instead of the cookie silently vanishing and exposing the signed-in admin app.
 */
export const KIOSK_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Where the kiosk lives; also where the proxy sends a kiosk tablet. */
export const KIOSK_HOME_PATH = "/kiosk/children";

const KIOSK_PASS_PREFIXES = [
  "/kiosk",
  "/_next",
  "/vendor",
  // The admin may need to sign in again on the tablet; the kiosk stays locked.
  "/sign-in",
  "/auth",
];

// Only the framework's own assets (/_next, /vendor, above) and the few fixed
// root files a browser asks for on its own. Not "anything ending in .json/.txt":
// that let a typed URL walk out of the kiosk. /api is not passed either.
const ROOT_ASSET =
  /^\/(?:favicon\.ico|sw\.js|manifest\.webmanifest|robots\.txt|(?:apple-)?icon[^/]*\.(?:png|ico|svg|jpg))$/i;

/**
 * True when a request from a browser carrying the kiosk cookie should be sent
 * back to the kiosk start screen. UX only: every kiosk action re-checks the
 * server-side session, and nothing here widens what the cookie can do.
 */
export function shouldRedirectToKiosk(pathname: string, hasKioskCookie: boolean): boolean {
  if (!hasKioskCookie) return false;
  if (ROOT_ASSET.test(pathname)) return false;
  return !KIOSK_PASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
