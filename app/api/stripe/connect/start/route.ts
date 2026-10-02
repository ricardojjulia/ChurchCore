import { NextResponse } from "next/server";

import { appBaseUrl } from "@/lib/app-url";
import { requireChurchSession } from "@/lib/auth";
import { signConnectState, stripeConnectAuthorizeUrl, stripeConnectClientId } from "@/lib/stripe/connect";

export const dynamic = "force-dynamic";

const SETTINGS = "/app/church-admin/giving";

/**
 * "Connect with Stripe" (G3.0b, ADR 0025): sends a church admin to Stripe's
 * OAuth page, where they sign in to the church's Stripe account or create
 * one. The signed state binds the callback to this church and this admin.
 */
export async function GET() {
  // Outside any try: a signed-out caller is redirected to sign-in.
  const session = await requireChurchSession(SETTINGS);
  const back = (status: string) => NextResponse.redirect(`${appBaseUrl() ?? ""}${SETTINGS}?stripe=${status}`);

  if (session.appContext.roleId !== "church-admin" || !session.churchProfileId) {
    return NextResponse.json({ error: "Only a church administrator can connect the church's Stripe account." }, { status: 403 });
  }
  const base = appBaseUrl();
  if (!stripeConnectClientId() || !base) {
    return back("not_configured");
  }

  const state = signConnectState({ churchId: session.appContext.church.id, profileId: session.churchProfileId });
  return NextResponse.redirect(stripeConnectAuthorizeUrl({ state, redirectUri: `${base}/api/stripe/connect/callback` }));
}
