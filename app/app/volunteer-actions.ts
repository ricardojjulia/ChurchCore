"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireChurchSession, type ChurchAppSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/actions/audit";
import { checkVolunteerBurnout } from "@/lib/burnout-calculator";
import { getChurchSkillOptions, getServicePlanDetail, getVolunteerPool } from "@/lib/volunteer-data";
import {
  INELIGIBLE_LABEL,
  proposePlanFill,
  rankVolunteersForPosition,
  shiftWindowForPlan,
  type OpenSlot,
  type ProposedAssignment,
  type RankedVolunteer,
} from "@/lib/rotation-planner";
import {
  createTenantServerClient,
  createTenantAdminClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

const SCHEDULES_PATH = "/app/church-admin/volunteers/schedules";

// Matches app/calendar/actions.ts's canManageEvents(roleId): church-wide
// church-admin/pastor/ministry-leader access, the same set already allowed
// by the can_manage_church() RLS helper on these tables. service_plans has
// no ministry_id column, so this is intentionally not scoped to "only the
// leader's own ministry" — that scoping is deferred to a later story.
function canManageServicePlans(roleId: string) {
  return roleId === "church-admin" || roleId === "pastor" || roleId === "ministry-leader";
}

async function requireServicePlanWriteAccess() {
  const session = await requireChurchSession(SCHEDULES_PATH);
  if (!canManageServicePlans(session.appContext.roleId)) {
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

// ── Song library shared helpers ──────────────────────────────
// Small, branch-aware (local-fallback vs Supabase) helpers shared by the
// song-library actions below and by reorderServicePlanItemsAction's
// cancelled-plan check. Keeping the branch logic in one place per concern
// is deliberate: finance-import's Supabase branch previously drifted from
// its local branch on a similar piece of shared behavior (see project
// memory), so each of these implements both branches identically here
// rather than being re-implemented per call site.

type WritableServicePlan = { id: string; status: string; serviceDate: string };

async function fetchServicePlanForWrite(
  churchId: string,
  planId: string,
): Promise<WritableServicePlan | null> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; status: string; service_date: string }>(
      `select id, status, service_date::text from public.service_plans where id = $1 and church_id = $2 limit 1`,
      [planId, churchId],
    );
    const row = result.rows[0];
    return row ? { id: row.id, status: row.status, serviceDate: row.service_date } : null;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("service_plans")
    .select("id, status, service_date")
    .eq("id", planId)
    .eq("church_id", churchId)
    .maybeSingle();

  return data ? { id: data.id, status: data.status, serviceDate: data.service_date } : null;
}

type SongLibraryRow = {
  id: string;
  title: string;
  artist: string | null;
  defaultKey: string | null;
  defaultDurationSeconds: number | null;
  lastUsedDate: string | null;
};

async function fetchSongLibraryEntry(
  churchId: string,
  songLibraryId: string,
): Promise<SongLibraryRow | null> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      title: string;
      artist: string | null;
      default_key: string | null;
      default_duration_seconds: number | null;
      last_used_date: string | null;
    }>(
      `select id, title, artist, default_key, default_duration_seconds, last_used_date::text
       from public.song_library where id = $1 and church_id = $2 limit 1`,
      [songLibraryId, churchId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          title: row.title,
          artist: row.artist,
          defaultKey: row.default_key,
          defaultDurationSeconds: row.default_duration_seconds,
          lastUsedDate: row.last_used_date,
        }
      : null;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("song_library")
    .select("id, title, artist, default_key, default_duration_seconds, last_used_date")
    .eq("id", songLibraryId)
    .eq("church_id", churchId)
    .maybeSingle();

  return data
    ? {
        id: data.id,
        title: data.title,
        artist: data.artist,
        defaultKey: data.default_key,
        defaultDurationSeconds: data.default_duration_seconds,
        lastUsedDate: data.last_used_date,
      }
    : null;
}

async function fetchChurchRepeatWindowWeeks(churchId: string): Promise<number> {
  const DEFAULT_WEEKS = 12;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ song_repeat_window_weeks: number }>(
      `select song_repeat_window_weeks from public.churches where id = $1 limit 1`,
      [churchId],
    );
    return result.rows[0]?.song_repeat_window_weeks ?? DEFAULT_WEEKS;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("churches")
    .select("song_repeat_window_weeks")
    .eq("id", churchId)
    .maybeSingle();

  return data?.song_repeat_window_weeks ?? DEFAULT_WEEKS;
}

