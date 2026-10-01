import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function sameSecret(provided: string, expected: string): boolean {
  // Hash both so the comparison is constant-time whatever the lengths.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Whether a request to a /api/cron/* route carries the cron secret, as
 * `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) or
 * `x-cron-secret`.
 *
 * Fails closed (S4, F8): without CRON_SECRET every request is rejected,
 * except under `next dev`. Before, each cron route had its own copy that let
 * every request through whenever the secret was unset outside production —
 * preview deploys and any non-production build ran the crons for anyone.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    console.error("[cron] CRON_SECRET is not set — rejecting cron request (S4).");
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const providedBearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const providedHeader = request.headers.get("x-cron-secret") ?? "";

  return (
    (providedBearer !== "" && sameSecret(providedBearer, cronSecret)) ||
    (providedHeader !== "" && sameSecret(providedHeader, cronSecret))
  );
}
