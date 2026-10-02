"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession } from "@/lib/auth";
import {
  deauthorizeConnectedAccount,
  getChurchStripeAccount,
  markChurchStripeAccountDisconnected,
} from "@/lib/stripe/connect";

/**
 * Disconnects the church's Stripe account (G3.0b, ADR 0025): revokes
 * ChurchCore's access at Stripe, then marks the link disconnected, so online
 * payments stop until the church connects again. Church admins only.
 */
export async function disconnectStripeAccountAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/church-admin/giving");
  if (session.appContext.roleId !== "church-admin") {
    return { ok: false, error: "Only a church administrator can disconnect the church's Stripe account." };
  }
  const churchId = session.appContext.church.id;

  const account = await getChurchStripeAccount(churchId);
  if (!account) return { ok: true };

  try {
    await deauthorizeConnectedAccount(account.accountId);
  } catch (error) {
    // Already revoked at Stripe (the church disconnected there first) is
    // fine; anything else must not leave ChurchCore thinking it's connected
    // while Stripe still is, or the other way round.
    const message = error instanceof Error ? error.message : String(error);
    // Stripe: "This application is not connected to stripe account acct_…".
    if (!/is not connected to stripe account/i.test(message)) {
      console.error("[stripe-connect] Deauthorize failed:", message);
      return { ok: false, error: "Couldn't disconnect from Stripe. Please try again." };
    }
  }

  try {
    await markChurchStripeAccountDisconnected(account.accountId);
  } catch (error) {
    console.error("[stripe-connect] Marking disconnected failed:", error);
    return { ok: false, error: "Disconnected at Stripe, but couldn't record it. Please try again." };
  }

  await logAuditEvent({
    tableName: "church_payment_accounts",
    recordId: churchId,
    operation: "UPDATE",
    actorId: session.userId,
    churchId,
    actorRole: session.appContext.roleId,
    newValues: { disconnected: true },
  }).catch((error) => console.error("[stripe-connect] Audit log failed:", error));

  revalidatePath("/app/church-admin/giving");
  return { ok: true };
}
