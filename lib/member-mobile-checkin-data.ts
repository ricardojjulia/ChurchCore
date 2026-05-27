import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type MemberMobileCheckInOption = {
  eventId: string;
  title: string;
  category: string;
  startsAt: string;
  endsAt: string;
  windowStartAt: string;
  windowEndAt: string;
  accessCodeRequired: boolean;
  allowHouseholdCheckIn: boolean;
  locationRequired: boolean;
  status: "upcoming" | "open" | "checked_in" | "closed";
};

function deriveStatus(option: {
  windowStartAt: string;
  windowEndAt: string;
  checkedIn: boolean;
}): MemberMobileCheckInOption["status"] {
  if (option.checkedIn) return "checked_in";

  const now = Date.now();
  const start = new Date(option.windowStartAt).getTime();
  const end = new Date(option.windowEndAt).getTime();

  if (now < start) return "upcoming";
  if (now > end) return "closed";
  return "open";
}

export async function getMemberMobileCheckInOptions(
  session: ChurchAppSession,
): Promise<MemberMobileCheckInOption[]> {
  if (session.appContext.roleId !== "member") {
    return [];
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return [];
  }

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      event_id: string;
      title: string;
      category: string;
      starts_at: string;
      ends_at: string;
      window_start_at: string;
      window_end_at: string;
      access_code_required: boolean;
      allow_household_check_in: boolean;
      location_required: boolean;
      checked_in: boolean;
    }>(
      `
        select
          event.id as event_id,
          event.title,
          event.category,
          event.starts_at,
          event.ends_at,
          coalesce(settings.mobile_member_check_in_starts_at, event.starts_at) as window_start_at,
          coalesce(settings.mobile_member_check_in_ends_at, event.ends_at) as window_end_at,
          (settings.mobile_member_check_in_access_code is not null and length(trim(settings.mobile_member_check_in_access_code)) > 0) as access_code_required,
          settings.mobile_member_check_in_allow_household as allow_household_check_in,
          (
            settings.mobile_member_check_in_location_lat is not null
            and settings.mobile_member_check_in_location_lng is not null
            and settings.mobile_member_check_in_location_radius_meters is not null
          ) as location_required,
          exists (
            select 1
            from public.attendance attendance
            where attendance.church_id = event.church_id
              and attendance.event_id = event.id
              and attendance.profile_id = $2
              and attendance.status = 'present'
          ) as checked_in
        from public.event_registration_settings settings
        join public.events event
          on event.id = settings.event_id
        where event.church_id = $1
          and settings.mobile_member_check_in_enabled = true
          and event.visibility in ('public', 'members')
          and event.starts_at >= timezone('utc', now()) - interval '1 day'
          and event.starts_at <= timezone('utc', now()) + interval '21 days'
        order by coalesce(settings.mobile_member_check_in_starts_at, event.starts_at) asc
        limit 20
      `,
      [churchId, profileId],
    );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      title: row.title,
      category: row.category,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      windowStartAt: row.window_start_at,
      windowEndAt: row.window_end_at,
      accessCodeRequired: row.access_code_required,
      allowHouseholdCheckIn: row.allow_household_check_in,
      locationRequired: row.location_required,
      status: deriveStatus({
        windowStartAt: row.window_start_at,
        windowEndAt: row.window_end_at,
        checkedIn: row.checked_in,
      }),
    }));
  }

  const supabase = await createTenantServerClient();
  const { data: settingsRows } = await supabase
    .from("event_registration_settings")
    .select(
      "event_id, mobile_member_check_in_enabled, mobile_member_check_in_starts_at, mobile_member_check_in_ends_at, mobile_member_check_in_access_code, mobile_member_check_in_allow_household, mobile_member_check_in_location_lat, mobile_member_check_in_location_lng, mobile_member_check_in_location_radius_meters, events!inner(id, title, category, starts_at, ends_at, visibility, church_id)",
    )
    .eq("church_id", churchId)
    .eq("mobile_member_check_in_enabled", true)
    .gte("events.starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .lte("events.starts_at", new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString())
    .order("mobile_member_check_in_starts_at", { ascending: true });

  const eligibleRows = (settingsRows ?? []).flatMap((row) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    if (!event) return [];
    if (event.visibility !== "members" && event.visibility !== "public") return [];

    const windowStartAt = row.mobile_member_check_in_starts_at ?? event.starts_at;
    const windowEndAt = row.mobile_member_check_in_ends_at ?? event.ends_at;

    return [
      {
        eventId: event.id,
        title: event.title,
        category: event.category,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        windowStartAt,
        windowEndAt,
        accessCodeRequired: Boolean(
          row.mobile_member_check_in_access_code &&
            row.mobile_member_check_in_access_code.trim().length > 0,
        ),
        allowHouseholdCheckIn: row.mobile_member_check_in_allow_household ?? false,
        locationRequired:
          row.mobile_member_check_in_location_lat !== null &&
          row.mobile_member_check_in_location_lng !== null &&
          row.mobile_member_check_in_location_radius_meters !== null,
      },
    ];
  });

  if (!eligibleRows.length) {
    return [];
  }

  const eventIds = eligibleRows.map((row) => row.eventId);
  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("event_id")
    .eq("church_id", churchId)
    .eq("profile_id", profileId)
    .eq("status", "present")
    .in("event_id", eventIds);

  const checkedInEventIds = new Set((attendanceRows ?? []).map((row) => row.event_id));

  return eligibleRows.map((row) => ({
    ...row,
    status: deriveStatus({
      windowStartAt: row.windowStartAt,
      windowEndAt: row.windowEndAt,
      checkedIn: checkedInEventIds.has(row.eventId),
    }),
  }));
}
