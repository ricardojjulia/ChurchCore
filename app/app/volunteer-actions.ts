"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

const SCHEDULES_PATH = "/app/church-admin/volunteers/schedules";

async function requireAdminSession() {
  const session = await requireChurchSession(SCHEDULES_PATH);
  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Unauthorized");
  }
  return session;
}

// ── Create service plan ──────────────────────────────────────

export type CreateServicePlanInput = {
  name: string;
  serviceDate: string;
  eventId?: string;
  serviceTime?: string;
  serviceType?: "worship" | "prayer" | "youth" | "special_event" | "class" | "other";
  scriptureReference?: string;
  sermonTitle?: string;
  sermonSpeaker?: string;
  notes?: string;
  templateId?: string;
};

async function resolveScopedEventId(
  churchId: string,
  eventId?: string,
): Promise<{ eventId: string | null; error?: string }> {
  if (!eventId) {
    return { eventId: null };
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `select id from public.events where id = $1 and church_id = $2 limit 1`,
      [eventId, churchId],
    );

    if (!result.rows[0]?.id) {
      return { eventId: null, error: "Linked event must belong to this church." };
    }

    return { eventId };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("church_id", churchId)
    .single();

  if (error || !data?.id) {
    return { eventId: null, error: "Linked event must belong to this church." };
  }

  return { eventId: data.id };
}

