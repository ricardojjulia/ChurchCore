import { NextRequest, NextResponse } from "next/server";
import { stubPaymentIntentId } from "@/lib/stripe/event-registrations";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

// Demo-only route: completes a registration's stubbed payment without
// touching Stripe. Returns 403 in any non-demo environment.

export async function POST(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const registrationId = body?.registrationId as string | undefined;
  const churchId = body?.churchId as string | undefined;

  if (!registrationId || !churchId) {
    return NextResponse.json({ error: "Missing registrationId or churchId" }, { status: 400 });
  }

  const supabase = createTenantAdminClient();

  // Only a still-pending *stub* payment can be completed here (S4): the id
  // the stub checkout gives it (lib/stripe/event-registrations.ts). Before,
  // this marked any registration paid, so on a demo deploy with Stripe
  // configured anyone could mark a real, unpaid registration as paid.
  const stubIntentId = stubPaymentIntentId(registrationId);
  const { data: completed, error: paymentError } = await supabase
    .from("event_registration_payments")
    .update({
      status: "succeeded",
      reconciled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("registration_id", registrationId)
    .eq("church_id", churchId)
    .eq("payment_intent_id", stubIntentId)
    .eq("status", "pending")
    .select("id");

  if (paymentError) {
    return NextResponse.json({ error: "Couldn't complete the demo payment." }, { status: 500 });
  }
  if (!completed || completed.length === 0) {
    return NextResponse.json({ error: "No pending demo payment for this registration." }, { status: 404 });
  }

  const { error: registrationError } = await supabase
    .from("event_registrations")
    .update({ payment_status: "paid" })
    .eq("id", registrationId)
    .eq("church_id", churchId);

  if (registrationError) {
    return NextResponse.json({ error: "Couldn't complete the demo payment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
