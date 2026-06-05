import { NextRequest, NextResponse } from "next/server";

import {
  createTenantAdminClient,
  createTenantServerClient,
  hasTenantBackendEnv,
  shouldUseLocalTenantFallback,
  queryTenantLocalDb,
} from "@/lib/supabase/tenant";

function hasVapidKeys() {
  return (
    Boolean(process.env.VAPID_PUBLIC_KEY) &&
    Boolean(process.env.VAPID_PRIVATE_KEY)
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasTenantBackendEnv()) {
    return NextResponse.json({ received: true, skipped: true });
  }

  let body: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; churchId: string; profileId: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { subscription, churchId, profileId } = body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth || !churchId || !profileId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify the caller is authenticated and owns the profile
  const supabaseClient = await createTenantServerClient();
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm profileId belongs to the authenticated user within this church
  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("church_id", churchId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  // Graceful skip when VAPID keys are not configured
  if (!hasVapidKeys()) {
    return NextResponse.json({ received: true, skipped: true });
  }

  if (shouldUseLocalTenantFallback()) {
    try {
      await queryTenantLocalDb(
        `insert into public.push_subscriptions
           (church_id, profile_id, endpoint, p256dh, auth_secret)
         values ($1, $2, $3, $4, $5)
         on conflict (profile_id, endpoint) do update
           set p256dh = excluded.p256dh,
               auth_secret = excluded.auth_secret`,
        [churchId, profileId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
      );
    } catch {
      // Table may not exist in older environments — skip gracefully
    }
    return NextResponse.json({ received: true });
  }

  const supabase = createTenantAdminClient();
  await supabase
    .from("push_subscriptions")
    .upsert(
      {
        church_id: churchId,
        profile_id: profileId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_secret: subscription.keys.auth,
      },
      { onConflict: "profile_id,endpoint" },
    );

  return NextResponse.json({ received: true });
}
