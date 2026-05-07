import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchAdminDashboardSummary = {
  source: "preview" | "live";
  people: {
    active: number;
    visitors: number;
    incomplete: number;
  };
  ministries: {
    total: number;
    withoutLeader: number;
    assignments: number;
  };
  events: {
    upcoming: number;
    next14Days: number;
    withoutRoster: number;
  };
  giving: {
    last30DaysCents: number;
    giftCount: number;
    latestGiftAt: string | null;
  };
};

const emptySummary: ChurchAdminDashboardSummary = {
  source: "preview",
  people: {
    active: 0,
    visitors: 0,
    incomplete: 0,
  },
  ministries: {
    total: 0,
    withoutLeader: 0,
    assignments: 0,
  },
  events: {
    upcoming: 0,
    next14Days: 0,
    withoutRoster: 0,
  },
  giving: {
    last30DaysCents: 0,
    giftCount: 0,
    latestGiftAt: null,
  },
};

function buildPreviewSummary(): ChurchAdminDashboardSummary {
  return emptySummary;
}

export async function getChurchAdminDashboardSummary(
  session: ChurchAppSession,
): Promise<ChurchAdminDashboardSummary> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewSummary();
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      active_people: number;
      visitor_count: number;
      incomplete_profiles: number;
      ministry_count: number;
      ministries_without_leader: number;
      ministry_assignments: number;
      upcoming_events: number;
      next_14_day_events: number;
      events_without_roster: number;
      giving_last_30_cents: number;
      giving_last_30_count: number;
      latest_gift_at: string | null;
    }>(
      `
        with
          people as (
            select
              count(*) filter (
                where coalesce(membership_status, 'active') <> 'inactive'
              )::int as active_people,
              count(*) filter (
                where membership_status = 'visitor'
              )::int as visitor_count,
              count(*) filter (
                where coalesce(full_name, '') = ''
                   or email is null
                   or phone is null
              )::int as incomplete_profiles
            from public.profiles
            where church_id = $1
              and merged_at is null
          ),
          ministry_summary as (
            select
              count(*)::int as ministry_count,
              count(*) filter (where leader_profile_id is null)::int as ministries_without_leader
            from public.ministries
            where church_id = $1
          ),
          ministry_assignment_summary as (
            select count(*)::int as ministry_assignments
            from public.profile_ministries
            where church_id = $1
          ),
          upcoming_event_rows as (
            select id, starts_at
            from public.events
            where church_id = $1
              and starts_at >= timezone('utc', now())
          ),
          event_summary as (
            select
              count(*)::int as upcoming_events,
              count(*) filter (
                where starts_at < timezone('utc', now()) + interval '14 days'
              )::int as next_14_day_events,
              count(*) filter (
                where not exists (
                  select 1
                  from public.event_rosters roster
                  where roster.event_id = upcoming_event_rows.id
                    and roster.church_id = $1
                )
              )::int as events_without_roster
            from upcoming_event_rows
          ),
          giving_summary as (
            select
              coalesce(sum(amount_cents), 0)::int as giving_last_30_cents,
              count(*)::int as giving_last_30_count,
              max(created_at)::text as latest_gift_at
            from public.donations
            where church_id = $1
              and status = 'succeeded'
              and created_at >= timezone('utc', now()) - interval '30 days'
          )
        select *
        from people, ministry_summary, ministry_assignment_summary, event_summary, giving_summary
      `,
      [session.appContext.church.id],
    );

    const row = result.rows[0];

    if (!row) {
      return buildPreviewSummary();
    }

    return {
      source: "live",
      people: {
        active: row.active_people,
        visitors: row.visitor_count,
        incomplete: row.incomplete_profiles,
      },
      ministries: {
        total: row.ministry_count,
        withoutLeader: row.ministries_without_leader,
        assignments: row.ministry_assignments,
      },
      events: {
        upcoming: row.upcoming_events,
        next14Days: row.next_14_day_events,
        withoutRoster: row.events_without_roster,
      },
      giving: {
        last30DaysCents: row.giving_last_30_cents,
        giftCount: row.giving_last_30_count,
        latestGiftAt: row.latest_gift_at,
      },
    };
  }

  const supabase = await createTenantServerClient();
  const churchId = session.appContext.church.id;
  const now = new Date();
  const next14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    profilesResult,
    ministriesResult,
    assignmentsResult,
    eventsResult,
    donationsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, membership_status")
      .eq("church_id", churchId)
      .is("merged_at", null),
    supabase
      .from("ministries")
      .select("id, leader_profile_id")
      .eq("church_id", churchId),
    supabase
      .from("profile_ministries")
      .select("profile_id")
      .eq("church_id", churchId),
    supabase
      .from("events")
      .select("id, starts_at")
      .eq("church_id", churchId)
      .gte("starts_at", now.toISOString()),
    supabase
      .from("donations")
      .select("amount_cents, created_at")
      .eq("church_id", churchId)
      .eq("status", "succeeded")
      .gte("created_at", last30Days.toISOString())
      .order("created_at", { ascending: false }),
  ]);

  for (const result of [
    profilesResult,
    ministriesResult,
    assignmentsResult,
    eventsResult,
    donationsResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const profiles = profilesResult.data ?? [];
  const ministries = ministriesResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const events = eventsResult.data ?? [];
  const donations = donationsResult.data ?? [];
  const eventIds = events.map((event) => event.id).filter(Boolean);

  let rosterEventIds = new Set<string>();
  if (eventIds.length > 0) {
    const rostersResult = await supabase
      .from("event_rosters")
      .select("event_id")
      .eq("church_id", churchId)
      .in("event_id", eventIds);

    if (rostersResult.error) {
      throw new Error(rostersResult.error.message);
    }

    rosterEventIds = new Set(
      (rostersResult.data ?? [])
        .map((roster) => roster.event_id)
        .filter((eventId): eventId is string => typeof eventId === "string"),
    );
  }

  return {
    source: "live",
    people: {
      active: profiles.filter((profile) => profile.membership_status !== "inactive").length,
      visitors: profiles.filter((profile) => profile.membership_status === "visitor").length,
      incomplete: profiles.filter(
        (profile) => !profile.full_name || !profile.email || !profile.phone,
      ).length,
    },
    ministries: {
      total: ministries.length,
      withoutLeader: ministries.filter((ministry) => !ministry.leader_profile_id).length,
      assignments: assignments.length,
    },
    events: {
      upcoming: events.length,
      next14Days: events.filter(
        (event) => new Date(event.starts_at).getTime() < next14Days.getTime(),
      ).length,
      withoutRoster: events.filter((event) => !rosterEventIds.has(event.id)).length,
    },
    giving: {
      last30DaysCents: donations.reduce(
        (sum, donation) => sum + Number(donation.amount_cents ?? 0),
        0,
      ),
      giftCount: donations.length,
      latestGiftAt:
        donations.length > 0 && typeof donations[0].created_at === "string"
          ? donations[0].created_at
          : null,
    },
  };
}
