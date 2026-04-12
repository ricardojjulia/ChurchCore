"use server";

import { revalidatePath } from "next/cache";

import { getSession, requireChurchSession } from "@/lib/auth";
import { persistCalendarBoardState } from "@/lib/application-state-store";
import type { CalendarBoardState } from "@/lib/application-state";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

const eventCategories = [
  "general",
  "informational",
  "administrative",
  "ministry",
  "internal",
  "liturgical",
  "prayer",
  "outreach",
  "worship",
] as const;

const eventVisibilities = ["public", "members", "leaders"] as const;
const rsvpStatuses = ["yes", "no", "maybe"] as const;

type EventCategory = (typeof eventCategories)[number];
type EventVisibility = (typeof eventVisibilities)[number];
type EventRsvpStatus = (typeof rsvpStatuses)[number];

function canManageEvents(roleId: string) {
  return roleId === "church-admin" || roleId === "pastor" || roleId === "ministry-leader";
}

function parseBoolean(value: FormDataEntryValue | null) {
  if (value === null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1";
}

function parseEventInput(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "general").trim();
  const visibilityRaw = String(formData.get("visibility") ?? "members").trim();
  const ministryId = String(formData.get("ministryId") ?? "").trim() || null;
  const rsvpEnabled = parseBoolean(formData.get("rsvpEnabled"));

  if (!title) {
    throw new Error("Event title is required.");
  }

  if (!startsAtRaw || !endsAtRaw) {
    throw new Error("Both start and end times are required.");
  }

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Event times must be valid dates.");
  }

  if (endsAt <= startsAt) {
    throw new Error("End time must be after start time.");
  }

  const category = eventCategories.find((value) => value === categoryRaw);
  const visibility = eventVisibilities.find((value) => value === visibilityRaw);

  if (!category) {
    throw new Error("Event category is invalid.");
  }

  if (!visibility) {
    throw new Error("Event visibility is invalid.");
  }

  return {
    title,
    description,
    location,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    category: category as EventCategory,
    visibility: visibility as EventVisibility,
    ministryId,
    rsvpEnabled,
  };
}

function parseEventId(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "").trim();

  if (!eventId) {
    throw new Error("Event id is required.");
  }

  return eventId;
}

function parseRsvpStatus(formData: FormData) {
  const rawValue = String(formData.get("status") ?? "").trim();
  const status = rsvpStatuses.find((value) => value === rawValue);

  if (!status) {
    throw new Error("RSVP status is invalid.");
  }

  return status as EventRsvpStatus;
}

async function revalidateCalendarRoutes() {
  revalidatePath("/app/calendar");
  revalidatePath("/app/member");
}

export async function persistCalendarBoardStateAction(
  state: CalendarBoardState,
) {
  const session = await getSession();

  if (!session) {
    throw new Error("No active session.");
  }

  await persistCalendarBoardState(session, state);
  revalidatePath("/app/calendar");
}

