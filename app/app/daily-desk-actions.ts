"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type CreateDailyWorkItemInput = {
  itemType: "call" | "note" | "visit" | "calendar_item" | "follow_up" | "checkup";
  title: string;
  body?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  direction?: "incoming" | "outgoing" | null;
  relatedProfileId?: string | null;
  assignedToProfileId?: string | null;
  scheduledAt?: string | null;
  dueAt?: string | null;
  location?: string | null;
};

export type UpdateDailyWorkItemStatusInput = {
  itemId: string;
  status: "open" | "scheduled" | "waiting" | "done" | "cancelled";
};

async function requireDailyDeskSession() {
  const session = await requireChurchSession("/app/daily-desk");

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "secretary" &&
    session.appContext.roleId !== "pastor"
  ) {
    throw new Error("Church-admin, secretary, or pastor access is required.");
  }

  return session;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeDateTime(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Date and time must be valid.");
  }

  return date.toISOString();
}

async function resolveActorProfileId(userId: string, churchId: string) {
  if (!hasTenantBackendEnv()) return null;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where user_id = $1
          and church_id = $2
          and merged_at is null
        limit 1
      `,
      [userId, churchId],
    );

    return result.rows[0]?.id ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("church_id", churchId)
    .is("merged_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function assertProfileInChurch(churchId: string, profileId: string | null | undefined) {
  if (!profileId) return null;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where id = $1
          and church_id = $2
          and merged_at is null
        limit 1
      `,
      [profileId, churchId],
    );

    if (!result.rows[0]) {
      throw new Error("Selected person does not belong to this church.");
    }

    return profileId;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("church_id", churchId)
    .is("merged_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Selected person does not belong to this church.");
  }

  return profileId;
}

export async function createDailyWorkItemAction(input: CreateDailyWorkItemInput) {
  const session = await requireDailyDeskSession();
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { ok: true, previewMode: true };
  }

  const title = input.title.trim();
  if (!title) {
    throw new Error("Title is required.");
  }

  if (title.length > 160) {
    throw new Error("Title must be 160 characters or fewer.");
  }

  const relatedProfileId = await assertProfileInChurch(churchId, input.relatedProfileId);
  const assignedToProfileId = await assertProfileInChurch(churchId, input.assignedToProfileId);
  const actorProfileId = await resolveActorProfileId(session.userId, churchId);
  const scheduledAt = normalizeDateTime(input.scheduledAt);
  const dueAt = normalizeDateTime(input.dueAt);
  const status = input.itemType === "visit" || input.itemType === "calendar_item" ? "scheduled" : "open";
  const values = {
    church_id: churchId,
    item_type: input.itemType,
    title,
    body: normalizeOptionalText(input.body),
    status,
    priority: input.priority ?? "normal",
    direction: input.itemType === "call" ? input.direction ?? "incoming" : null,
    related_profile_id: relatedProfileId,
    assigned_to_profile_id: assignedToProfileId,
    scheduled_at: scheduledAt,
    due_at: dueAt,
    location: normalizeOptionalText(input.location),
    created_by: actorProfileId,
  };

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.daily_work_items (
          church_id,
          item_type,
          title,
          body,
          status,
          priority,
          direction,
          related_profile_id,
          assigned_to_profile_id,
          scheduled_at,
          due_at,
          location,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        values.church_id,
        values.item_type,
        values.title,
        values.body,
        values.status,
        values.priority,
        values.direction,
        values.related_profile_id,
        values.assigned_to_profile_id,
        values.scheduled_at,
        values.due_at,
        values.location,
        values.created_by,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("daily_work_items").insert(values);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/app/daily-desk");
  return { ok: true, previewMode: false };
}

export async function updateDailyWorkItemStatusAction(input: UpdateDailyWorkItemStatusInput) {
  const session = await requireDailyDeskSession();
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { ok: true, previewMode: true };
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.daily_work_items
        set
          status = $3,
          completed_at = case when $3 = 'done' then timezone('utc', now()) else completed_at end
        where id = $1
          and church_id = $2
      `,
      [input.itemId, churchId, input.status],
    );
  } else {
    const supabase = await createTenantServerClient();
    const patch: { status: string; completed_at?: string } = {
      status: input.status,
    };
    if (input.status === "done") {
      patch.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("daily_work_items")
      .update(patch)
      .eq("id", input.itemId)
      .eq("church_id", churchId);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/app/daily-desk");
  return { ok: true, previewMode: false };
}