export async function createServicePlanAction(
  input: CreateServicePlanInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (!input.name.trim() || !input.serviceDate) {
    return { ok: false, error: "Name and service date are required." };
  }

  const linkedEvent = await resolveScopedEventId(churchId, input.eventId);
  if (linkedEvent.error) {
    return { ok: false, error: linkedEvent.error };
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.service_plans
         (church_id, event_id, name, service_date, service_time, service_type,
          scripture_reference, sermon_title, sermon_speaker, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id`,
      [
        churchId,
        linkedEvent.eventId,
        input.name.trim(),
        input.serviceDate,
        input.serviceTime ?? null,
        input.serviceType ?? "worship",
        input.scriptureReference ?? null,
        input.sermonTitle ?? null,
        input.sermonSpeaker ?? null,
        input.notes ?? null,
        profileId,
      ],
    );
    const planId = result.rows[0]?.id;
    if (!planId) return { ok: false, error: "Failed to create plan." };

    // Apply template positions if provided
    if (input.templateId) {
      const tmpl = await queryTenantLocalDb<{ positions: string }>(
        `select positions from public.service_plan_templates where id = $1 and church_id = $2`,
        [input.templateId, churchId],
      );
      const positions = tmpl.rows[0]?.positions;
      if (positions) {
        const parsed: Array<{ roleName: string; quantity: number }> =
          typeof positions === "string" ? JSON.parse(positions) : positions;
        for (let i = 0; i < parsed.length; i++) {
          await queryTenantLocalDb(
            `insert into public.service_plan_positions (plan_id, church_id, role_name, quantity_needed, sort_order)
             values ($1, $2, $3, $4, $5)`,
            [planId, churchId, parsed[i].roleName, parsed[i].quantity, i],
          );
        }
      }
    }

    revalidatePath(SCHEDULES_PATH);
    return { ok: true, id: planId };
  }

  const supabase = await createTenantServerClient();
  const { data: plan, error } = await supabase.from("service_plans").insert({
    church_id: churchId,
    event_id: linkedEvent.eventId,
    name: input.name.trim(),
    service_date: input.serviceDate,
    service_time: input.serviceTime ?? null,
    service_type: input.serviceType ?? "worship",
    scripture_reference: input.scriptureReference ?? null,
    sermon_title: input.sermonTitle ?? null,
    sermon_speaker: input.sermonSpeaker ?? null,
    notes: input.notes ?? null,
    created_by: profileId,
  }).select("id").single();

  if (error || !plan) return { ok: false, error: error?.message ?? "Failed." };
  revalidatePath(SCHEDULES_PATH);
  return { ok: true, id: plan.id };
}

export type UpdateServicePlanDetailsInput = {
  planId: string;
  name: string;
  eventId?: string;
  serviceType: "worship" | "prayer" | "youth" | "special_event" | "class" | "other";
  serviceDate: string;
  serviceTime?: string;
  scriptureReference?: string;
  sermonTitle?: string;
  sermonSpeaker?: string;
  notes?: string;
};

export async function updateServicePlanDetailsAction(
  input: UpdateServicePlanDetailsInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (!input.name.trim() || !input.serviceDate) {
    return { ok: false, error: "Name and service date are required." };
  }

  const linkedEvent = await resolveScopedEventId(churchId, input.eventId);
  if (linkedEvent.error) {
    return { ok: false, error: linkedEvent.error };
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.service_plans
       set event_id = $3,
           name = $4,
           service_type = $5,
           service_date = $6,
           service_time = $7,
           scripture_reference = $8,
           sermon_title = $9,
           sermon_speaker = $10,
           notes = $11,
           updated_at = now()
       where id = $1 and church_id = $2`,
      [
        input.planId,
        churchId,
        linkedEvent.eventId,
        input.name.trim(),
        input.serviceType,
        input.serviceDate,
        input.serviceTime ?? null,
        input.scriptureReference ?? null,
        input.sermonTitle ?? null,
        input.sermonSpeaker ?? null,
        input.notes ?? null,
      ],
    );
    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    revalidatePath(SCHEDULES_PATH);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("service_plans")
    .update({
      event_id: linkedEvent.eventId,
      name: input.name.trim(),
      service_type: input.serviceType,
      service_date: input.serviceDate,
      service_time: input.serviceTime ?? null,
      scripture_reference: input.scriptureReference ?? null,
      sermon_title: input.sermonTitle ?? null,
      sermon_speaker: input.sermonSpeaker ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.planId)
    .eq("church_id", churchId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  revalidatePath(SCHEDULES_PATH);
  return { ok: true };
}

export type AddRunOfServiceItemInput = {
  planId: string;
  title: string;
  itemType?: "segment" | "song" | "reading" | "prayer" | "sermon" | "announcement" | "other";
  startsAt?: string;
  endsAt?: string;
  leaderName?: string;
  notes?: string;
  attachmentUrl?: string;
  sortOrder?: number;
};

export async function addRunOfServiceItemAction(
  input: AddRunOfServiceItemInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (!input.title.trim()) {
    return { ok: false, error: "Run-of-service item title is required." };
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.service_plan_items
         (plan_id, church_id, starts_at, ends_at, title, item_type, leader_name, notes, attachment_url, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        input.planId,
        churchId,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.title.trim(),
        input.itemType ?? "segment",
        input.leaderName ?? null,
        input.notes ?? null,
        input.attachmentUrl ?? null,
        input.sortOrder ?? 0,
      ],
    );
    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    return { ok: true, id: result.rows[0]?.id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("service_plan_items")
    .insert({
      plan_id: input.planId,
      church_id: churchId,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      title: input.title.trim(),
      item_type: input.itemType ?? "segment",
      leader_name: input.leaderName ?? null,
      notes: input.notes ?? null,
      attachment_url: input.attachmentUrl ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true, id: data?.id };
}

// ── Publish / complete plan ──────────────────────────────────

export async function updateServicePlanStatusAction(
  planId: string,
  status: "draft" | "published" | "complete" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.service_plans set status = $3 where id = $1 and church_id = $2`,
      [planId, churchId, status],
    );
    revalidatePath(`${SCHEDULES_PATH}/${planId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("service_plans")
    .update({ status }).eq("id", planId).eq("church_id", churchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${SCHEDULES_PATH}/${planId}`);
  return { ok: true };
}

// ── Add position to plan ─────────────────────────────────────

export async function addPlanPositionAction(input: {
  planId: string;
  roleName: string;
  quantityNeeded: number;
  sortOrder?: number;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.service_plan_positions (plan_id, church_id, role_name, quantity_needed, sort_order)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [input.planId, churchId, input.roleName.trim(), input.quantityNeeded, input.sortOrder ?? 0],
    );
    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    return { ok: true, id: result.rows[0]?.id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase.from("service_plan_positions").insert({
    plan_id: input.planId, church_id: churchId, role_name: input.roleName.trim(),
    quantity_needed: input.quantityNeeded, sort_order: input.sortOrder ?? 0,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true, id: data?.id };
}

// ── Assign volunteer to position ─────────────────────────────

export async function assignVolunteerAction(input: {
  planId: string;
  positionId: string;
  profileId: string;
  roleName: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  let linkedEventId: string | null = null;

  // Conflict check: is this volunteer already assigned on the same day?
  const datePrefix = input.startsAt.slice(0, 10);

  if (shouldUseLocalTenantFallback()) {
    const planResult = await queryTenantLocalDb<{ event_id: string | null }>(
      `select event_id from public.service_plans where id = $1 and church_id = $2 limit 1`,
      [input.planId, churchId],
    );
    linkedEventId = planResult.rows[0]?.event_id ?? null;

    const conflict = await queryTenantLocalDb<{ id: string }>(
      `select vs.id from public.volunteer_shifts vs
       join public.service_plans sp on sp.id = vs.plan_id
       where vs.assigned_user_id = $1
         and vs.church_id = $2
         and sp.service_date = $3::date
         and vs.confirmation_status != 'declined'`,
      [input.profileId, churchId, datePrefix],
    );
    if (conflict.rows.length > 0) {
      return { ok: false, error: "This volunteer is already assigned on this service date." };
    }

    await queryTenantLocalDb(
      `insert into public.volunteer_shifts
         (church_id, event_id, plan_id, position_id, assigned_user_id, title, starts_at, ends_at, status, confirmation_status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'assigned', 'pending')`,
      [
        churchId,
        linkedEventId,
        input.planId,
        input.positionId,
        input.profileId,
        input.roleName,
        input.startsAt,
        input.endsAt,
      ],
    );
    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { data: plan, error: planError } = await supabase
    .from("service_plans")
    .select("event_id")
    .eq("id", input.planId)
    .eq("church_id", churchId)
    .single();

  if (planError) {
    return { ok: false, error: planError.message };
  }

  linkedEventId = plan?.event_id ?? null;

  const { error } = await supabase.from("volunteer_shifts").insert({
    church_id: churchId,
    event_id: linkedEventId,
    plan_id: input.planId,
    position_id: input.positionId,
    assigned_user_id: input.profileId, title: input.roleName,
    starts_at: input.startsAt, ends_at: input.endsAt,
    status: "assigned", confirmation_status: "pending",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true };
}

// ── Remove assignment ────────────────────────────────────────

export async function removeAssignmentAction(
  shiftId: string,
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `delete from public.volunteer_shifts where id = $1 and church_id = $2`,
      [shiftId, churchId],
    );
    revalidatePath(`${SCHEDULES_PATH}/${planId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("volunteer_shifts")
    .delete().eq("id", shiftId).eq("church_id", churchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${SCHEDULES_PATH}/${planId}`);
  return { ok: true };
}

// ── Volunteer responds (confirm / decline) ───────────────────

export async function respondToShiftAction(
  shiftId: string,
  response: "confirmed" | "declined",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/member/schedule");
  const profileId = session.profile.id;
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.volunteer_shifts
       set confirmation_status = $3,
           decline_reason = $4,
           responded_at = now(),
           status = case when $3 = 'confirmed' then 'confirmed' else 'open' end
       where id = $1 and assigned_user_id = $2 and church_id = $5`,
      [shiftId, profileId, response, reason ?? null, churchId],
    );
    revalidatePath("/app/member/schedule");
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("volunteer_shifts")
    .update({
      confirmation_status: response,
      decline_reason: reason ?? null,
      responded_at: new Date().toISOString(),
      status: response === "confirmed" ? "confirmed" : "open",
    })
    .eq("id", shiftId)
    .eq("assigned_user_id", profileId)
    .eq("church_id", churchId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/member/schedule");
  return { ok: true };
}

// ── Reminder audit logging ───────────────────────────────────

export async function sendVolunteerReminderAction(input: {
  planId: string;
  shiftId: string;
  channel?: "manual" | "email" | "sms" | "push";
  note?: string;
}): Promise<{ ok: boolean; sentAt?: string; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  const sentBy = session.profile.id;
  const channel = input.channel ?? "manual";

  if (shouldUseLocalTenantFallback()) {
    const shiftResult = await queryTenantLocalDb<{
      assigned_user_id: string | null;
      confirmation_status: string;
    }>(
      `select assigned_user_id, confirmation_status
       from public.volunteer_shifts
       where id = $1 and church_id = $2 and plan_id = $3
       limit 1`,
      [input.shiftId, churchId, input.planId],
    );

    const shift = shiftResult.rows[0];
    if (!shift) {
      return { ok: false, error: "Shift not found for this plan." };
    }
    if (!shift.assigned_user_id) {
      return { ok: false, error: "Cannot remind an unassigned shift." };
    }
    if (shift.confirmation_status !== "pending") {
      return { ok: false, error: "Only pending volunteer responses can be reminded." };
    }

    const reminderResult = await queryTenantLocalDb<{ sent_at: string }>(
      `insert into public.volunteer_shift_reminders
         (church_id, shift_id, reminded_profile_id, reminder_channel, reminder_note, sent_by)
       values ($1, $2, $3, $4, $5, $6)
       returning sent_at::text`,
      [churchId, input.shiftId, shift.assigned_user_id, channel, input.note?.trim() || null, sentBy],
    );

    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    revalidatePath(SCHEDULES_PATH);
    return { ok: true, sentAt: reminderResult.rows[0]?.sent_at };
  }

  const supabase = await createTenantServerClient();
  const { data: shift, error: shiftError } = await supabase
    .from("volunteer_shifts")
    .select("assigned_user_id, confirmation_status")
    .eq("id", input.shiftId)
    .eq("church_id", churchId)
    .eq("plan_id", input.planId)
    .single();

  if (shiftError || !shift) {
    return { ok: false, error: "Shift not found for this plan." };
  }
  if (!shift.assigned_user_id) {
    return { ok: false, error: "Cannot remind an unassigned shift." };
  }
  if (shift.confirmation_status !== "pending") {
    return { ok: false, error: "Only pending volunteer responses can be reminded." };
  }

  const { data: reminder, error } = await supabase
    .from("volunteer_shift_reminders")
    .insert({
      church_id: churchId,
      shift_id: input.shiftId,
      reminded_profile_id: shift.assigned_user_id,
      reminder_channel: channel,
      reminder_note: input.note?.trim() || null,
      sent_by: sentBy,
    })
    .select("sent_at")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  revalidatePath(SCHEDULES_PATH);
  return { ok: true, sentAt: reminder?.sent_at ?? new Date().toISOString() };
}

// ── Log volunteer hours ──────────────────────────────────────

export async function logVolunteerHoursAction(input: {
  profileId: string;
  shiftId?: string;
  serviceDate: string;
  hours: number;
  roleName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  const loggedBy = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.volunteer_hours_log (church_id, profile_id, shift_id, service_date, hours, role_name, logged_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [churchId, input.profileId, input.shiftId ?? null, input.serviceDate, input.hours, input.roleName ?? null, loggedBy],
    );
    revalidatePath("/app/church-admin/volunteers");
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("volunteer_hours_log").insert({
    church_id: churchId, profile_id: input.profileId, shift_id: input.shiftId ?? null,
    service_date: input.serviceDate, hours: input.hours, role_name: input.roleName ?? null, logged_by: loggedBy,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/church-admin/volunteers");
  return { ok: true };
}

// ── Save template ────────────────────────────────────────────

export async function saveServicePlanTemplateAction(input: {
  name: string;
  positions: Array<{ roleName: string; quantity: number }>;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.service_plan_templates (church_id, name, positions)
       values ($1, $2, $3)`,
      [churchId, input.name.trim(), JSON.stringify(input.positions)],
    );
    revalidatePath(SCHEDULES_PATH);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("service_plan_templates").insert({
    church_id: churchId, name: input.name.trim(), positions: input.positions,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(SCHEDULES_PATH);
  return { ok: true };
}
