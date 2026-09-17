"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import { queryTenantLocalDb } from "@/lib/supabase/tenant";

export async function hydrateSandboxDataAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireChurchSession("/app/church-admin/onboarding");
    if (session.appContext.roleId !== "church-admin") {
      return { ok: false, error: "Unauthorized: only church admins can hydrate sandbox data." };
    }
    const churchId = session.appContext.church.id;

    // 1. Verify church is in sandbox mode
    const churchResult = await queryTenantLocalDb<{ is_sandbox: boolean }>(
      "select is_sandbox from public.churches where id = $1 limit 1",
      [churchId],
    );
    const isSandbox = churchResult.rows[0]?.is_sandbox ?? false;

    if (!isSandbox) {
      return { ok: false, error: "This operation is only allowed in Sandbox Mode." };
    }

    // 2. Clear existing demo data to allow clean re-hydration
    // (excluding current logged in admin user profile to prevent auth lockout)
    await queryTenantLocalDb(
      "delete from public.donations where church_id = $1",
      [churchId],
    );
    await queryTenantLocalDb(
      "delete from public.volunteer_shifts where church_id = $1",
      [churchId],
    );
    await queryTenantLocalDb(
      "delete from public.service_plans where church_id = $1",
      [churchId],
    );
    await queryTenantLocalDb(
      "delete from public.events where church_id = $1",
      [churchId],
    );
    await queryTenantLocalDb(
      "delete from public.profiles where church_id = $1 and id != $2",
      [churchId, session.profile.id],
    );

    // 3. Insert mock profiles (user_id is null for mock members)
    const p1 = await queryTenantLocalDb<{ id: string }>(
      `insert into public.profiles (full_name, email, church_id, role, membership_status, directory_visible, contact_allowed, phone)
       values ('Emma Watson', 'emma@example.com', $1, 'member_volunteer', 'active', true, true, '555-0192')
       returning id`,
      [churchId],
    );
    const p2 = await queryTenantLocalDb<{ id: string }>(
      `insert into public.profiles (full_name, email, church_id, role, membership_status, directory_visible, contact_allowed, phone)
       values ('John Smith', 'john@example.com', $1, 'member_volunteer', 'active', true, true, '555-0143')
       returning id`,
      [churchId],
    );
    const emmaId = p1.rows[0]?.id;
    const johnId = p2.rows[0]?.id;

    // 4. Insert mock events
    const e1 = await queryTenantLocalDb<{ id: string }>(
      `insert into public.events (church_id, title, description, start, "end", category, visibility, rsvp_enabled)
       values ($1, 'Sunday Morning Worship', 'Weekly congregational worship service.',
               timezone('utc', now() + interval '2 days'), timezone('utc', now() + interval '2 days' + interval '2 hours'),
               'worship', 'members', true)
       returning id`,
      [churchId],
    );
    await queryTenantLocalDb(
      `insert into public.events (church_id, title, description, start, "end", category, visibility, rsvp_enabled)
       values ($1, 'Midweek Fellowship & Prayer', 'Small group sharing and prayers.',
               timezone('utc', now() + interval '5 days'), timezone('utc', now() + interval '5 days' + interval '1.5 hours'),
               'prayer', 'members', true)`,
      [churchId],
    );
    const worshipEventId = e1.rows[0]?.id;

    // 5. Insert mock donations
    if (emmaId) {
      await queryTenantLocalDb(
        `insert into public.donations (church_id, profile_id, donor_name, donor_email, amount_cents, currency, fund_designation, status, is_anonymous)
         values ($1, $2, 'Emma Watson', 'emma@example.com', 5000, 'usd', 'General Fund', 'succeeded', false)`,
        [churchId, emmaId],
      );
    }
    if (johnId) {
      await queryTenantLocalDb(
        `insert into public.donations (church_id, profile_id, donor_name, donor_email, amount_cents, currency, fund_designation, status, is_anonymous)
         values ($1, $2, 'John Smith', 'john@example.com', 12500, 'usd', 'Building Fund', 'succeeded', false)`,
        [churchId, johnId],
      );
    }

    // 6. Insert mock volunteer shifts linked to events
    if (worshipEventId && emmaId) {
      // Create a service plan
      const plan = await queryTenantLocalDb<{ id: string }>(
        `insert into public.service_plans (church_id, event_id, name, service_date, service_time, status)
         values ($1, $2, 'Sunday Service Plan', CURRENT_DATE + interval '2 days', '10:00:00', 'published')
         returning id`,
        [churchId, worshipEventId],
      );
      const planId = plan.rows[0]?.id;

      if (planId) {
        await queryTenantLocalDb(
          `insert into public.volunteer_shifts (church_id, profile_id, event_id, plan_id, title, starts_at, ends_at, confirmation_status, role)
           values ($1, $2, $3, $4, 'Usher Crew',
                   timezone('utc', now() + interval '2 days'), timezone('utc', now() + interval '2 days' + interval '2 hours'),
                   'pending', 'Usher')`,
          [churchId, emmaId, worshipEventId, planId],
        );
      }
    }

    revalidatePath("/app/church-admin");
    revalidatePath("/app/church-admin/people");
    revalidatePath("/app/church-admin/events");
    revalidatePath("/app/church-admin/readiness");

    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Hydration action failed:", msg);
    return { ok: false, error: msg };
  }
}