async function nextServicePlanItemSortOrder(churchId: string, planId: string): Promise<number> {
  if (shouldUseLocalTenantFallback()) {
    const sortResult = await queryTenantLocalDb<{ next_sort: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM public.service_plan_items WHERE plan_id = $1 AND church_id = $2`,
      [planId, churchId],
    );
    return sortResult.rows[0]?.next_sort ?? 0;
  }

  const supabase = await createTenantServerClient();
  const { data: sortData } = await supabase
    .from("service_plan_items")
    .select("sort_order")
    .eq("plan_id", planId)
    .eq("church_id", churchId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  return sortData != null ? (sortData.sort_order as number) + 1 : 0;
}

async function insertSongServicePlanItem(
  churchId: string,
  planId: string,
  song: SongLibraryRow,
): Promise<{ id?: string; error?: string }> {
  const sortOrder = await nextServicePlanItemSortOrder(churchId, planId);

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.service_plan_items
         (plan_id, church_id, title, item_type, sort_order, song_library_id, song_key, duration_seconds, artist)
       values ($1, $2, $3, 'song', $4, $5, $6, $7, $8)
       returning id`,
      [planId, churchId, song.title, sortOrder, song.id, song.defaultKey, song.defaultDurationSeconds, song.artist],
    );
    const id = result.rows[0]?.id;
    return id ? { id } : { error: "Failed to add song to service plan." };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("service_plan_items")
    .insert({
      plan_id: planId,
      church_id: churchId,
      title: song.title,
      item_type: "song",
      sort_order: sortOrder,
      song_library_id: song.id,
      song_key: song.defaultKey,
      duration_seconds: song.defaultDurationSeconds,
      artist: song.artist,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { error: error?.message ?? "Failed to add song to service plan." };
  }
  return { id: data.id };
}

function weeksBetweenDates(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  const diffMs = Math.abs(a.getTime() - b.getTime());
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

function computeSongRepeatWarning(
  serviceDate: string,
  lastUsedDate: string | null,
  windowWeeks: number,
): string | undefined {
  if (!lastUsedDate) return undefined;

  const weeks = weeksBetweenDates(serviceDate, lastUsedDate);
  if (weeks > windowWeeks) return undefined;

  return `Last used ${lastUsedDate} — ${weeks} weeks ago`;
}

export async function createServicePlanAction(
  input: CreateServicePlanInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireServicePlanWriteAccess();
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

    // Apply template positions if provided.
    // KNOWN GAP (pre-existing, not introduced by Story 2, left as-is per that
    // story's explicit scope): this local-fallback-only branch inserts
    // service_plan_positions rows by role_name text, with no role_type_id —
    // that column is now NOT NULL (Story 2's role-taxonomy migration), so
    // this insert would fail against a live schema. This code path is dead
    // in production (shouldUseLocalTenantFallback() is hardcoded to return
    // false — see lib/supabase/tenant.ts), and the Supabase branch of this
    // same action never implemented template application at all, so there is
    // no live regression today. Resolving template-driven position creation
    // to a role_type_id (by name lookup, on-the-fly creation, or otherwise)
    // is left for a follow-up story rather than widening this one's scope.
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
  const session = await requireServicePlanWriteAccess();
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
  songKey?: string;
  durationSeconds?: number;
  artist?: string;
};

export async function addRunOfServiceItemAction(
  input: AddRunOfServiceItemInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  if (!input.title.trim()) {
    return { ok: false, error: "Run-of-service item title is required." };
  }

  const isSong = input.itemType === "song";
  const songKey = isSong ? (input.songKey ?? null) : null;
  const durationSeconds = isSong ? (input.durationSeconds ?? null) : null;
  const artist = isSong ? (input.artist ?? null) : null;

  if (shouldUseLocalTenantFallback()) {
    const ownerCheck = await queryTenantLocalDb<{ id: string }>(
      `SELECT id FROM public.service_plans WHERE id = $1 AND church_id = $2`,
      [input.planId, churchId],
    );
    if (!ownerCheck.rows[0]?.id) {
      return { ok: false, error: "Service plan not found." };
    }

    const sortResult = await queryTenantLocalDb<{ next_sort: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM public.service_plan_items WHERE plan_id = $1 AND church_id = $2`,
      [input.planId, churchId],
    );
    const sortOrder = sortResult.rows[0]?.next_sort ?? 0;

    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.service_plan_items
         (plan_id, church_id, starts_at, ends_at, title, item_type, leader_name, notes, attachment_url, sort_order, song_key, duration_seconds, artist)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        sortOrder,
        songKey,
        durationSeconds,
        artist,
      ],
    );
    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    return { ok: true, id: result.rows[0]?.id };
  }

  const supabase = await createTenantServerClient();
  const { data: planOwner } = await supabase
    .from("service_plans")
    .select("id")
    .eq("id", input.planId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (!planOwner?.id) {
    return { ok: false, error: "Service plan not found." };
  }

  const { data: sortData } = await supabase
    .from("service_plan_items")
    .select("sort_order")
    .eq("plan_id", input.planId)
    .eq("church_id", churchId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const sortOrder = sortData != null ? (sortData.sort_order as number) + 1 : 0;

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
      sort_order: sortOrder,
      song_key: songKey,
      duration_seconds: durationSeconds,
      artist: artist,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true, id: data?.id };
}

// ── Remove a run-of-service item ─────────────────────────────
// Deletes the plan item only. The linked song_library row (if any) is never
// touched — it's a reusable church-wide catalog entry, not owned by any one
// plan's setlist.

export async function removeServicePlanItemAction(input: {
  planId: string;
  itemId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  const plan = await fetchServicePlanForWrite(churchId, input.planId);
  if (!plan) {
    return { ok: false, error: "Service plan not found." };
  }
  if (plan.status === "cancelled") {
    return { ok: false, error: "Cannot remove items on a cancelled service plan." };
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `DELETE FROM public.service_plan_items WHERE id = $1 AND plan_id = $2 AND church_id = $3 RETURNING id`,
      [input.itemId, input.planId, churchId],
    );
    if (!result.rows[0]?.id) {
      return { ok: false, error: "Run-of-service item not found." };
    }
    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("service_plan_items")
    .delete()
    .eq("id", input.itemId)
    .eq("plan_id", input.planId)
    .eq("church_id", churchId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) {
    return { ok: false, error: "Run-of-service item not found." };
  }
  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true };
}

// ── Reorder run-of-service items ─────────────────────────────

export type ReorderServicePlanItemsInput = {
  planId: string;
  orderedIds: string[];
};

export async function reorderServicePlanItemsAction(
  input: ReorderServicePlanItemsInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  if (!Array.isArray(input.orderedIds) || input.orderedIds.length === 0) {
    return { ok: false, error: "orderedIds must be a non-empty array." };
  }

  const plan = await fetchServicePlanForWrite(churchId, input.planId);
  if (!plan) {
    return { ok: false, error: "Service plan not found." };
  }
  if (plan.status === "cancelled") {
    return { ok: false, error: "Cannot reorder items on a cancelled service plan." };
  }

  if (shouldUseLocalTenantFallback()) {
    const existing = await queryTenantLocalDb<{ id: string }>(
      `SELECT id FROM public.service_plan_items WHERE plan_id = $1 AND church_id = $2`,
      [input.planId, churchId],
    );
    const existingSet = new Set(existing.rows.map((r) => r.id));
    const allValid =
      input.orderedIds.length === existingSet.size &&
      input.orderedIds.every((id) => existingSet.has(id));
    if (!allValid) {
      return { ok: false, error: "Invalid item IDs for this plan." };
    }

    // Sequential updates with no transaction — consistent with codebase pattern; partial failure leaves order inconsistent until next reorder.
    for (let i = 0; i < input.orderedIds.length; i++) {
      await queryTenantLocalDb(
        `UPDATE public.service_plan_items SET sort_order = $1 WHERE id = $2 AND church_id = $3`,
        [i, input.orderedIds[i], churchId],
      );
    }

    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { data: existing } = await supabase
    .from("service_plan_items")
    .select("id")
    .eq("plan_id", input.planId)
    .eq("church_id", churchId);

  const existingSet = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const allValid =
    input.orderedIds.length === existingSet.size &&
    input.orderedIds.every((id) => existingSet.has(id));
  if (!allValid) {
    return { ok: false, error: "Invalid item IDs for this plan." };
  }

  // Sequential updates with no transaction — consistent with codebase pattern; partial failure leaves order inconsistent until next reorder.
  for (let i = 0; i < input.orderedIds.length; i++) {
    await supabase
      .from("service_plan_items")
      .update({ sort_order: i })
      .eq("id", input.orderedIds[i])
      .eq("church_id", churchId);
  }

  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true };
}

// ── Publish / complete plan ──────────────────────────────────

export async function updateServicePlanStatusAction(
  planId: string,
  status: "draft" | "published" | "complete" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; service_date: string }>(
      `update public.service_plans set status = $3 where id = $1 and church_id = $2
       returning id, service_date::text`,
      [planId, churchId, status],
    );
    const updatedPlan = result.rows[0];

    // Completing a plan is the ONLY trigger for last_used_date — no cron, no
    // date-crossing job. Implemented identically on both branches below.
    if (status === "complete" && updatedPlan?.service_date) {
      await queryTenantLocalDb(
        `update public.song_library sl
         set last_used_date = $3::date
         from public.service_plan_items spi
         where spi.plan_id = $1
           and spi.church_id = $2
           and spi.song_library_id = sl.id`,
        [planId, churchId, updatedPlan.service_date],
      );
    }

    revalidatePath(`${SCHEDULES_PATH}/${planId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { data: updatedPlan, error } = await supabase
    .from("service_plans")
    .update({ status })
    .eq("id", planId)
    .eq("church_id", churchId)
    .select("id, service_date")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  if (status === "complete" && updatedPlan?.service_date) {
    const { data: linkedItems } = await supabase
      .from("service_plan_items")
      .select("song_library_id")
      .eq("plan_id", planId)
      .eq("church_id", churchId)
      .not("song_library_id", "is", null);

    const libraryIds = Array.from(
      new Set(
        (linkedItems ?? [])
          .map((item: { song_library_id: string | null }) => item.song_library_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (libraryIds.length > 0) {
      await supabase
        .from("song_library")
        .update({ last_used_date: updatedPlan.service_date })
        .eq("church_id", churchId)
        .in("id", libraryIds);
    }
  }

  revalidatePath(`${SCHEDULES_PATH}/${planId}`);
  return { ok: true };
}

// ── Role Taxonomy & Team Roster (Story 2) ────────────────────
// Church-wide, reusable service-plan role types (e.g. "Sound Tech",
// "Greeter"). service_plan_positions references these by role_type_id;
// display name is always resolved via a live join, never copied — unlike
// volunteer_shifts.title, which remains an intentional point-in-time
// snapshot taken at assignment time (see assignVolunteerAction below).

export type CreateRoleTypeInput = {
  name: string;
  description?: string;
  requiredSkills?: string[];
};

function duplicateRoleTypeNameError(name: string): string {
  return `A role type named '${name}' already exists.`;
}

// Defense in depth, mirroring addPlanPositionAction's server-side
// re-validation of client-supplied IDs: the MultiSelect UI is non-creatable
// (sourced from getChurchSkillOptions), but that's a UI constraint, not a
// server one. Reject any requiredSkills value that isn't currently a real
// skill on file for this church, rather than trusting the client.
async function validateRequiredSkills(
  session: ChurchAppSession,
  requiredSkills: string[],
): Promise<string | null> {
  if (requiredSkills.length === 0) return null;
  const validSkills = new Set(await getChurchSkillOptions(session));
  const invalid = requiredSkills.filter((skill) => !validSkills.has(skill));
  if (invalid.length > 0) {
    return `Unknown skill${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}.`;
  }
  return null;
}

export async function createRoleTypeAction(
  input: CreateRoleTypeInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, error: "Role name is required." };
  }
  const description = input.description?.trim() || null;
  const requiredSkills = input.requiredSkills ?? [];

  const skillsError = await validateRequiredSkills(session, requiredSkills);
  if (skillsError) {
    return { ok: false, error: skillsError };
  }

  if (shouldUseLocalTenantFallback()) {
    let id: string | undefined;
    try {
      const result = await queryTenantLocalDb<{ id: string }>(
        `insert into public.service_plan_role_types
           (church_id, name, description, required_skills, created_by)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [churchId, name, description, requiredSkills, profileId],
      );
      id = result.rows[0]?.id;
    } catch (err) {
      const code = (err as { code?: string } | null | undefined)?.code;
      if (code === "23505") {
        return { ok: false, error: duplicateRoleTypeNameError(name) };
      }
      throw err;
    }

    if (!id) {
      return { ok: false, error: "Failed to create role type." };
    }

    try {
      await logAuditEvent({
        tableName: "service_plan_role_types",
        recordId: id,
        operation: "INSERT",
        actorId: profileId,
        churchId,
        actorRole: session.appContext.roleId,
        newValues: { name, description, requiredSkills },
      });
    } catch (auditError) {
      console.error("Failed to log service_plan_role_types create audit event (local fallback):", auditError);
    }

    revalidatePath(SCHEDULES_PATH);
    return { ok: true, id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("service_plan_role_types")
    .insert({
      church_id: churchId,
      name,
      description,
      required_skills: requiredSkills,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: duplicateRoleTypeNameError(name) };
    }
    return { ok: false, error: error.message };
  }
  if (!data?.id) {
    return { ok: false, error: "Failed to create role type." };
  }

  try {
    await logAuditEvent({
      tableName: "service_plan_role_types",
      recordId: data.id,
      operation: "INSERT",
      actorId: profileId,
      churchId,
      actorRole: session.appContext.roleId,
      newValues: { name, description, requiredSkills },
    });
  } catch (auditError) {
    console.error("Failed to log service_plan_role_types create audit event:", auditError);
  }

  revalidatePath(SCHEDULES_PATH);
  return { ok: true, id: data.id };
}

export type UpdateRoleTypeInput = {
  roleTypeId: string;
  name: string;
  description?: string;
  requiredSkills?: string[];
};

// No audit event on rename/edit — matching this module's existing
// create-only audit asymmetry (Story 1's song_library only audits creates,
// not edits either).
export async function updateRoleTypeAction(
  input: UpdateRoleTypeInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, error: "Role name is required." };
  }
  const description = input.description?.trim() || null;
  const requiredSkills = input.requiredSkills ?? [];

  const skillsError = await validateRequiredSkills(session, requiredSkills);
  if (skillsError) {
    return { ok: false, error: skillsError };
  }

  if (shouldUseLocalTenantFallback()) {
    try {
      const result = await queryTenantLocalDb<{ id: string }>(
        `update public.service_plan_role_types
         set name = $3, description = $4, required_skills = $5, updated_at = now()
         where id = $1 and church_id = $2
         returning id`,
        [input.roleTypeId, churchId, name, description, requiredSkills],
      );
      if (!result.rows[0]?.id) {
        return { ok: false, error: "Role type not found." };
      }
    } catch (err) {
      const code = (err as { code?: string } | null | undefined)?.code;
      if (code === "23505") {
        return { ok: false, error: duplicateRoleTypeNameError(name) };
      }
      throw err;
    }

    revalidatePath(SCHEDULES_PATH);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("service_plan_role_types")
    .update({ name, description, required_skills: requiredSkills })
    .eq("id", input.roleTypeId)
    .eq("church_id", churchId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: duplicateRoleTypeNameError(name) };
    }
    return { ok: false, error: error.message };
  }
  if (!data?.id) {
    return { ok: false, error: "Role type not found." };
  }

  revalidatePath(SCHEDULES_PATH);
  return { ok: true };
}

// Naturally idempotent — two concurrent/duplicate calls both land on
// is_active = false with no error on the second call. Each call still
// audit-logs its own old/new is_active transition.
export async function deactivateRoleTypeAction(
  roleTypeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const current = await queryTenantLocalDb<{ is_active: boolean }>(
      `select is_active from public.service_plan_role_types where id = $1 and church_id = $2 limit 1`,
      [roleTypeId, churchId],
    );
    const wasActive = current.rows[0]?.is_active;
    if (wasActive === undefined) {
      return { ok: false, error: "Role type not found." };
    }

    await queryTenantLocalDb(
      `update public.service_plan_role_types
       set is_active = false, updated_at = now()
       where id = $1 and church_id = $2`,
      [roleTypeId, churchId],
    );

    try {
      await logAuditEvent({
        tableName: "service_plan_role_types",
        recordId: roleTypeId,
        operation: "UPDATE",
        actorId: session.profile.id,
        churchId,
        actorRole: session.appContext.roleId,
        oldValues: { isActive: wasActive },
        newValues: { isActive: false },
      });
    } catch (auditError) {
      console.error("Failed to log service_plan_role_types deactivate audit event (local fallback):", auditError);
    }

    revalidatePath(SCHEDULES_PATH);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { data: current } = await supabase
    .from("service_plan_role_types")
    .select("is_active")
    .eq("id", roleTypeId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (!current) {
    return { ok: false, error: "Role type not found." };
  }

  const { error } = await supabase
    .from("service_plan_role_types")
    .update({ is_active: false })
    .eq("id", roleTypeId)
    .eq("church_id", churchId);

  if (error) return { ok: false, error: error.message };

  try {
    await logAuditEvent({
      tableName: "service_plan_role_types",
      recordId: roleTypeId,
      operation: "UPDATE",
      actorId: session.profile.id,
      churchId,
      actorRole: session.appContext.roleId,
      oldValues: { isActive: current.is_active },
      newValues: { isActive: false },
    });
  } catch (auditError) {
    console.error("Failed to log service_plan_role_types deactivate audit event:", auditError);
  }

  revalidatePath(SCHEDULES_PATH);
  return { ok: true };
}

// ── Add position to plan ─────────────────────────────────────
// roleTypeId must reference an active service_plan_role_types row scoped to
// this church — validated on BOTH paths below (defense in depth: the server
// must not trust the UI only offering active role types).

export async function addPlanPositionAction(input: {
  planId: string;
  roleTypeId: string;
  quantityNeeded: number;
  sortOrder?: number;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  const plan = await fetchServicePlanForWrite(churchId, input.planId);
  if (!plan) {
    return { ok: false, error: "Service plan not found." };
  }

  if (shouldUseLocalTenantFallback()) {
    const roleTypeCheck = await queryTenantLocalDb<{ id: string }>(
      `select id from public.service_plan_role_types
       where id = $1 and church_id = $2 and is_active = true
       limit 1`,
      [input.roleTypeId, churchId],
    );
    if (!roleTypeCheck.rows[0]?.id) {
      return { ok: false, error: "A valid, active role type is required." };
    }

    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.service_plan_positions (plan_id, church_id, role_type_id, quantity_needed, sort_order)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [input.planId, churchId, input.roleTypeId, input.quantityNeeded, input.sortOrder ?? 0],
    );
    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    return { ok: true, id: result.rows[0]?.id };
  }

  const supabase = await createTenantServerClient();
  const { data: roleType } = await supabase
    .from("service_plan_role_types")
    .select("id")
    .eq("id", input.roleTypeId)
    .eq("church_id", churchId)
    .eq("is_active", true)
    .maybeSingle();

  if (!roleType?.id) {
    return { ok: false, error: "A valid, active role type is required." };
  }

  const { data, error } = await supabase.from("service_plan_positions").insert({
    plan_id: input.planId, church_id: churchId, role_type_id: input.roleTypeId,
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
  bypassBurnout?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  // Burnout check
  if (!input.bypassBurnout) {
    const burnoutResult = await checkVolunteerBurnout(churchId, input.profileId, input.startsAt);
    if (burnoutResult.isBurnedOut) {
      return { ok: false, error: `BURNOUT_WARNING: ${burnoutResult.reason}` };
    }
  }

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

    if (input.bypassBurnout) {
      try {
        await logAuditEvent({
          tableName: "volunteer_shifts",
          recordId: input.profileId,
          operation: "UPDATE",
          actorId: session.profile.id,
          churchId,
          actorRole: session.appContext.roleId,
          newValues: { burnout_bypass: true, roleName: input.roleName },
        });
      } catch (auditError) {
        console.error("Failed to log burnout bypass audit event (local fallback):", auditError);
      }
    }

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

  // Integrity: RLS on insert only checks church_id, so verify the position is
  // on this plan, the volunteer is in this church, and a slot is still open.
  const { data: position } = await supabase
    .from("service_plan_positions")
    .select("id, quantity_needed")
    .eq("id", input.positionId)
    .eq("plan_id", input.planId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (!position) return { ok: false, error: "Position not found on this plan." };

  const { data: volunteer } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", input.profileId)
    .eq("church_id", churchId)
    .is("merged_into_profile_id", null)
    .maybeSingle();
  if (!volunteer) return { ok: false, error: "Volunteer not found in this church." };

  const { count: filled, error: filledError } = await supabase
    .from("volunteer_shifts")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("position_id", input.positionId)
    .neq("confirmation_status", "declined");
  if (filledError) return { ok: false, error: filledError.message };
  if ((filled ?? 0) >= position.quantity_needed) {
    return { ok: false, error: "This position is already filled." };
  }

  // Same-day conflict check. Matches get_volunteer_pool()'s serving_on_date
  // (any non-declined shift starting that day), so a suggestion the planner
  // marks eligible is never refused here and vice versa.
  const nextDay = new Date(`${datePrefix}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const { data: conflicts, error: conflictError } = await supabase
    .from("volunteer_shifts")
    .select("id")
    .eq("church_id", churchId)
    .eq("assigned_user_id", input.profileId)
    .neq("confirmation_status", "declined")
    .gte("starts_at", `${datePrefix}T00:00:00`)
    .lt("starts_at", `${nextDay.toISOString().slice(0, 10)}T00:00:00`)
    .limit(1);
  if (conflictError) return { ok: false, error: conflictError.message };
  if (conflicts && conflicts.length > 0) {
    return { ok: false, error: "This volunteer is already assigned on this service date." };
  }

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

  if (input.bypassBurnout) {
    try {
      await logAuditEvent({
        tableName: "volunteer_shifts",
        recordId: input.profileId,
        operation: "UPDATE",
        actorId: session.profile.id,
        churchId,
        actorRole: session.appContext.roleId,
        newValues: { burnout_bypass: true, roleName: input.roleName },
      });
    } catch (auditError) {
      console.error("Failed to log burnout bypass audit event:", auditError);
    }
  }

  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true };
}

// ── Remove assignment ────────────────────────────────────────

export async function removeAssignmentAction(
  shiftId: string,
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
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
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;
  const sentBy = session.profile.id;
  const channel = input.channel ?? "manual";

  if (shouldUseLocalTenantFallback()) {
    const shiftResult = await queryTenantLocalDb<{
      assigned_user_id: string | null;
      confirmation_status: string;
      confirmation_token: string | null;
      confirmation_token_expires_at: string | null;
    }>(
      `select assigned_user_id, confirmation_status, confirmation_token, confirmation_token_expires_at
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

    let token = shift.confirmation_token;
    const expiresAt = shift.confirmation_token_expires_at ? new Date(shift.confirmation_token_expires_at) : null;
    const now = new Date();

    if (!token || !expiresAt || expiresAt < now) {
      token = crypto.randomBytes(16).toString("hex");
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 14);

      await queryTenantLocalDb(
        `update public.volunteer_shifts
         set confirmation_token = $3,
             confirmation_token_expires_at = $4
         where id = $1 and church_id = $2`,
        [input.shiftId, churchId, token, newExpiresAt.toISOString()],
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const confirmUrl = `${appUrl}/portal/volunteer/confirm/${token}`;
    const originalNote = input.note?.trim() || "";
    const finalNote = originalNote
      ? `${originalNote}\n\nConfirm here: ${confirmUrl}`
      : `Please confirm your volunteer assignment here: ${confirmUrl}`;

    const reminderResult = await queryTenantLocalDb<{ sent_at: string }>(
      `insert into public.volunteer_shift_reminders
         (church_id, shift_id, reminded_profile_id, reminder_channel, reminder_note, sent_by)
       values ($1, $2, $3, $4, $5, $6)
       returning sent_at::text`,
      [churchId, input.shiftId, shift.assigned_user_id, channel, finalNote, sentBy],
    );

    revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
    revalidatePath(SCHEDULES_PATH);
    return { ok: true, sentAt: reminderResult.rows[0]?.sent_at };
  }

  const supabase = await createTenantServerClient();
  const { data: shift, error: shiftError } = await supabase
    .from("volunteer_shifts")
    .select("assigned_user_id, confirmation_status, confirmation_token, confirmation_token_expires_at")
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

  let token = shift.confirmation_token;
  const expiresAt = shift.confirmation_token_expires_at ? new Date(shift.confirmation_token_expires_at) : null;
  const now = new Date();

  if (!token || !expiresAt || expiresAt < now) {
    token = crypto.randomBytes(16).toString("hex");
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 14);

    const { error: updateError } = await supabase
      .from("volunteer_shifts")
      .update({
        confirmation_token: token,
        confirmation_token_expires_at: newExpiresAt.toISOString(),
      })
      .eq("id", input.shiftId);

    if (updateError) {
      return { ok: false, error: `Failed to generate token: ${updateError.message}` };
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const confirmUrl = `${appUrl}/portal/volunteer/confirm/${token}`;
  const originalNote = input.note?.trim() || "";
  const finalNote = originalNote
    ? `${originalNote}\n\nConfirm here: ${confirmUrl}`
    : `Please confirm your volunteer assignment here: ${confirmUrl}`;

  const { data: reminder, error } = await supabase
    .from("volunteer_shift_reminders")
    .insert({
      church_id: churchId,
      shift_id: input.shiftId,
      reminded_profile_id: shift.assigned_user_id,
      reminder_channel: channel,
      reminder_note: finalNote,
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
  const session = await requireServicePlanWriteAccess();
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
  const session = await requireServicePlanWriteAccess();
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

// ── Song Library & Setlist Builder ───────────────────────────

export type SearchSongLibraryInput = {
  query: string;
};

export type SongLibrarySearchResult = {
  id: string;
  title: string;
  artist: string | null;
  defaultKey: string | null;
  defaultDurationSeconds: number | null;
  lastUsedDate: string | null;
};

export async function searchSongLibraryAction(
  input: SearchSongLibraryInput,
): Promise<{ ok: boolean; results: SongLibrarySearchResult[]; error?: string }> {
  // Read-only: any church member may search the shared song library, same as
  // other read/list actions in this app — no write-role check here.
  const session = await requireChurchSession(SCHEDULES_PATH);
  const churchId = session.appContext.church.id;
  const query = input.query?.trim() ?? "";

  if (!query) {
    return { ok: true, results: [] };
  }

  const likePattern = `%${query}%`;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      title: string;
      artist: string | null;
      default_key: string | null;
      default_duration_seconds: number | null;
      last_used_date: string | null;
    }>(
      `select id, title, artist, default_key, default_duration_seconds, last_used_date::text
       from public.song_library
       where church_id = $1
         and (title ilike $2 or artist ilike $2)
       order by title asc
       limit 25`,
      [churchId, likePattern],
    );

    return {
      ok: true,
      results: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        artist: row.artist,
        defaultKey: row.default_key,
        defaultDurationSeconds: row.default_duration_seconds,
        lastUsedDate: row.last_used_date,
      })),
    };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("song_library")
    .select("id, title, artist, default_key, default_duration_seconds, last_used_date")
    .eq("church_id", churchId)
    .or(`title.ilike.${likePattern},artist.ilike.${likePattern}`)
    .order("title", { ascending: true })
    .limit(25);

  if (error) {
    return { ok: false, results: [], error: error.message };
  }

  return {
    ok: true,
    results: (data ?? []).map((row: {
      id: string;
      title: string;
      artist: string | null;
      default_key: string | null;
      default_duration_seconds: number | null;
      last_used_date: string | null;
    }) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      defaultKey: row.default_key,
      defaultDurationSeconds: row.default_duration_seconds,
      lastUsedDate: row.last_used_date,
    })),
  };
}

export type AddSongToServicePlanInput = {
  planId: string;
  songLibraryId: string;
};

export async function addSongToServicePlanAction(
  input: AddSongToServicePlanInput,
): Promise<{ ok: boolean; id?: string; warning?: string; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;

  const plan = await fetchServicePlanForWrite(churchId, input.planId);
  if (!plan) {
    return { ok: false, error: "Service plan not found." };
  }
  if (plan.status === "cancelled") {
    return { ok: false, error: "Cannot add songs to a cancelled service plan." };
  }

  const song = await fetchSongLibraryEntry(churchId, input.songLibraryId);
  if (!song) {
    return { ok: false, error: "Song not found in this church's library." };
  }

  const { id, error } = await insertSongServicePlanItem(churchId, input.planId, song);
  if (!id) {
    return { ok: false, error: error ?? "Failed to add song to service plan." };
  }

  const windowWeeks = await fetchChurchRepeatWindowWeeks(churchId);
  const warning = computeSongRepeatWarning(plan.serviceDate, song.lastUsedDate, windowWeeks);

  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true, id, warning };
}

export type CreateSongAndAddToServicePlanInput = {
  planId: string;
  title: string;
  artist?: string;
  defaultKey?: string;
  defaultDurationSeconds?: number;
  idempotencyKey: string;
};

export async function createSongAndAddToServicePlanAction(
  input: CreateSongAndAddToServicePlanInput,
): Promise<{ ok: boolean; songLibraryId?: string; itemId?: string; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  const title = input.title?.trim() ?? "";
  if (!title) {
    return { ok: false, error: "Song title is required." };
  }
  if (!input.idempotencyKey) {
    return { ok: false, error: "idempotencyKey is required." };
  }

  const plan = await fetchServicePlanForWrite(churchId, input.planId);
  if (!plan) {
    return { ok: false, error: "Service plan not found." };
  }
  if (plan.status === "cancelled") {
    return { ok: false, error: "Cannot add songs to a cancelled service plan." };
  }

  const artist = input.artist?.trim() || null;
  const defaultKey = input.defaultKey?.trim() || null;
  const defaultDurationSeconds = input.defaultDurationSeconds ?? null;

  let wasCreated = false;

  if (shouldUseLocalTenantFallback()) {
    const insertResult = await queryTenantLocalDb<{ id: string }>(
      `insert into public.song_library
         (church_id, title, artist, default_key, default_duration_seconds, idempotency_key, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (church_id, idempotency_key) where idempotency_key is not null do nothing
       returning id`,
      [churchId, title, artist, defaultKey, defaultDurationSeconds, input.idempotencyKey, profileId],
    );
    wasCreated = Boolean(insertResult.rows[0]?.id);
  } else {
    // Deliberately a plain insert, not .upsert(...{ onConflict, ignoreDuplicates
    // }). PostgREST's upsert-via-on_conflict cannot target a *partial* unique
    // index (song_library_church_idempotency_key_idx is `where idempotency_key
    // is not null`) — confirmed against a live local PostgREST instance, which
    // returns 42P10 "no unique or exclusion constraint matching the ON
    // CONFLICT specification" for that approach. A plain insert still hits the
    // same partial index and fails with 23505 on a retried idempotency_key,
    // which is caught below and treated as "already created" — the same
    // retry-safe semantics as `on conflict ... do nothing`, without the race
    // condition a plain select-then-insert would have.
    const supabase = await createTenantServerClient();
    const { data: inserted, error: insertSongError } = await supabase
      .from("song_library")
      .insert({
        church_id: churchId,
        title,
        artist,
        default_key: defaultKey,
        default_duration_seconds: defaultDurationSeconds,
        idempotency_key: input.idempotencyKey,
        created_by: profileId,
      })
      .select("id")
      .single();

    if (insertSongError && insertSongError.code !== "23505") {
      return { ok: false, error: insertSongError.message };
    }
    wasCreated = Boolean(!insertSongError && inserted?.id);
  }

  // Look up the resulting (or pre-existing, on retry) row by (church_id,
  // idempotency_key) — this is the retry-safe step: a replayed call with the
  // same idempotencyKey resolves to the row created on the first attempt.
  let song: SongLibraryRow | null = null;

  if (shouldUseLocalTenantFallback()) {
    const songResult = await queryTenantLocalDb<{
      id: string;
      title: string;
      artist: string | null;
      default_key: string | null;
      default_duration_seconds: number | null;
      last_used_date: string | null;
    }>(
      `select id, title, artist, default_key, default_duration_seconds, last_used_date::text
       from public.song_library where church_id = $1 and idempotency_key = $2 limit 1`,
      [churchId, input.idempotencyKey],
    );
    const row = songResult.rows[0];
    song = row
      ? {
          id: row.id,
          title: row.title,
          artist: row.artist,
          defaultKey: row.default_key,
          defaultDurationSeconds: row.default_duration_seconds,
          lastUsedDate: row.last_used_date,
        }
      : null;
  } else {
    const supabase = await createTenantServerClient();
    const { data } = await supabase
      .from("song_library")
      .select("id, title, artist, default_key, default_duration_seconds, last_used_date")
      .eq("church_id", churchId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    song = data
      ? {
          id: data.id,
          title: data.title,
          artist: data.artist,
          defaultKey: data.default_key,
          defaultDurationSeconds: data.default_duration_seconds,
          lastUsedDate: data.last_used_date,
        }
      : null;
  }

  if (!song) {
    return { ok: false, error: "Failed to create song." };
  }

  if (wasCreated) {
    try {
      await logAuditEvent({
        tableName: "song_library",
        recordId: song.id,
        operation: "INSERT",
        actorId: profileId,
        churchId,
        actorRole: session.appContext.roleId,
        newValues: { title: song.title, artist: song.artist },
      });
    } catch (auditError) {
      console.error("Failed to log song_library create audit event:", auditError);
    }
  }

  const { id: itemId, error: itemError } = await insertSongServicePlanItem(churchId, input.planId, song);
  if (!itemId) {
    return { ok: false, error: itemError ?? "Failed to add song to service plan." };
  }

  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true, songLibraryId: song.id, itemId };
}

// ── Public Sessional Confirmation Getters & Actions ──────────

export async function getPublicVolunteerShiftByToken(token: string) {
  if (!token) return null;

  const supabase = createTenantAdminClient();
  const { data: shift, error } = await supabase
    .from("volunteer_shifts")
    .select(`
      id,
      title,
      confirmation_status,
      confirmation_token_expires_at,
      decline_reason,
      church_id,
      assigned_user_id,
      event_id,
      plan_id,
      events (
        title,
        description,
        start,
        "end",
        category
      ),
      service_plans (
        name,
        service_date,
        service_time
      )
    `)
    .eq("confirmation_token", token)
    .maybeSingle();

  if (error || !shift) {
    return null;
  }

  const expiresAt = shift.confirmation_token_expires_at ? new Date(shift.confirmation_token_expires_at) : null;
  if (!expiresAt || expiresAt < new Date()) {
    return null;
  }

  return shift;
}

export async function getPublicVolunteerScheduleByToken(token: string) {
  if (!token) return [];

  const initialShift = await getPublicVolunteerShiftByToken(token);
  if (!initialShift) return [];

  const profileId = initialShift.assigned_user_id;
  const churchId = initialShift.church_id;

  const supabase = createTenantAdminClient();
  const { data: shifts, error } = await supabase
    .from("volunteer_shifts")
    .select(`
      id,
      title,
      confirmation_status,
      confirmation_token_expires_at,
      decline_reason,
      starts_at,
      ends_at,
      events (
        title,
        description,
        start,
        "end",
        category
      ),
      service_plans (
        name,
        service_date,
        service_time
      )
    `)
    .eq("assigned_user_id", profileId)
    .eq("church_id", churchId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    return [];
  }

  return shifts;
}

export async function respondToPublicShiftAction(
  token: string,
  response: "confirmed" | "declined",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!token) {
    return { ok: false, error: "Token is required." };
  }

  const shift = await getPublicVolunteerShiftByToken(token);
  if (!shift) {
    return { ok: false, error: "Invalid or expired token." };
  }

  const supabase = createTenantAdminClient();

  const oldValues = {
    confirmation_status: shift.confirmation_status,
    decline_reason: shift.decline_reason,
  };

  const { error } = await supabase
    .from("volunteer_shifts")
    .update({
      confirmation_status: response,
      decline_reason: reason ?? null,
      responded_at: new Date().toISOString(),
      status: response === "confirmed" ? "confirmed" : "open",
    })
    .eq("id", shift.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  try {
    await logAuditEvent({
      tableName: "volunteer_shifts",
      recordId: shift.id,
      operation: "UPDATE",
      actorId: null,
      churchId: shift.church_id,
      actorRole: "anonymous_volunteer",
      oldValues,
      newValues: {
        confirmation_status: response,
        decline_reason: reason ?? null,
      },
    });
  } catch (auditError) {
    console.error("Failed to log audit event for public shift response:", auditError);
  }

  revalidatePath("/app/member/schedule");
  return { ok: true };
}

// ── Rotation planner (Service Planning Story 3) ──────────────────────────────
//
// Supabase-only new code. Suggestions and proposals are read-only; applying
// them goes through assignVolunteerAction so its burnout and same-day
// conflict checks still run for every assignment.

export async function suggestVolunteersForPositionAction(input: {
  planId: string;
  positionId: string;
}): Promise<{ ok: true; volunteers: RankedVolunteer[] } | { ok: false; error: string }> {
  const session = await requireServicePlanWriteAccess();
  const detail = await getServicePlanDetail(session, input.planId);
  if (!detail) return { ok: false, error: "Service plan not found." };
  const position = detail.positions.find((p) => p.id === input.positionId);
  if (!position) return { ok: false, error: "Position not found on this plan." };

  const pool = await getVolunteerPool(session, detail.plan.serviceDate, position.roleTypeId);
  return {
    ok: true,
    volunteers: rankVolunteersForPosition(pool, position.requiredSkills, detail.plan.serviceDate),
  };
}

export async function proposePlanAutoFillAction(input: {
  planId: string;
}): Promise<{ ok: true; proposal: ProposedAssignment[] } | { ok: false; error: string }> {
  const session = await requireServicePlanWriteAccess();
  const detail = await getServicePlanDetail(session, input.planId);
  if (!detail) return { ok: false, error: "Service plan not found." };

  const slots: OpenSlot[] = detail.positions.flatMap((position) =>
    Array.from({ length: Math.max(0, position.quantityNeeded - position.filled) }, () => ({
      positionId: position.id,
      roleTypeId: position.roleTypeId,
      roleName: position.roleName,
      requiredSkills: position.requiredSkills,
    })),
  );
  if (slots.length === 0) return { ok: true, proposal: [] };

  const pools = new Map<string | null, Awaited<ReturnType<typeof getVolunteerPool>>>();
  for (const roleTypeId of new Set(slots.map((slot) => slot.roleTypeId))) {
    pools.set(roleTypeId, await getVolunteerPool(session, detail.plan.serviceDate, roleTypeId));
  }

  return {
    ok: true,
    proposal: proposePlanFill(slots, (roleTypeId) => pools.get(roleTypeId) ?? [], detail.plan.serviceDate),
  };
}

export type AutoFillResult = { positionId: string; profileId: string; ok: boolean; error?: string };

export async function applyPlanAutoFillAction(input: {
  planId: string;
  assignments: Array<{ positionId: string; profileId: string }>;
}): Promise<{ ok: true; results: AutoFillResult[] } | { ok: false; error: string }> {
  const session = await requireServicePlanWriteAccess();
  const detail = await getServicePlanDetail(session, input.planId);
  if (!detail) return { ok: false, error: "Service plan not found." };

  const { startsAt, endsAt } = shiftWindowForPlan(detail.plan.serviceDate, detail.plan.serviceTime);
  const results: AutoFillResult[] = [];
  const openByPosition = new Map(detail.positions.map((p) => [p.id, Math.max(0, p.quantityNeeded - p.filled)]));

  for (const { positionId, profileId } of input.assignments) {
    const position = detail.positions.find((p) => p.id === positionId);
    if (!position) {
      results.push({ positionId, profileId, ok: false, error: "Position not found on this plan." });
      continue;
    }
    const open = openByPosition.get(positionId) ?? 0;
    if (open === 0) {
      results.push({ positionId, profileId, ok: false, error: "Position is already filled." });
      continue;
    }

    // Re-check eligibility against fresh data: the proposal may be stale.
    const pool = await getVolunteerPool(session, detail.plan.serviceDate, position.roleTypeId);
    const candidate = rankVolunteersForPosition(pool, position.requiredSkills, detail.plan.serviceDate).find(
      (v) => v.profileId === profileId,
    );
    if (!candidate) {
      results.push({ positionId, profileId, ok: false, error: "Volunteer is not in this church." });
      continue;
    }
    if (!candidate.eligible) {
      results.push({
        positionId,
        profileId,
        ok: false,
        error: candidate.ineligibleReasons.map((reason) => INELIGIBLE_LABEL[reason]).join(", "),
      });
      continue;
    }
    // The same rule proposePlanFill applies: a skilled position needs at
    // least one of its skills.
    if (position.requiredSkills.length > 0 && candidate.matchedSkills === 0) {
      results.push({ positionId, profileId, ok: false, error: "Has none of this position's skills" });
      continue;
    }

    const res = await assignVolunteerAction({
      planId: input.planId,
      positionId,
      profileId,
      roleName: position.roleName,
      startsAt,
      endsAt,
    });
    results.push({ positionId, profileId, ok: res.ok, ...(res.error ? { error: res.error } : {}) });
    if (res.ok) openByPosition.set(positionId, open - 1);
  }

  revalidatePath(`${SCHEDULES_PATH}/${input.planId}`);
  return { ok: true, results };
}

export async function updateVolunteerFrequencyAction(input: {
  profileId: string;
  maxServicesPerMonth: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireServicePlanWriteAccess();
  const churchId = session.appContext.church.id;
  const max = input.maxServicesPerMonth;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 31)) {
    return { ok: false, error: "Monthly limit must be a whole number from 1 to 31, or empty for no limit." };
  }

  const supabase = await createTenantServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", input.profileId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Volunteer not found." };

  const { error } = await supabase
    .from("volunteer_profiles")
    .upsert(
      { church_id: churchId, user_id: input.profileId, max_services_per_month: max },
      { onConflict: "church_id,user_id" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(SCHEDULES_PATH);
  revalidatePath("/app/church-admin/volunteers");
  return { ok: true };
}
