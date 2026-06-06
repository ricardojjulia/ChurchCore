import { NextRequest, NextResponse } from "next/server";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

// Demo-only route: marks an event registration as paid without touching Stripe.
// Returns 403 in any non-demo environment.

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

  await supabase
    .from("event_registrations")
    .update({ payment_status: "paid", updated_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("church_id", churchId);

  await supabase
    .from("event_registration_payments")
    .update({
      status: "succeeded",
      payment_intent_id: `pi_demo_${registrationId.slice(-8)}`,
      reconciled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("registration_id", registrationId)
    .eq("church_id", churchId);

  return NextResponse.json({ ok: true });
}
