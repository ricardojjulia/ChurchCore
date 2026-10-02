import { NextResponse, type NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/actions/audit";
import { appBaseUrl } from "@/lib/app-url";
import { requireChurchSession } from "@/lib/auth";
import {
  churchForStripeAccount,
  deauthorizeConnectedAccount,
  exchangeConnectCode,
  getChurchStripeAccount,
  retrieveConnectedAccountStatus,
  saveChurchStripeAccount,
  verifyConnectState,
} from "@/lib/stripe/connect";

export const dynamic = "force-dynamic";

const SETTINGS = "/app/church-admin/giving";

/**
 * Stripe's OAuth redirect (G3.0b, ADR 0025). Links the church to the Stripe
 * account the admin authorized — only when the signed state matches the
 * signed-in church admin and their church, so a forged or replayed callback
 * can't attach an account to another church.
 */
export async function GET(request: NextRequest) {
  const session = await requireChurchSession(SETTINGS);
  const back = (status: string) => NextResponse.redirect(`${appBaseUrl() ?? ""}${SETTINGS}?stripe=${status}`);

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    // The admin declined at Stripe, or Stripe refused.
    return back("cancelled");
  }

  const state = verifyConnectState(params.get("state") ?? "");
  const code = params.get("code");
  if (
    !state ||
    !code ||
    session.appContext.roleId !== "church-admin" ||
    state.churchId !== session.appContext.church.id ||
    state.profileId !== session.churchProfileId
  ) {
    return back("invalid");
  }

  let accountId: string;
  try {
    // One account per church: switching means disconnecting first.
    if (await getChurchStripeAccount(state.churchId)) return back("already_connected");
    accountId = await exchangeConnectCode(code);
  } catch (error) {
    console.error("[stripe-connect] Connecting failed:", error instanceof Error ? error.message : error);
    return back("failed");
  }

  // From here Stripe has authorized the account, so a failure must not leave
  // ChurchCore holding access no church is linked to (PR #174 review).
  // Revoke only once we know no other church relies on this account: access
  // is per platform, not per church, so revoking would cut that church off.
  let safeToRevoke = false;
  try {
    const owner = await churchForStripeAccount(accountId, { activeOnly: true });
    if (owner && owner !== state.churchId) return back("in_use");
    safeToRevoke = true;
    const status = await retrieveConnectedAccountStatus(accountId);
    await saveChurchStripeAccount({
      churchId: state.churchId,
      accountId,
      chargesEnabled: status.chargesEnabled,
      detailsSubmitted: status.detailsSubmitted,
      connectedBy: session.churchProfileId,
    });
    await logAuditEvent({
      tableName: "church_payment_accounts",
      recordId: state.churchId,
      operation: "INSERT",
      actorId: session.userId,
      churchId: state.churchId,
      actorRole: session.appContext.roleId,
      newValues: { stripe_account_id: accountId, charges_enabled: status.chargesEnabled },
    }).catch((error) => console.error("[stripe-connect] Audit log failed:", error));
    return back(status.chargesEnabled ? "connected" : "pending");
  } catch (error) {
    console.error("[stripe-connect] Linking failed after Stripe authorized:", error instanceof Error ? error.message : error);
    if (safeToRevoke) {
      await deauthorizeConnectedAccount(accountId).catch((revokeError) =>
        console.error(
          "[stripe-connect] Couldn't revoke the unlinked account:",
          revokeError instanceof Error ? revokeError.message : revokeError,
        ),
      );
    }
    return back("failed");
  }
}
