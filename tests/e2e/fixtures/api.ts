/**
 * Shared helpers for the API contract specs (tests/e2e/api-*.spec.ts).
 * These use Playwright's `request` fixture directly — no browser page.
 */
import { createHmac, randomInt } from "node:crypto";
import pg from "pg";

import { getTenantDbUrl } from "./env";

export type UnsubscribeChannel = "email" | "sms";

/**
 * Mirrors lib/communications/unsubscribe.ts's HMAC scheme exactly:
 * payload `${churchId}:${contactEmail}:${channel}:${expiresAt}`,
 * HMAC-SHA256, hex digest. Reimplemented here (rather than imported) so the
 * contract specs stay self-contained and don't depend on Playwright's TS
 * loader resolving the app's `@/` path alias.
 */
export function signUnsubscribeParams(params: {
  churchId: string;
  contactEmail: string;
  channel: UnsubscribeChannel;
  secret: string;
  /** Defaults to 30 days from now, matching generateUnsubscribeLink. */
  expiresAt?: number;
}): { t: string; cid: string; e: string; ch: string; sig: string } {
  const expiresAt = params.expiresAt ?? Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${params.churchId}:${params.contactEmail}:${params.channel}:${expiresAt}`;
  const sig = createHmac("sha256", params.secret).update(payload, "utf8").digest("hex");

  return {
    t: String(expiresAt),
    cid: params.churchId,
    e: params.contactEmail,
    ch: params.channel,
    sig,
  };
}

export function unsubscribeQueryString(params: {
  churchId: string;
  contactEmail: string;
  channel: UnsubscribeChannel;
  secret: string;
  expiresAt?: number;
}): string {
  const signed = signUnsubscribeParams(params);
  return new URLSearchParams(signed).toString();
}

export type CronHeaderMode = "bearer" | "x-cron-secret";

export function cronAuthHeaders(secret: string, mode: CronHeaderMode = "bearer"): Record<string, string> {
  return mode === "bearer" ? { authorization: `Bearer ${secret}` } : { "x-cron-secret": secret };
}

/** Signs a Stripe-Signature header value the way Stripe itself does: t=<ts>,v1=<hmac>. */
export function signStripeWebhook(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/** Signs the shared HMAC scheme used by the SendGrid and Twilio adapters (see buildHmac in each adapter). */
export function signTimestampedHmac(payload: string, secret: string, timestamp: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

/**
 * Runs a query against the tenant DB directly (TENANT_DB_URL), for
 * asserting on side effects — e.g. a `communication_suppressions` row after
 * a successful unsubscribe — that aren't visible in the HTTP response.
 */
export async function queryTenantDb<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = new pg.Client({ connectionString: getTenantDbUrl() });
  await client.connect();
  try {
    return await client.query<T>(text, values);
  } finally {
    await client.end();
  }
}

let ipCounter = 0;
// Random per-process prefix so re-running the suite against the same
// long-lived server doesn't collide with addresses a previous run already
// spent — the rate limiter's Map lives in the server process and its
// cleanup sweep only prunes entries older than the 60s window (see
// lib/rate-limit.ts), so a small deterministic counter starting at 0 every
// run would repeatedly re-exhaust the same handful of addresses.
const ipRunPrefix = `${randomInt(1, 254)}.${randomInt(1, 254)}`;

/**
 * The unsubscribe and push-subscribe rate limiters key on the first
 * `x-forwarded-for` entry, in-memory, for the life of the server process.
 * Tests that don't want to be affected by another test's rate-limit usage
 * (or that want to deliberately trigger a 429) should pass a unique IP.
 */
export function uniqueTestIp(): string {
  ipCounter += 1;
  return `203.${ipRunPrefix}.${(ipCounter % 250) + 1}`;
}
