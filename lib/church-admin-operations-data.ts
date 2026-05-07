import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchAdminWeekendOperationItem = {
  id: string;
  eventId: string;
  title: string;
  detail: string;
  status: "blocked" | "in-progress" | "done";
  href: string;
  badges: string[];
};

export type ChurchAdminOperationsData = {
  source: "preview" | "live";
  weekendItems: ChurchAdminWeekendOperationItem[];
};

type EventOperationRow = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  approval_status: string;
  roster_count: number;
  registration_count: number;
  waitlist_count: number;
  capacity: number | null;
  registration_open: boolean | null;
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildWeekendItems(rows: EventOperationRow[]): ChurchAdminWeekendOperationItem[] {
  const now = Date.now();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;

  return rows
    .flatMap((row) => {
      const startsAt = new Date(row.starts_at).getTime();
      const startsSoon = startsAt - now <= fourteenDays;
      const hasApprovalWork =
        row.approval_status === "draft" || row.approval_status === "pending";
      const missingRoster = row.roster_count === 0;
      const waitlistPressure = row.waitlist_count > 0;
      const capacityPressure =
        row.capacity !== null &&
        row.capacity > 0 &&
        row.registration_count >= Math.ceil(row.capacity * 0.9);

      if (!hasApprovalWork && !missingRoster && !startsSoon && !waitlistPressure && !capacityPressure) {
        return [];
      }

      const badges = [
        hasApprovalWork ? row.approval_status : null,
        missingRoster ? "no roster" : `${row.roster_count} rostered`,
        waitlistPressure ? `${row.waitlist_count} waitlisted` : null,
        capacityPressure ? "capacity pressure" : null,
        startsSoon ? "next 14 days" : null,
      ].filter((badge): badge is string => Boolean(badge));

      const status: ChurchAdminWeekendOperationItem["status"] =
        hasApprovalWork || missingRoster || waitlistPressure
          ? "blocked"
          : capacityPressure || startsSoon
            ? "in-progress"
            : "done";

      const registrationDetail =
        row.capacity !== null
          ? `${row.registration_count}/${row.capacity} registered`
          : `${row.registration_count} registered`;

      return [
        {
          id: `event-${row.id}`,
          eventId: row.id,
          title: row.title,
          detail: `${formatEventDate(row.starts_at)}${
            row.location ? ` · ${row.location}` : ""
          } · ${registrationDetail}`,
          status,
          href: `/app/church-admin/events/${row.id}`,
          badges,
        },
      ];
    })
    .slice(0, 8);
}

function buildPreviewOperationsData(): ChurchAdminOperationsData {
  return {
    source: "preview",
    weekendItems: [],
  };
}

export async function getChurchAdminOperationsData(
  session: ChurchAppSession,
): Promise<ChurchAdminOperationsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewOperationsData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<EventOperationRow>(
      `
        select
          event.id,
          event.title,
          event.starts_at,
          event.location,
          event.approval_status::text as approval_status,
          coalesce((
            select count(*)::int
            from public.event_rosters roster
            where roster.event_id = event.id
              and roster.church_id = event.church_id
          ), 0) as roster_count,
          coalesce((
            select count(*)::int
            from public.event_registrations registration
            where registration.event_id = event.id
              and registration.church_id = event.church_id
              and registration.status <> 'cancelled'
              and not registration.is_waitlisted
          ), 0) as registration_count,
          coalesce((
            select count(*)::int
            from public.event_registrations registration
            where registration.event_id = event.id
              and registration.church_id = event.church_id
              and registration.is_waitlisted
          ), 0) as waitlist_count,
          settings.capacity,
          settings.registration_open
        from public.events event
        left join public.event_registration_settings settings
          on settings.event_id = event.id
         and settings.church_id = event.church_id
        where event.church_id = $1
          and event.starts_at >= timezone('utc', now())
        order by event.starts_at asc
        limit 30
      `,
      [churchId],
    );

    return {
      source: "live",
      weekendItems: buildWeekendItems(result.rows),
    };
  }

  const supabase = await createTenantServerClient();
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, starts_at, location, approval_status")
    .eq("church_id", churchId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const eventIds = (events ?? []).map((event) => event.id);

  if (eventIds.length === 0) {
    return {
      source: "live",
      weekendItems: [],
    };
  }

  const [rostersResult, registrationsResult, settingsResult] = await Promise.all([
    supabase
      .from("event_rosters")
      .select("event_id")
      .eq("church_id", churchId)
      .in("event_id", eventIds),
    supabase
      .from("event_registrations")
      .select("event_id, status, is_waitlisted")
      .eq("church_id", churchId)
      .in("event_id", eventIds),
    supabase
      .from("event_registration_settings")
      .select("event_id, capacity, registration_open")
      .eq("church_id", churchId)
      .in("event_id", eventIds),
  ]);

  for (const result of [rostersResult, registrationsResult, settingsResult]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const rosterCounts = new Map<string, number>();
  for (const roster of rostersResult.data ?? []) {
    rosterCounts.set(roster.event_id, (rosterCounts.get(roster.event_id) ?? 0) + 1);
  }

  const registrationCounts = new Map<string, number>();
  const waitlistCounts = new Map<string, number>();
  for (const registration of registrationsResult.data ?? []) {
    if (registration.is_waitlisted) {
      waitlistCounts.set(
        registration.event_id,
        (waitlistCounts.get(registration.event_id) ?? 0) + 1,
      );
    } else if (registration.status !== "cancelled") {
      registrationCounts.set(
        registration.event_id,
        (registrationCounts.get(registration.event_id) ?? 0) + 1,
      );
    }
  }

  const settingsByEventId = new Map(
    (settingsResult.data ?? []).map((settings) => [settings.event_id, settings]),
  );

  const rows: EventOperationRow[] = (events ?? []).map((event) => {
    const settings = settingsByEventId.get(event.id);

    return {
      id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      location: event.location,
      approval_status: event.approval_status,
      roster_count: rosterCounts.get(event.id) ?? 0,
      registration_count: registrationCounts.get(event.id) ?? 0,
      waitlist_count: waitlistCounts.get(event.id) ?? 0,
      capacity: settings?.capacity ?? null,
      registration_open: settings?.registration_open ?? null,
    };
  });

  return {
    source: "live",
    weekendItems: buildWeekendItems(rows),
  };
}
