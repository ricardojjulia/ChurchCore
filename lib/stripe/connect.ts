import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { createTenantAdminClient } from "@/lib/supabase/tenant";

import { getStripeSecretKey, stripeRequest } from "./client";

// Stripe Connect, Standard accounts, direct charges (ADR 0025): each church's
// online payments run on its own Stripe account, which a church admin links
// through Stripe OAuth. This module holds the link and the OAuth handshake.

const CONNECT_BASE = "https://connect.stripe.com";
const STATE_TTL_MS = 15 * 60 * 1000;

export type ChurchStripeAccount = {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

export function stripeConnectClientId(): string | null {
  return process.env.STRIPE_CONNECT_CLIENT_ID?.trim() || null;
}

/**
 * The church's connected Stripe account, or null when it hasn't connected
 * (or has disconnected). `churchId` must come from the server-side session
 * or a database row, never from a caller.
 */
export async function getChurchStripeAccount(churchId: string): Promise<ChurchStripeAccount | null> {
  const { data, error } = await createTenantAdminClient()
    .from("church_payment_accounts")
    .select("stripe_account_id, charges_enabled, details_submitted")
    .eq("church_id", churchId)
    .is("disconnected_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { stripe_account_id: string; charges_enabled: boolean; details_submitted: boolean };
  return { accountId: row.stripe_account_id, chargesEnabled: row.charges_enabled, detailsSubmitted: row.details_submitted };
}

/**
 * The church a connected account belongs to, or null. Webhooks use any link
 * (a refund made at Stripe after a disconnect still belongs to the church);
 * `activeOnly` asks only about a church still connected to it.
 */
export async function churchForStripeAccount(
  accountId: string,
  options: { activeOnly?: boolean } = {},
): Promise<string | null> {
  let query = createTenantAdminClient()
    .from("church_payment_accounts")
    .select("church_id")
    .eq("stripe_account_id", accountId);
  if (options.activeOnly) query = query.is("disconnected_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { church_id: string } | null)?.church_id ?? null;
}

/**
 * Shown when a refund or cancel targets a payment made on an account that is
 * no longer this church's connected account. Disconnecting revokes
 * ChurchCore's access to that account at Stripe, so only the church can act
 * on those payments, from that account's own Stripe Dashboard (ADR 0025).
 */
export const PAYMENT_ACCOUNT_DISCONNECTED =
  "This payment was made on a Stripe account that's no longer connected to ChurchCore. Refund or cancel it from that account's Stripe Dashboard.";

/**
 * The account to refund or cancel an existing payment on: the account it was
 * charged on, which must still be the church's connected account. A row with
 * no recorded account (made before G3.0b) uses the church's current account.
 * Throws PAYMENT_ACCOUNT_DISCONNECTED otherwise.
 */
export async function accountForExistingPayment(churchId: string, paymentAccount: string | null): Promise<string> {
  const current = await getChurchStripeAccount(churchId);
  const account = paymentAccount ?? current?.accountId ?? null;
  if (!account || !current || current.accountId !== account) throw new Error(PAYMENT_ACCOUNT_DISCONNECTED);
  return account;
}

// ── OAuth state ───────────────────────────────────────────────
// The state is signed (keyed by the platform's Stripe secret, server-only)
// and binds the callback to the church and the admin who started it, with
// an expiry, so a callback can't attach an account to another church.

type ConnectState = { churchId: string; profileId: string };

function stateSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signConnectState(state: ConnectState, now: number = Date.now()): string {
  const secret = getStripeSecretKey();
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured.");
  const payload = Buffer.from(
    JSON.stringify({ c: state.churchId, p: state.profileId, e: now + STATE_TTL_MS, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  return `${payload}.${stateSignature(payload, secret)}`;
}

export function verifyConnectState(value: string, now: number = Date.now()): ConnectState | null {
  const secret = getStripeSecretKey();
  if (!secret) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(stateSignature(payload, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { c: string; p: string; e: number };
    if (typeof parsed.c !== "string" || typeof parsed.p !== "string" || typeof parsed.e !== "number" || parsed.e < now) {
      return null;
    }
    return { churchId: parsed.c, profileId: parsed.p };
  } catch {
    return null;
  }
}

// ── OAuth handshake ───────────────────────────────────────────

export function stripeConnectAuthorizeUrl(input: { state: string; redirectUri: string }): string {
  const clientId = stripeConnectClientId();
  if (!clientId) throw new Error("STRIPE_CONNECT_CLIENT_ID is not configured.");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state: input.state,
    redirect_uri: input.redirectUri,
  });
  return `${CONNECT_BASE}/oauth/authorize?${params.toString()}`;
}

/** Exchanges the OAuth code for the church's account id (`stripe_user_id`). */
export async function exchangeConnectCode(code: string): Promise<string> {
  const token = await stripeRequest<{ stripe_user_id?: string }>(
    "POST",
    "/oauth/token",
    { grant_type: "authorization_code", code },
    { baseUrl: CONNECT_BASE },
  );
  if (!token.stripe_user_id) throw new Error("Stripe didn't return a connected account.");
  return token.stripe_user_id;
}

/** Whether the connected account can take charges yet (platform call). */
export async function retrieveConnectedAccountStatus(
  accountId: string,
): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }> {
  const account = await stripeRequest<{ charges_enabled?: boolean; details_submitted?: boolean }>(
    "GET",
    `/accounts/${encodeURIComponent(accountId)}`,
  );
  return { chargesEnabled: Boolean(account.charges_enabled), detailsSubmitted: Boolean(account.details_submitted) };
}

/** Revokes ChurchCore's access to the church's account at Stripe. */
export async function deauthorizeConnectedAccount(accountId: string): Promise<void> {
  const clientId = stripeConnectClientId();
  if (!clientId) throw new Error("STRIPE_CONNECT_CLIENT_ID is not configured.");
  await stripeRequest("POST", "/oauth/deauthorize", { client_id: clientId, stripe_user_id: accountId }, { baseUrl: CONNECT_BASE });
}

// ── The link ──────────────────────────────────────────────────

export async function saveChurchStripeAccount(input: {
  churchId: string;
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  connectedBy: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const supabase = createTenantAdminClient();
  // An account another church once connected and has since disconnected can
  // be linked here; its old link (access already revoked) gives way. A link
  // another church still has is never touched: the caller refuses first,
  // and the unique constraint backs that up.
  const { error: releaseError } = await supabase
    .from("church_payment_accounts")
    .delete()
    .eq("stripe_account_id", input.accountId)
    .neq("church_id", input.churchId)
    .not("disconnected_at", "is", null);
  if (releaseError) throw new Error(releaseError.message);
  const { error } = await supabase
    .from("church_payment_accounts")
    .upsert(
      {
        church_id: input.churchId,
        stripe_account_id: input.accountId,
        charges_enabled: input.chargesEnabled,
        details_submitted: input.detailsSubmitted,
        connected_at: now,
        disconnected_at: null,
        connected_by: input.connectedBy,
        // Products belong to an account: a (re)link starts without one (G3.1).
        stripe_recurring_product_id: null,
        updated_at: now,
      },
      { onConflict: "church_id" },
    );
  if (error) throw new Error(error.message);
}

/**
 * Records Stripe's view of a connected account (account.updated). `asOf` is
 * when Stripe created the event: Stripe doesn't deliver events in order, so
 * an event from before the current connection is ignored, in the update
 * itself.
 */
export async function updateChurchStripeAccountStatus(
  accountId: string,
  status: { chargesEnabled: boolean; detailsSubmitted: boolean },
  asOf?: Date,
): Promise<void> {
  let query = createTenantAdminClient()
    .from("church_payment_accounts")
    .update({
      charges_enabled: status.chargesEnabled,
      details_submitted: status.detailsSubmitted,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", accountId)
    .is("disconnected_at", null);
  if (asOf) query = query.lte("connected_at", asOf.toISOString());
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/**
 * Marks a church disconnected (it disconnected here, or revoked access at
 * Stripe). `asOf`, for a webhook, is when Stripe created the event: a late
 * or retried deauthorization from before the church reconnected must not
 * disconnect the new link, so the update applies only to a link made at or
 * before that time.
 */
export async function markChurchStripeAccountDisconnected(accountId: string, asOf?: Date): Promise<void> {
  const now = new Date().toISOString();
  let query = createTenantAdminClient()
    .from("church_payment_accounts")
    .update({ disconnected_at: now, charges_enabled: false, updated_at: now })
    .eq("stripe_account_id", accountId)
    .is("disconnected_at", null);
  if (asOf) query = query.lte("connected_at", asOf.toISOString());
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export type ChurchPaymentConnection = {
  /** The platform can do Connect at all (keys and client id are set). */
  platformReady: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** The account id's last characters, for display. */
  accountHint: string | null;
};

/** What the church-admin settings card shows. */
export async function getChurchPaymentConnection(churchId: string): Promise<ChurchPaymentConnection> {
  const platformReady = Boolean(getStripeSecretKey() && stripeConnectClientId() && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const account = await getChurchStripeAccount(churchId);
  return {
    platformReady,
    connected: Boolean(account),
    chargesEnabled: account?.chargesEnabled ?? false,
    detailsSubmitted: account?.detailsSubmitted ?? false,
    accountHint: account ? `…${account.accountId.slice(-6)}` : null,
  };
}
