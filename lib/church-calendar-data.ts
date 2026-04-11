import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  hasSupabaseEnv,
  shouldUseLocalSupabaseDbFallback,
} from "@/lib/supabase/config";
import { queryLocalSupabaseDb } from "@/lib/supabase/local-db";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type ChurchCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  category: string;
  visibility: string;
  location: string | null;
  approvalStatus: string;
  rsvpEnabled: boolean;
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
  if (!hasSupabaseEnv() || session.source !== "supabase") {
    return buildPreviewCalendarData();
  }

  const visibility = allowedVisibilities(session);

  if (shouldUseLocalSupabaseDbFallback()) {
    const result = await queryLocalSupabaseDb<{
      id: string;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string;
      category: string;
      visibility: string;
      location: string | null;
      approval_status: string;
      rsvp_enabled: boolean;
      ministry_name: string | null;
    }>(
      `
        select
          event.id,
          event.title,
          event.description,
          event.starts_at,
          event.ends_at,
          event.category,
          event.visibility,
          event.location,
          event.approval_status::text as approval_status,
          event.rsvp_enabled,
          ministry.name as ministry_name
        from public.events event
        left join public.ministries ministry
          on ministry.id = event.ministry_id
        where event.church_id = $1
          and event.starts_at >= timezone('utc', now())
          and event.visibility = any($2::text[])
        order by event.starts_at asc
        limit 24
      `,
      [session.appContext.church.id, visibility],
    );

    const events = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      category: row.category,
      visibility: row.visibility,
      location: row.location,
      approvalStatus: row.approval_status,
      rsvpEnabled: row.rsvp_enabled,
      ministryName: row.ministry_name,
    }));

    return {
      events,
      categoryCounts: buildCategoryCounts(events),
      pendingApprovals: buildPendingApprovals(events, session),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("events")
    .select(
      "id, title, description, starts_at, ends_at, category, visibility, location, approval_status, rsvp_enabled, ministries(name)",
    )
    .eq("church_id", session.appContext.church.id)
    .gte("starts_at", new Date().toISOString())
    .in("visibility", visibility)
    .order("starts_at", { ascending: true })
    .limit(24);

  const events =
    data?.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      category: row.category,
      visibility: row.visibility,
      location: row.location,
      approvalStatus: row.approval_status,
      rsvpEnabled: row.rsvp_enabled,
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
