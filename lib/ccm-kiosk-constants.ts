// Edge-safe constants for the children's check-in kiosk (G2.2). No server-only
// imports: proxy.ts uses these.

/** httpOnly cookie holding only the ccm_kiosk_sessions row id (a random v4 uuid). */
export const KIOSK_COOKIE_NAME = "cc_kiosk";

/** A started kiosk stops being valid this long after it started. */
export const KIOSK_MAX_AGE_SECONDS = 16 * 60 * 60;

/** Where the kiosk lives; also where the proxy sends a kiosk tablet. */
export const KIOSK_HOME_PATH = "/kiosk/children";

const KIOSK_PASS_PREFIXES = [
  "/kiosk",
  "/_next",
  "/vendor",
  "/api",
  // The admin may need to sign in again on the tablet; the kiosk stays locked.
  "/sign-in",
  "/auth",
];

const STATIC_ASSET = /\.(?:js|mjs|css|wasm|map|json|txt|ico|svg|png|jpg|jpeg|gif|webp|woff2?|ttf)$/i;

/**
 * True when a request from a browser carrying the kiosk cookie should be sent
 * back to the kiosk start screen. UX only: every kiosk action re-checks the
 * server-side session, and nothing here widens what the cookie can do.
 */
export function shouldRedirectToKiosk(pathname: string, hasKioskCookie: boolean): boolean {
  if (!hasKioskCookie) return false;
  if (STATIC_ASSET.test(pathname)) return false;
  if (pathname === "/sw.js" || pathname === "/manifest.webmanifest") return false;
  return !KIOSK_PASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
