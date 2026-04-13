import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchCalendarEvent = {
  id: string;
  ministryId: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  category: string;
  visibility: string;
  location: string | null;
  approvalStatus: string;
  rsvpEnabled: boolean;
  viewerRsvpStatus: "yes" | "no" | "maybe" | null;
  ministryName: string | null;
};

export type ChurchCalendarData = {
  events: ChurchCalendarEvent[];
  categoryCounts: Array<{
    category: string;
    count: number;
  }>;
  pendingApprovals: ChurchCalendarEvent[];
};

const CALENDAR_LOOKBACK_DAYS = 30;
const CALENDAR_LOOKAHEAD_DAYS = 180;

function getCalendarWindow() {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  start.setDate(start.getDate() - CALENDAR_LOOKBACK_DAYS);
  end.setDate(end.getDate() + CALENDAR_LOOKAHEAD_DAYS);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function allowedVisibilities(session: ChurchAppSession) {
  return session.appContext.roleId === "member"
    ? ["public", "members"]
    : ["public", "members", "leaders"];
}

function buildPreviewCalendarData(): ChurchCalendarData {
  return {
    events: [],
    categoryCounts: [],
    pendingApprovals: [],
  };
}

function buildCategoryCounts(events: ChurchCalendarEvent[]) {
  return Array.from(
    events.reduce((counts, event) => {
      counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

function buildPendingApprovals(
  events: ChurchCalendarEvent[],
  session: ChurchAppSession,
) {
  if (session.appContext.roleId === "member") {
    return [];
  }

  return events
    .filter((event) => event.approvalStatus !== "approved")
    .slice(0, 6);
}

export async function getChurchCalendarData(
  session: ChurchAppSession,
): Promise<ChurchCalendarData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewCalendarData();
  }

  const visibility = allowedVisibilities(session);
  const activeProfileId = await resolveActiveChurchProfileId(session);
  const { startIso, endIso } = getCalendarWindow();

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      ministry_id: string | null;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string;
      category: string;
      visibility: string;
      location: string | null;
      approval_status: string;
      rsvp_enabled: boolean;
      viewer_rsvp_status: "yes" | "no" | "maybe" | null;
      ministry_name: string | null;
    }>(
      `
        select
          event.id,
          event.title,
          event.description,
          event.ministry_id,
          event.starts_at,
          event.ends_at,
          event.category,
          event.visibility,
          event.location,
          event.approval_status::text as approval_status,
          event.rsvp_enabled,
          event_rsvp.status::text as viewer_rsvp_status,
          ministry.name as ministry_name
        from public.events event
        left join public.ministries ministry
          on ministry.id = event.ministry_id
        left join public.event_rsvps event_rsvp
          on event_rsvp.event_id = event.id
         and event_rsvp.user_id = $3
        where event.church_id = $1
          and event.starts_at >= $4
          and event.starts_at <= $5
          and event.visibility = any($2::text[])
        order by event.starts_at asc
        limit 240
      `,
      [session.appContext.church.id, visibility, activeProfileId, startIso, endIso],
    );

    const events = result.rows.map((row) => ({
      id: row.id,
      ministryId: row.ministry_id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      category: row.category,
      visibility: row.visibility,
      location: row.location,
      approvalStatus: row.approval_status,
      rsvpEnabled: row.rsvp_enabled,
      viewerRsvpStatus: row.viewer_rsvp_status,
      ministryName: row.ministry_name,
    }));

    return {
      events,
      categoryCounts: buildCategoryCounts(events),
      pendingApprovals: buildPendingApprovals(events, session),
    };
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("events")
    .select(
      "id, ministry_id, title, description, starts_at, ends_at, category, visibility, location, approval_status, rsvp_enabled, ministries(name)",
    )
    .eq("church_id", session.appContext.church.id)
    .gte("starts_at", startIso)
    .lte("starts_at", endIso)
    .in("visibility", visibility)
    .order("starts_at", { ascending: true })
    .limit(240);

  const eventIds = data?.map((row) => row.id) ?? [];
  const { data: rsvpRows } = eventIds.length && activeProfileId
    ? await supabase
        .from("event_rsvps")
        .select("event_id, status")
        .eq("user_id", activeProfileId)
        .in("event_id", eventIds)
    : { data: [] as Array<{ event_id: string; status: "yes" | "no" | "maybe" }> };

  const rsvpByEventId = new Map(
    (rsvpRows ?? []).map((row) => [row.event_id, row.status]),
  );

  const events =
    data?.map((row) => ({
      id: row.id,
      ministryId: row.ministry_id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      category: row.category,
      visibility: row.visibility,
      location: row.location,
      approvalStatus: row.approval_status,
      rsvpEnabled: row.rsvp_enabled,
      viewerRsvpStatus: rsvpByEventId.get(row.id) ?? null,
      ministryName:
        row.ministries && typeof row.ministries === "object" && "name" in row.ministries
          ? String((row.ministries as { name: unknown }).name)
          : null,
    })) ?? [];

  return {
    events,
    categoryCounts: buildCategoryCounts(events),
    pendingApprovals: buildPendingApprovals(events, session),
  };
}
