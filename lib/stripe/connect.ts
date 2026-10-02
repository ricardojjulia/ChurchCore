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

/** The church a connected account belongs to (for webhooks), or null. */
export async function churchForStripeAccount(accountId: string): Promise<string | null> {
  const { data, error } = await createTenantAdminClient()
    .from("church_payment_accounts")
    .select("church_id")
    .eq("stripe_account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { church_id: string } | null)?.church_id ?? null;
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
  const { error } = await createTenantAdminClient()
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
        updated_at: now,
      },
      { onConflict: "church_id" },
    );
  if (error) throw new Error(error.message);
}

/** Records Stripe's view of a connected account (account.updated). */
export async function updateChurchStripeAccountStatus(
  accountId: string,
  status: { chargesEnabled: boolean; detailsSubmitted: boolean },
): Promise<void> {
  const { error } = await createTenantAdminClient()
    .from("church_payment_accounts")
    .update({
      charges_enabled: status.chargesEnabled,
      details_submitted: status.detailsSubmitted,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", accountId);
  if (error) throw new Error(error.message);
}

/** Marks a church disconnected (it disconnected here, or revoked access at Stripe). */
export async function markChurchStripeAccountDisconnected(accountId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await createTenantAdminClient()
    .from("church_payment_accounts")
    .update({ disconnected_at: now, charges_enabled: false, updated_at: now })
    .eq("stripe_account_id", accountId)
    .is("disconnected_at", null);
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
