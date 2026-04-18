"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { GroupCategory, GroupMemberRole } from "@/lib/groups-types";

const GROUPS_ADMIN_PATH = "/app/church-admin/groups";
const GROUPS_MEMBER_PATH = "/app/member/groups";

// ── Guard helpers ────────────────────────────────────────────

async function requireAdminSession() {
  const session = await requireChurchSession(GROUPS_ADMIN_PATH);
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") {
    throw new Error("Unauthorized: groups management requires admin or pastor role.");
  }
  return session;
}

async function requireMemberSession() {
  return requireChurchSession(GROUPS_MEMBER_PATH);
}

// ── Group CRUD ───────────────────────────────────────────────

export type CreateGroupInput = {
  name: string;
  description?: string;
  category: GroupCategory;
  leaderProfileId?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingLocation?: string;
  capacity?: number;
  isOpen: boolean;
};

export async function createGroupAction(
  input: CreateGroupInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (!input.name.trim()) return { ok: false, error: "Group name is required." };

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.groups
         (church_id, name, description, category, leader_profile_id, meeting_day,
          meeting_time, meeting_location, capacity, is_open)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        churchId, input.name.trim(), input.description ?? null, input.category,
        input.leaderProfileId ?? null, input.meetingDay ?? null,
        input.meetingTime ?? null, input.meetingLocation ?? null,
        input.capacity ?? null, input.isOpen,
      ],
    );
    revalidatePath(GROUPS_ADMIN_PATH);
    return { ok: true, id: result.rows[0]?.id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("groups")
    .insert({
      church_id: churchId,
      name: input.name.trim(),
      description: input.description ?? null,
      category: input.category,
      leader_profile_id: input.leaderProfileId ?? null,
      meeting_day: input.meetingDay ?? null,
      meeting_time: input.meetingTime ?? null,
      meeting_location: input.meetingLocation ?? null,
      capacity: input.capacity ?? null,
      is_open: input.isOpen,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(GROUPS_ADMIN_PATH);
  return { ok: true, id: data.id };
}

export async function updateGroupAction(
  groupId: string,
  input: Partial<CreateGroupInput> & { isActive?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.groups
       set name = coalesce($3, name),
           description = coalesce($4, description),
           category = coalesce($5, category),
           leader_profile_id = coalesce($6, leader_profile_id),
           meeting_day = coalesce($7, meeting_day),
           meeting_time = coalesce($8, meeting_time),
           meeting_location = coalesce($9, meeting_location),
           capacity = coalesce($10, capacity),
           is_open = coalesce($11, is_open),
           is_active = coalesce($12, is_active),
           updated_at = now()
       where id = $1 and church_id = $2`,
      [
        groupId, churchId,
        input.name ?? null, input.description ?? null, input.category ?? null,
        input.leaderProfileId ?? null, input.meetingDay ?? null,
        input.meetingTime ?? null, input.meetingLocation ?? null,
        input.capacity ?? null, input.isOpen ?? null, input.isActive ?? null,
      ],
    );
    revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.category !== undefined) updates.category = input.category;
  if (input.leaderProfileId !== undefined) updates.leader_profile_id = input.leaderProfileId;
  if (input.meetingDay !== undefined) updates.meeting_day = input.meetingDay;
  if (input.meetingTime !== undefined) updates.meeting_time = input.meetingTime;
  if (input.meetingLocation !== undefined) updates.meeting_location = input.meetingLocation;
  if (input.capacity !== undefined) updates.capacity = input.capacity;
  if (input.isOpen !== undefined) updates.is_open = input.isOpen;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  const { error } = await supabase
    .from("groups")
    .update(updates)
    .eq("id", groupId)
    .eq("church_id", churchId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
  return { ok: true };
}

// ── Membership ───────────────────────────────────────────────

export async function addGroupMemberAction(
  groupId: string,
  profileId: string,
  role: GroupMemberRole = "member",
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.group_members (group_id, church_id, profile_id, role)
       values ($1, $2, $3, $4)
       on conflict (group_id, profile_id) do update set role = $4, status = 'active'`,
      [groupId, churchId, profileId, role],
    );
    revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("group_members").upsert(
    { group_id: groupId, church_id: churchId, profile_id: profileId, role, status: "active" },
    { onConflict: "group_id,profile_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
  return { ok: true };
}

export async function removeGroupMemberAction(
  groupId: string,
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `delete from public.group_members where id = $1 and group_id = $2 and church_id = $3`,
      [memberId, groupId, churchId],
    );
    revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", memberId)
    .eq("group_id", groupId)
    .eq("church_id", churchId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
  return { ok: true };
}

export async function joinGroupAction(
  groupId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMemberSession();
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.group_members (group_id, church_id, profile_id, role, status)
       values ($1, $2, $3, 'member', 'pending')
       on conflict (group_id, profile_id) do nothing`,
      [groupId, churchId, profileId],
    );
    revalidatePath(GROUPS_MEMBER_PATH);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("group_members").upsert(
    { group_id: groupId, church_id: churchId, profile_id: profileId, role: "member", status: "pending" },
    { onConflict: "group_id,profile_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(GROUPS_MEMBER_PATH);
  return { ok: true };
}

// ── Meetings ─────────────────────────────────────────────────

export type LogMeetingInput = {
  groupId: string;
  scheduledAt: string;
  location?: string;
  notes?: string;
};

export async function logGroupMeetingAction(
  input: LogMeetingInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.group_meetings (group_id, church_id, scheduled_at, location, notes, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [input.groupId, churchId, input.scheduledAt, input.location ?? null, input.notes ?? null, profileId],
    );
    revalidatePath(`${GROUPS_ADMIN_PATH}/${input.groupId}`);
    return { ok: true, id: result.rows[0]?.id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("group_meetings")
    .insert({
      group_id: input.groupId, church_id: churchId,
      scheduled_at: input.scheduledAt, location: input.location ?? null,
      notes: input.notes ?? null, created_by: profileId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`${GROUPS_ADMIN_PATH}/${input.groupId}`);
  return { ok: true, id: data.id };
}

export type AttendanceRecord = { profileId: string; status: "present" | "absent" | "excused" };

export async function recordAttendanceAction(
  meetingId: string,
  groupId: string,
  records: AttendanceRecord[],
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    for (const r of records) {
      await queryTenantLocalDb(
        `insert into public.group_attendance (meeting_id, group_id, church_id, profile_id, status)
         values ($1, $2, $3, $4, $5)
         on conflict (meeting_id, profile_id) do update set status = $5`,
        [meetingId, groupId, churchId, r.profileId, r.status],
      );
    }
    revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const rows = records.map((r) => ({
    meeting_id: meetingId, group_id: groupId, church_id: churchId,
    profile_id: r.profileId, status: r.status,
  }));
  const { error } = await supabase
    .from("group_attendance")
    .upsert(rows, { onConflict: "meeting_id,profile_id" });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`${GROUPS_ADMIN_PATH}/${groupId}`);
  return { ok: true };
}

// ── Service attendance ───────────────────────────────────────

export async function logServiceAttendanceAction(
  serviceDate: string,
  serviceType: string,
  headcount: number,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.service_attendance (church_id, service_date, service_type, headcount, notes, created_by)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (church_id, service_date, service_type)
       do update set headcount = $4, notes = $5`,
      [churchId, serviceDate, serviceType, headcount, notes ?? null, profileId],
    );
    revalidatePath("/app/church-admin/attendance");
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("service_attendance")
    .upsert(
      { church_id: churchId, service_date: serviceDate, service_type: serviceType,
        headcount, notes: notes ?? null, created_by: profileId },
      { onConflict: "church_id,service_date,service_type" },
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/church-admin/attendance");
  return { ok: true };
}

// ── First-time visitors ──────────────────────────────────────

export type AddVisitorInput = {
  fullName: string;
  email?: string;
  phone?: string;
  visitDate: string;
  referredBy?: string;
  howDidHear?: string;
};

export async function addFirstTimeVisitorAction(
  input: AddVisitorInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (!input.fullName.trim()) return { ok: false, error: "Name is required." };

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.first_time_visitors
         (church_id, full_name, email, phone, visit_date, referred_by, how_did_hear)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [churchId, input.fullName.trim(), input.email ?? null, input.phone ?? null,
       input.visitDate, input.referredBy ?? null, input.howDidHear ?? null],
    );
    revalidatePath("/app/church-admin/people");
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("first_time_visitors").insert({
    church_id: churchId,
    full_name: input.fullName.trim(),
    email: input.email ?? null,
    phone: input.phone ?? null,
    visit_date: input.visitDate,
    referred_by: input.referredBy ?? null,
    how_did_hear: input.howDidHear ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/church-admin/people");
  return { ok: true };
}

export async function advanceVisitorWorkflowAction(
  visitorId: string,
  stage: string,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.first_time_visitors
       set workflow_stage = $3, workflow_notes = coalesce($4, workflow_notes),
           converted_at = case when $3 = 'converted' then now() else converted_at end
       where id = $1 and church_id = $2`,
      [visitorId, churchId, stage, notes ?? null],
    );
    revalidatePath("/app/church-admin/people");
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const updates: Record<string, unknown> = { workflow_stage: stage };
  if (notes) updates.workflow_notes = notes;
  if (stage === "converted") updates.converted_at = new Date().toISOString();

  const { error } = await supabase
    .from("first_time_visitors")
    .update(updates)
    .eq("id", visitorId)
    .eq("church_id", churchId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/church-admin/people");
  return { ok: true };
}