export async function createCalendarEventAction(formData: FormData) {
  const session = await requireChurchSession("/app/calendar");

  if (!canManageEvents(session.appContext.roleId)) {
    throw new Error("Only church management roles can create events.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Calendar write actions require tenant backend configuration.");
  }

  const event = parseEventInput(formData);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.events (
          church_id,
          ministry_id,
          created_by,
          title,
          description,
          location,
          starts_at,
          ends_at,
          category,
          visibility,
          rsvp_enabled,
          approval_status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending'::public.approval_status)
      `,
      [
        session.appContext.church.id,
        event.ministryId,
        session.userId,
        event.title,
        event.description,
        event.location,
        event.startsAt,
        event.endsAt,
        event.category,
        event.visibility,
        event.rsvpEnabled,
      ],
    );

    await revalidateCalendarRoutes();
    return;
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("events").insert({
    church_id: session.appContext.church.id,
    ministry_id: event.ministryId,
    created_by: session.userId,
    title: event.title,
    description: event.description,
    location: event.location,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    category: event.category,
    visibility: event.visibility,
    rsvp_enabled: event.rsvpEnabled,
    approval_status: "pending",
  });

  if (error) {
    throw new Error(error.message);
  }

  await revalidateCalendarRoutes();
}

export async function updateCalendarEventAction(formData: FormData) {
  const session = await requireChurchSession("/app/calendar");

  if (!canManageEvents(session.appContext.roleId)) {
    throw new Error("Only church management roles can update events.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Calendar write actions require tenant backend configuration.");
  }

  const eventId = parseEventId(formData);
  const event = parseEventInput(formData);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.events
        set
          ministry_id = $1,
          title = $2,
          description = $3,
          location = $4,
          starts_at = $5,
          ends_at = $6,
          category = $7,
          visibility = $8,
          rsvp_enabled = $9
        where id = $10
          and church_id = $11
      `,
      [
        event.ministryId,
        event.title,
        event.description,
        event.location,
        event.startsAt,
        event.endsAt,
        event.category,
        event.visibility,
        event.rsvpEnabled,
        eventId,
        session.appContext.church.id,
      ],
    );

    await revalidateCalendarRoutes();
    return;
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("events")
    .update({
      ministry_id: event.ministryId,
      title: event.title,
      description: event.description,
      location: event.location,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      category: event.category,
      visibility: event.visibility,
      rsvp_enabled: event.rsvpEnabled,
    })
    .eq("id", eventId)
    .eq("church_id", session.appContext.church.id);

  if (error) {
    throw new Error(error.message);
  }

  await revalidateCalendarRoutes();
}

export async function deleteCalendarEventAction(formData: FormData) {
  const session = await requireChurchSession("/app/calendar");

  if (!canManageEvents(session.appContext.roleId)) {
    throw new Error("Only church management roles can delete events.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Calendar write actions require tenant backend configuration.");
  }

  const eventId = parseEventId(formData);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        delete from public.events
        where id = $1
          and church_id = $2
      `,
      [eventId, session.appContext.church.id],
    );

    await revalidateCalendarRoutes();
    return;
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("church_id", session.appContext.church.id);

  if (error) {
    throw new Error(error.message);
  }

  await revalidateCalendarRoutes();
}

export async function respondToCalendarEventRsvpAction(formData: FormData) {
  const session = await requireChurchSession("/app/calendar");

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    throw new Error("Calendar RSVP actions require tenant backend configuration.");
  }

  const eventId = parseEventId(formData);
  const status = parseRsvpStatus(formData);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (shouldUseLocalTenantFallback()) {
    const eventResult = await queryTenantLocalDb<{ rsvp_enabled: boolean }>(
      `
        select event.rsvp_enabled
        from public.events event
        where event.id = $1
          and event.church_id = $2
        limit 1
      `,
      [eventId, session.appContext.church.id],
    );

    const event = eventResult.rows[0];

    if (!event) {
      throw new Error("Event not found.");
    }

    if (!event.rsvp_enabled) {
      throw new Error("RSVP is disabled for this event.");
    }

    await queryTenantLocalDb(
      `
        insert into public.event_rsvps (event_id, user_id, status, note)
        values ($1, $2, $3::public.rsvp_status, $4)
        on conflict (event_id, user_id)
        do update
        set
          status = excluded.status,
          note = excluded.note
      `,
      [eventId, session.userId, status, note],
    );

    await revalidateCalendarRoutes();
    return;
  }

  const supabase = await createTenantServerClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, rsvp_enabled")
    .eq("id", eventId)
    .eq("church_id", session.appContext.church.id)
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message);
  }

  if (!event) {
    throw new Error("Event not found.");
  }

  if (!event.rsvp_enabled) {
    throw new Error("RSVP is disabled for this event.");
  }

  const { error } = await supabase.from("event_rsvps").upsert(
    {
      event_id: eventId,
      user_id: session.userId,
      status,
      note,
    },
    {
      onConflict: "event_id,user_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  await revalidateCalendarRoutes();
}
