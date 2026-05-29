"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantAdminClient,
  createTenantServerClient,
  hasTenantAdminBackendEnv,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

type ChurchManagerSession = Awaited<ReturnType<typeof requireChurchSession>>;

type EventActionResult = {
  previewMode: boolean;
};

type AccountApprovalResult = {
  previewMode: boolean;
  invited: boolean;
};

type AddRosterAssignmentInput = {
  eventId: string;
  profileId: string;
  roleTitle: string;
};

type RemoveRosterAssignmentInput = {
  eventId: string;
  rosterId: string;
};

type ToggleRosterConfirmationInput = {
  eventId: string;
  rosterId: string;
  isConfirmed: boolean;
};

type QuickCheckInInput = {
  eventId: string;
  profileId: string;
};

type QuickAddVisitorInput = {
  eventId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
};

type AccountRequestDecisionInput = {
  requestId: string;
};

export type UpdateChurchSettingsInput = {
  name: string;
  legalName?: string | null;
  timezone: string;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  mailingAddress?: string | null;
  publicSummary?: string | null;
};

type UpdateChurchSettingsResult = {
  ok: boolean;
  previewMode?: boolean;
  error?: string;
};

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeChurchSettingsInput(input: UpdateChurchSettingsInput) {
  const name = input.name.trim();
  const timezone = input.timezone.trim();
  const publicSummary = normalizeOptionalText(input.publicSummary);

  if (!name) {
    throw new Error("Church name is required.");
  }

  if (name.length > 160) {
    throw new Error("Church name must be 160 characters or fewer.");
  }

  if (!timezone) {
    throw new Error("Timezone is required.");
  }

  if (timezone.length > 80) {
    throw new Error("Timezone must be 80 characters or fewer.");
  }

  if (publicSummary && publicSummary.length > 500) {
    throw new Error("Public summary must be 500 characters or fewer.");
  }

  return {
    name,
    legal_name: normalizeOptionalText(input.legalName),
    timezone,
    website_url: normalizeOptionalText(input.websiteUrl),
    contact_email: normalizeOptionalText(input.contactEmail),
    contact_phone: normalizeOptionalText(input.contactPhone),
    mailing_address: normalizeOptionalText(input.mailingAddress),
    public_summary: publicSummary,
  };
}

function validateRoleTitle(value: string) {
  const roleTitle = value.trim();

  if (!roleTitle) {
    throw new Error("A roster role is required.");
  }

  if (roleTitle.length > 120) {
    throw new Error("Roster role titles must be 120 characters or fewer.");
  }

  return roleTitle;
}

async function requireAttendanceManagerSession(redirectPath: string) {
  const session = await requireChurchSession(redirectPath);

  if (
    session.appContext.roleId !== "church-admin" &&
    session.appContext.roleId !== "pastor"
  ) {
    throw new Error("Church-admin or pastor access is required.");
  }

  return session;
}

async function requireChurchAdminOnlySession(redirectPath: string) {
  const session = await requireChurchSession(redirectPath);

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church-admin access is required.");
  }

  return session;
}

async function resolveActorProfileId(session: ChurchManagerSession) {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return null;
  }

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
      [session.userId, session.appContext.church.id],
    );

    return result.rows[0]?.id ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", session.appContext.church.id)
    .is("merged_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function assertEventBelongsToChurch(churchId: string, eventId: string) {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.events
        where id = $1
          and church_id = $2
        limit 1
      `,
      [eventId, churchId],
    );

    if (!result.rows[0]) {
      throw new Error("Event not found in this church.");
    }

    return { churchId };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Event not found in this church.");
  }

  return { churchId };
}

async function assertProfileBelongsToChurch(churchId: string, profileId: string) {
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
      throw new Error("Profile not found in this church.");
    }

    return;
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
    throw new Error("Profile not found in this church.");
  }
}

export async function updateChurchSettingsAction(
  input: UpdateChurchSettingsInput,
): Promise<UpdateChurchSettingsResult> {
  try {
    const session = await requireChurchAdminOnlySession("/app/church-admin/settings");
    const payload = normalizeChurchSettingsInput(input);

    if (!hasTenantBackendEnv() || session.source !== "supabase") {
      return { ok: true, previewMode: true };
    }

    if (shouldUseLocalTenantFallback()) {
      await queryTenantLocalDb(
        `
          update public.churches
          set name = $2,
              legal_name = $3,
              timezone = $4,
              website_url = $5,
              contact_email = $6,
              contact_phone = $7,
              mailing_address = $8,
              public_summary = $9,
              updated_at = timezone('utc', now())
          where id = $1
        `,
        [
          session.appContext.church.id,
          payload.name,
          payload.legal_name,
          payload.timezone,
          payload.website_url,
          payload.contact_email,
          payload.contact_phone,
          payload.mailing_address,
          payload.public_summary,
        ],
      );
    } else {
      const supabase = await createTenantServerClient();
      const { error } = await supabase
        .from("churches")
        .update(payload)
        .eq("id", session.appContext.church.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidatePath("/app/church-admin");
    revalidatePath("/app/church-admin/settings");
    revalidatePath("/app");

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update church settings.",
    };
  }
}

async function assertRosterBelongsToEvent(
  churchId: string,
  eventId: string,
  rosterId: string,
) {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.event_rosters
        where id = $1
          and event_id = $2
          and church_id = $3
        limit 1
      `,
      [rosterId, eventId, churchId],
    );

    if (!result.rows[0]) {
      throw new Error("Roster assignment not found for this event.");
    }

    return;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("event_rosters")
    .select("id")
    .eq("id", rosterId)
    .eq("event_id", eventId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Roster assignment not found for this event.");
  }
}

async function assertRegistrationBelongsToEvent(
  churchId: string,
  eventId: string,
  registrationId: string,
) {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.event_registrations
        where id = $1
          and event_id = $2
          and church_id = $3
        limit 1
      `,
      [registrationId, eventId, churchId],
    );

    if (!result.rows[0]) {
      throw new Error("Registration not found for this event.");
    }

    return;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("event_registrations")
    .select("id")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Registration not found for this event.");
  }
}

async function resolveEventRegistrationChurchId(eventId: string) {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ church_id: string }>(
      `
        select church_id
        from public.events
        where id = $1
        limit 1
      `,
      [eventId],
    );

    const churchId = result.rows[0]?.church_id ?? null;

    if (!churchId) {
      throw new Error("Event not found.");
    }

    return churchId;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("church_id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.church_id) {
    throw new Error("Event not found.");
  }

  return data.church_id;
}

async function generateMemberNumber(session: ChurchManagerSession) {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return `CF-PREVIEW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ member_number: string }>(
      `select public.generate_member_number() as member_number`,
    );

    return result.rows[0]?.member_number;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase.rpc("generate_member_number");

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

async function inviteChurchMember({
  churchId,
  email,
  fullName,
}: {
  churchId: string;
  email: string;
  fullName: string;
}) {
  if (!hasTenantAdminBackendEnv()) {
    return { previewMode: true, invited: false, userId: null as string | null };
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:4200";

  const admin = createTenantAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      church_id: churchId,
      role: "member",
    },
    redirectTo: `${origin}/app/member`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    previewMode: false,
    invited: true,
    userId: data.user?.id ?? null,
  };
}

function revalidateEventPaths(eventId: string) {
  revalidatePath(`/app/church-admin/events/${eventId}`);
  revalidatePath("/app/calendar");
  revalidatePath("/app/member");
  revalidatePath("/portal");
}

export async function addRosterAssignmentAction(
  input: AddRosterAssignmentInput,
): Promise<EventActionResult> {
  if (!input.eventId.trim() || !input.profileId.trim()) {
    throw new Error("An event and member are required.");
  }

  const roleTitle = validateRoleTitle(input.roleTitle);
  const session = await requireAttendanceManagerSession(
    `/app/church-admin/events/${input.eventId}`,
  );

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidateEventPaths(input.eventId);
    return { previewMode: true };
  }

  await assertEventBelongsToChurch(session.appContext.church.id, input.eventId);
  await assertProfileBelongsToChurch(session.appContext.church.id, input.profileId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.event_rosters (church_id, event_id, profile_id, role_title)
        values ($1, $2, $3, $4)
        on conflict (event_id, profile_id, role_title) do nothing
      `,
      [session.appContext.church.id, input.eventId, input.profileId, roleTitle],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("event_rosters").insert({
      church_id: session.appContext.church.id,
      event_id: input.eventId,
      profile_id: input.profileId,
      role_title: roleTitle,
    });

    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
  }

  revalidateEventPaths(input.eventId);
  return { previewMode: false };
}

export async function removeRosterAssignmentAction(
  input: RemoveRosterAssignmentInput,
): Promise<EventActionResult> {
  if (!input.eventId.trim() || !input.rosterId.trim()) {
    throw new Error("A roster assignment is required.");
  }

  const session = await requireAttendanceManagerSession(
    `/app/church-admin/events/${input.eventId}`,
  );

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidateEventPaths(input.eventId);
    return { previewMode: true };
  }

  await assertEventBelongsToChurch(session.appContext.church.id, input.eventId);
  await assertRosterBelongsToEvent(
    session.appContext.church.id,
    input.eventId,
    input.rosterId,
  );

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        delete from public.event_rosters
        where id = $1
          and church_id = $2
      `,
      [input.rosterId, session.appContext.church.id],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("event_rosters")
      .delete()
      .eq("id", input.rosterId)
      .eq("church_id", session.appContext.church.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidateEventPaths(input.eventId);
  return { previewMode: false };
}

export async function toggleRosterConfirmationAction(
  input: ToggleRosterConfirmationInput,
): Promise<EventActionResult> {
  if (!input.eventId.trim() || !input.rosterId.trim()) {
    throw new Error("A roster assignment is required.");
  }

  const session = await requireAttendanceManagerSession(
    `/app/church-admin/events/${input.eventId}`,
  );

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidateEventPaths(input.eventId);
    return { previewMode: true };
  }

  await assertEventBelongsToChurch(session.appContext.church.id, input.eventId);
  await assertRosterBelongsToEvent(
    session.appContext.church.id,
    input.eventId,
    input.rosterId,
  );

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.event_rosters
        set is_confirmed = $1
        where id = $2
          and church_id = $3
      `,
      [input.isConfirmed, input.rosterId, session.appContext.church.id],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("event_rosters")
      .update({
        is_confirmed: input.isConfirmed,
      })
      .eq("id", input.rosterId)
      .eq("church_id", session.appContext.church.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidateEventPaths(input.eventId);
  return { previewMode: false };
}

export async function quickCheckInEventMemberAction(
  input: QuickCheckInInput,
): Promise<EventActionResult> {
  if (!input.eventId.trim() || !input.profileId.trim()) {
    throw new Error("An event and member are required.");
  }

  const session = await requireAttendanceManagerSession(
    `/app/church-admin/events/${input.eventId}`,
  );

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidateEventPaths(input.eventId);
    return { previewMode: true };
  }

  await assertEventBelongsToChurch(session.appContext.church.id, input.eventId);
  await assertProfileBelongsToChurch(session.appContext.church.id, input.profileId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.attendance (
          church_id,
          event_id,
          profile_id,
          status,
          check_in_method
        )
        values ($1, $2, $3, 'present', 'staff')
        on conflict (event_id, profile_id)
        where status = 'present'
        do nothing
      `,
      [session.appContext.church.id, input.eventId, input.profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { data: existing, error: lookupError } = await supabase
      .from("attendance")
      .select("id")
      .eq("church_id", session.appContext.church.id)
      .eq("event_id", input.eventId)
      .eq("profile_id", input.profileId)
      .eq("status", "present")
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    if (!existing) {
      const { error } = await supabase.from("attendance").insert({
        church_id: session.appContext.church.id,
        event_id: input.eventId,
        profile_id: input.profileId,
        status: "present",
        check_in_method: "staff",
      });

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  revalidateEventPaths(input.eventId);
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
  return { previewMode: false };
}

export async function quickAddVisitorCheckInAction(
  input: QuickAddVisitorInput,
): Promise<EventActionResult> {
  if (!input.eventId.trim()) {
    throw new Error("An event is required.");
  }

  const fullName = input.fullName.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;

  if (!fullName) {
    throw new Error("A visitor name is required.");
  }

  const session = await requireAttendanceManagerSession(
    `/app/church-admin/events/${input.eventId}`,
  );

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidateEventPaths(input.eventId);
    return { previewMode: true };
  }

  await assertEventBelongsToChurch(session.appContext.church.id, input.eventId);

  if (shouldUseLocalTenantFallback()) {
    const insertResult = await queryTenantLocalDb<{ id: string }>(
      `
        insert into public.profiles (
          church_id,
          full_name,
          email,
          phone,
          role,
          membership_status,
          account_status,
          is_roster_eligible,
          directory_visible,
          contact_allowed
        )
        values ($1, $2, $3, $4, 'member_volunteer', 'visitor', 'pending', false, false, false)
        returning id
      `,
      [session.appContext.church.id, fullName, email, phone],
    );

    const profileId = insertResult.rows[0]?.id;

    if (!profileId) {
      throw new Error("The visitor profile could not be created.");
    }

    await queryTenantLocalDb(
      `
        insert into public.attendance (
          church_id,
          event_id,
          profile_id,
          status,
          check_in_method
        )
        values ($1, $2, $3, 'present', 'staff')
        on conflict (event_id, profile_id)
        where status = 'present'
        do nothing
      `,
      [session.appContext.church.id, input.eventId, profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .insert({
        church_id: session.appContext.church.id,
        full_name: fullName,
        email,
        phone,
        role: "member_volunteer",
        membership_status: "visitor",
        account_status: "pending",
        is_roster_eligible: false,
        directory_visible: false,
        contact_allowed: false,
      })
      .select("id")
      .single();

    if (profileError) {
      throw new Error(profileError.message);
    }

    const { error: attendanceError } = await supabase.from("attendance").insert({
      church_id: session.appContext.church.id,
      event_id: input.eventId,
      profile_id: profileRow.id,
      status: "present",
      check_in_method: "staff",
    });

    if (attendanceError) {
      throw new Error(attendanceError.message);
    }
  }

  revalidateEventPaths(input.eventId);
  revalidatePath("/app/church-admin/people");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
  return { previewMode: false };
}

export async function approveAccountRequestAction(
  input: AccountRequestDecisionInput,
): Promise<AccountApprovalResult> {
  if (!input.requestId.trim()) {
    throw new Error("An account request is required.");
  }

  const session = await requireChurchAdminOnlySession("/app/church-admin/accounts");
  const actorProfileId = await resolveActorProfileId(session);

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin/accounts");
    return { previewMode: true, invited: false };
  }

  const memberNumber = await generateMemberNumber(session);
  const reviewerAt = new Date().toISOString();

  if (shouldUseLocalTenantFallback()) {
    const requestResult = await queryTenantLocalDb<{
      id: string;
      profile_id: string | null;
      email: string;
      phone: string | null;
      first_name: string;
      last_name: string;
    }>(
      `
        select id, profile_id, email, phone, first_name, last_name
        from public.account_requests
        where id = $1
          and church_id = $2
          and status = 'pending'
        limit 1
      `,
      [input.requestId, session.appContext.church.id],
    );

    const request = requestResult.rows[0];

    if (!request) {
      throw new Error("That account request was not found.");
    }

    const fullName = `${request.first_name} ${request.last_name}`.trim();
    const inviteResult = await inviteChurchMember({
      churchId: session.appContext.church.id,
      email: request.email,
      fullName,
    });
    let profileId = request.profile_id;

    if (profileId) {
      await queryTenantLocalDb(
        `
          update public.profiles
          set
            user_id = coalesce($7, user_id),
            full_name = $1,
            email = $2,
            phone = coalesce($3, phone),
            role = coalesce(role, 'member_volunteer'),
            membership_status = coalesce(membership_status, 'visitor'),
            member_number = coalesce(member_number, $4),
            account_status = 'active',
            is_roster_eligible = true,
            updated_at = timezone('utc', now())
          where id = $5
            and church_id = $6
        `,
        [
          fullName,
          request.email,
          request.phone,
          memberNumber,
          profileId,
          session.appContext.church.id,
          inviteResult.userId,
        ],
      );
    } else {
      const insertResult = await queryTenantLocalDb<{ id: string }>(
        `
          insert into public.profiles (
            user_id,
            church_id,
            full_name,
            email,
            phone,
            role,
            membership_status,
            member_number,
            account_status,
            is_roster_eligible
          )
          values ($1, $2, $3, $4, $5, 'member_volunteer', 'visitor', $6, 'active', true)
          returning id
        `,
        [
          inviteResult.userId,
          session.appContext.church.id,
          fullName,
          request.email,
          request.phone,
          memberNumber,
        ],
      );

      profileId = insertResult.rows[0]?.id ?? null;
    }

    if (inviteResult.userId) {
      await queryTenantLocalDb(
        `
          insert into public.church_memberships (church_id, user_id, role, is_active)
          values ($1, $2, 'member', true)
          on conflict (church_id, user_id, role)
          do update set
            is_active = true,
            updated_at = timezone('utc', now())
        `,
        [session.appContext.church.id, inviteResult.userId],
      );
    }

    await queryTenantLocalDb(
      `
        update public.account_requests
        set
          status = 'approved',
          profile_id = $1,
          reviewed_by = $2,
          reviewed_at = $3
        where id = $4
      `,
      [profileId, actorProfileId, reviewerAt, input.requestId],
    );

    revalidatePath("/app/church-admin/accounts");
    revalidatePath("/app/church-admin/people");
    revalidatePath("/app/member");
    revalidatePath("/portal");
    return {
      previewMode: inviteResult.previewMode,
      invited: inviteResult.invited,
    };
  }

  const supabase = await createTenantServerClient();
  const admin = hasTenantAdminBackendEnv() ? createTenantAdminClient() : supabase;
  const { data: request, error: requestError } = await supabase
    .from("account_requests")
    .select("id, profile_id, email, phone, first_name, last_name")
    .eq("id", input.requestId)
    .eq("church_id", session.appContext.church.id)
    .eq("status", "pending")
    .maybeSingle();

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (!request) {
    throw new Error("That account request was not found.");
  }

  const fullName = `${request.first_name} ${request.last_name}`.trim();
  const inviteResult = await inviteChurchMember({
    churchId: session.appContext.church.id,
    email: request.email,
    fullName,
  });

  let profileId = request.profile_id;

  if (!profileId && inviteResult.userId) {
    const { data: invitedProfile, error: invitedProfileError } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", inviteResult.userId)
      .maybeSingle();

    if (invitedProfileError) {
      throw new Error(invitedProfileError.message);
    }

    profileId = invitedProfile?.id ?? null;
  }

  if (!profileId) {
    const { data: emailProfile, error: emailProfileError } = await admin
      .from("profiles")
      .select("id")
      .eq("church_id", session.appContext.church.id)
      .eq("email", request.email)
      .maybeSingle();

    if (emailProfileError) {
      throw new Error(emailProfileError.message);
    }

    profileId = emailProfile?.id ?? null;
  }

  if (profileId) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        user_id: inviteResult.userId,
        church_id: session.appContext.church.id,
        full_name: fullName,
        email: request.email,
        phone: request.phone,
        role: "member_volunteer",
        membership_status: "visitor",
        member_number: memberNumber,
        account_status: "active",
        is_roster_eligible: true,
      })
      .eq("id", profileId);

    if (profileError) {
      throw new Error(profileError.message);
    }
  } else {
    const { data: insertedProfile, error: insertProfileError } = await admin
      .from("profiles")
      .insert({
        user_id: inviteResult.userId,
        church_id: session.appContext.church.id,
        full_name: fullName,
        email: request.email,
        phone: request.phone,
        role: "member_volunteer",
        membership_status: "visitor",
        member_number: memberNumber,
        account_status: "active",
        is_roster_eligible: true,
      })
      .select("id")
      .single();

    if (insertProfileError) {
      throw new Error(insertProfileError.message);
    }

    profileId = insertedProfile.id;
  }

  if (inviteResult.userId) {
    const { error: membershipError } = await admin
      .from("church_memberships")
      .upsert(
        {
          church_id: session.appContext.church.id,
          user_id: inviteResult.userId,
          role: "member",
          is_active: true,
        },
        { onConflict: "church_id,user_id,role" },
      );

    if (membershipError) {
      throw new Error(membershipError.message);
    }
  }

  const { error: approvalError } = await supabase
    .from("account_requests")
    .update({
      status: "approved",
      profile_id: profileId,
      reviewed_by: actorProfileId,
      reviewed_at: reviewerAt,
    })
    .eq("id", input.requestId)
    .eq("church_id", session.appContext.church.id);

  if (approvalError) {
    throw new Error(approvalError.message);
  }

  revalidatePath("/app/church-admin/accounts");
  revalidatePath("/app/church-admin/people");
  revalidatePath("/app/member");
  revalidatePath("/portal");

  return {
    previewMode: inviteResult.previewMode,
    invited: inviteResult.invited,
  };
}

export async function rejectAccountRequestAction(
  input: AccountRequestDecisionInput,
): Promise<EventActionResult> {
  if (!input.requestId.trim()) {
    throw new Error("An account request is required.");
  }

  const session = await requireChurchAdminOnlySession("/app/church-admin/accounts");

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin/accounts");
    return { previewMode: true };
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        delete from public.account_requests
        where id = $1
          and church_id = $2
      `,
      [input.requestId, session.appContext.church.id],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("account_requests")
      .delete()
      .eq("id", input.requestId)
      .eq("church_id", session.appContext.church.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/app/church-admin/accounts");
  return { previewMode: false };
}

// ── Event creation ────────────────────────────────────────────

export type CreateEventInput = {
  title: string;
  description?: string;
  category: string;
  location?: string;
  startsAt: string;
  endsAt: string;
};

export async function createEventAction(
  input: CreateEventInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") {
    return { ok: false, error: "Unauthorized." };
  }

  const churchId = session.appContext.church.id;
  const profileId = await resolveActorProfileId(session);

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.events
         (church_id, title, description, category, location, starts_at, ends_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        churchId, input.title, input.description ?? null, input.category,
        input.location ?? null, input.startsAt, input.endsAt, profileId,
      ],
    );
    revalidatePath("/app/church-admin/events");
    return { ok: true, id: result.rows[0]?.id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      church_id: churchId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      location: input.location ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/church-admin/events");
  return { ok: true, id: data.id };
}

// ── Event registration settings ───────────────────────────────

export type UpsertRegistrationSettingsInput = {
  eventId: string;
  registrationOpen: boolean;
  capacity?: number;
  priceCents?: number;
  deadline?: string;
  confirmationMessage?: string;
  waitlistEnabled?: boolean;
  approvalRequired?: boolean;
  householdRegistrationEnabled?: boolean;
  mobileMemberCheckInEnabled?: boolean;
  mobileMemberCheckInStartsAt?: string;
  mobileMemberCheckInEndsAt?: string;
  mobileMemberCheckInAccessCode?: string;
  mobileMemberCheckInAllowHousehold?: boolean;
  mobileMemberCheckInLocationLat?: number;
  mobileMemberCheckInLocationLng?: number;
  mobileMemberCheckInLocationRadiusMeters?: number;
};

export async function upsertRegistrationSettingsAction(
  input: UpsertRegistrationSettingsInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") return { ok: false, error: "Unauthorized." };
  const churchId = session.appContext.church.id;

  if (
    input.mobileMemberCheckInEnabled &&
    input.mobileMemberCheckInStartsAt &&
    input.mobileMemberCheckInEndsAt
  ) {
    const startsAt = new Date(input.mobileMemberCheckInStartsAt).getTime();
    const endsAt = new Date(input.mobileMemberCheckInEndsAt).getTime();

    if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || startsAt >= endsAt) {
      return {
        ok: false,
        error:
          "Mobile member check-in window is invalid. Start must be before end.",
      };
    }
  }

  const hasAnyLocationField =
    input.mobileMemberCheckInLocationLat !== undefined ||
    input.mobileMemberCheckInLocationLng !== undefined ||
    input.mobileMemberCheckInLocationRadiusMeters !== undefined;

  const hasAllLocationFields =
    input.mobileMemberCheckInLocationLat !== undefined &&
    input.mobileMemberCheckInLocationLng !== undefined &&
    input.mobileMemberCheckInLocationRadiusMeters !== undefined;

  if (hasAnyLocationField && !hasAllLocationFields) {
    return {
      ok: false,
      error:
        "Mobile member check-in location constraints require latitude, longitude, and radius.",
    };
  }

  if (hasAllLocationFields) {
    const lat = input.mobileMemberCheckInLocationLat as number;
    const lng = input.mobileMemberCheckInLocationLng as number;
    const radius = input.mobileMemberCheckInLocationRadiusMeters as number;

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || radius <= 0) {
      return {
        ok: false,
        error:
          "Mobile member check-in location constraints are invalid.",
      };
    }
  }

  await assertEventBelongsToChurch(churchId, input.eventId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `insert into public.event_registration_settings
         (event_id, church_id, registration_open, capacity, price_cents,
          deadline, confirmation_message, waitlist_enabled,
          approval_required, household_registration_enabled,
          mobile_member_check_in_enabled, mobile_member_check_in_starts_at,
          mobile_member_check_in_ends_at, mobile_member_check_in_access_code,
           mobile_member_check_in_allow_household,
           mobile_member_check_in_location_lat,
           mobile_member_check_in_location_lng,
           mobile_member_check_in_location_radius_meters)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       on conflict (event_id)
       do update set
         registration_open = $3, capacity = $4, price_cents = $5,
         deadline = $6, confirmation_message = $7, waitlist_enabled = $8,
         approval_required = $9,
         household_registration_enabled = $10,
         mobile_member_check_in_enabled = $11,
         mobile_member_check_in_starts_at = $12,
         mobile_member_check_in_ends_at = $13,
         mobile_member_check_in_access_code = $14,
         mobile_member_check_in_allow_household = $15,
         mobile_member_check_in_location_lat = $16,
         mobile_member_check_in_location_lng = $17,
         mobile_member_check_in_location_radius_meters = $18,
         updated_at = now()`,
      [
        input.eventId, churchId, input.registrationOpen,
        input.capacity ?? null, input.priceCents ?? 0,
        input.deadline ?? null, input.confirmationMessage ?? null,
        input.waitlistEnabled ?? false,
        input.approvalRequired ?? false,
        input.householdRegistrationEnabled ?? false,
        input.mobileMemberCheckInEnabled ?? false,
        input.mobileMemberCheckInStartsAt ?? null,
        input.mobileMemberCheckInEndsAt ?? null,
        input.mobileMemberCheckInAccessCode ?? null,
        input.mobileMemberCheckInAllowHousehold ?? false,
        input.mobileMemberCheckInLocationLat ?? null,
        input.mobileMemberCheckInLocationLng ?? null,
        input.mobileMemberCheckInLocationRadiusMeters ?? null,
      ],
    );
    revalidatePath(`/app/church-admin/events/${input.eventId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("event_registration_settings").upsert(
    {
      event_id: input.eventId, church_id: churchId,
      registration_open: input.registrationOpen,
      capacity: input.capacity ?? null, price_cents: input.priceCents ?? 0,
      deadline: input.deadline ?? null, confirmation_message: input.confirmationMessage ?? null,
      waitlist_enabled: input.waitlistEnabled ?? false,
      approval_required: input.approvalRequired ?? false,
      household_registration_enabled: input.householdRegistrationEnabled ?? false,
      mobile_member_check_in_enabled: input.mobileMemberCheckInEnabled ?? false,
      mobile_member_check_in_starts_at: input.mobileMemberCheckInStartsAt ?? null,
      mobile_member_check_in_ends_at: input.mobileMemberCheckInEndsAt ?? null,
      mobile_member_check_in_access_code: input.mobileMemberCheckInAccessCode ?? null,
      mobile_member_check_in_allow_household: input.mobileMemberCheckInAllowHousehold ?? false,
      mobile_member_check_in_location_lat: input.mobileMemberCheckInLocationLat ?? null,
      mobile_member_check_in_location_lng: input.mobileMemberCheckInLocationLng ?? null,
      mobile_member_check_in_location_radius_meters:
        input.mobileMemberCheckInLocationRadiusMeters ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/church-admin/events/${input.eventId}`);
  return { ok: true };
}

export type RegisterForEventInput = {
  eventId: string;
  churchId: string;
  registrantName: string;
  registrantEmail?: string;
  registrantPhone?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

export async function registerForEventAction(
  input: RegisterForEventInput,
): Promise<{ ok: boolean; registrationId?: string; isWaitlisted?: boolean; error?: string }> {
  if (!input.registrantName.trim()) return { ok: false, error: "Name is required." };

  const churchId = await resolveEventRegistrationChurchId(input.eventId);

  if (input.churchId && input.churchId !== churchId) {
    return { ok: false, error: "Event does not belong to the requested church." };
  }

  if (shouldUseLocalTenantFallback()) {
    // Check capacity
    const settingsResult = await queryTenantLocalDb<{
      capacity: number | null; waitlist_enabled: boolean; registration_open: boolean;
      approval_required: boolean;
      price_cents: number;
    }>(
      `select capacity, waitlist_enabled, registration_open, approval_required, price_cents
       from public.event_registration_settings
       where event_id = $1`,
      [input.eventId],
    );
    const settings = settingsResult.rows[0];
    if (settings && !settings.registration_open) {
      return { ok: false, error: "Registration is closed for this event." };
    }

    let isWaitlisted = false;
    if (settings?.capacity) {
      const countResult = await queryTenantLocalDb<{ cnt: number }>(
        `select count(*)::int as cnt from public.event_registrations
         where event_id = $1 and is_waitlisted = false and status != 'cancelled'`,
        [input.eventId],
      );
      const count = countResult.rows[0]?.cnt ?? 0;
      if (count >= settings.capacity) {
        if (!settings.waitlist_enabled) {
          return { ok: false, error: "This event is full and does not have a waitlist." };
        }
        isWaitlisted = true;
      }
    }

    const status = isWaitlisted
      ? "waitlisted"
      : settings?.approval_required
        ? "pending_approval"
        : "confirmed";
    const paymentStatus = !isWaitlisted && (settings?.price_cents ?? 0) > 0
      ? "pending"
      : "not_required";

    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.event_registrations
         (event_id, church_id, registrant_name, registrant_email, registrant_phone,
          status, is_waitlisted, payment_status, notes, custom_fields)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        input.eventId, churchId, input.registrantName.trim(),
        input.registrantEmail ?? null, input.registrantPhone ?? null,
        status,
        isWaitlisted,
        paymentStatus,
        input.notes ?? null,
        input.customFields ? JSON.stringify(input.customFields) : null,
      ],
    );
    revalidatePath(`/app/church-admin/events/${input.eventId}`);
    return { ok: true, registrationId: result.rows[0]?.id, isWaitlisted };
  }

  const supabase = await createTenantServerClient();

  const { data: settings } = await supabase
    .from("event_registration_settings")
    .select("capacity, waitlist_enabled, registration_open, approval_required, price_cents")
    .eq("event_id", input.eventId)
    .maybeSingle();

  if (settings && settings.registration_open === false) {
    return { ok: false, error: "Registration is closed for this event." };
  }

  let isWaitlisted = false;
  if (settings?.capacity) {
    const { count } = await supabase
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", input.eventId)
      .eq("is_waitlisted", false)
      .neq("status", "cancelled");

    if ((count ?? 0) >= settings.capacity) {
      if (!settings.waitlist_enabled) {
        return { ok: false, error: "This event is full and does not have a waitlist." };
      }
      isWaitlisted = true;
    }
  }

  const status = isWaitlisted
    ? "waitlisted"
    : settings?.approval_required
      ? "pending_approval"
      : "confirmed";
  const paymentStatus = !isWaitlisted && (settings?.price_cents ?? 0) > 0
    ? "pending"
    : "not_required";

  const { data, error } = await supabase
    .from("event_registrations")
    .insert({
      event_id: input.eventId, church_id: churchId,
      registrant_name: input.registrantName.trim(),
      registrant_email: input.registrantEmail ?? null,
      registrant_phone: input.registrantPhone ?? null,
      status,
      is_waitlisted: isWaitlisted,
      payment_status: paymentStatus,
      custom_fields: input.customFields ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/church-admin/events/${input.eventId}`);
  return { ok: true, registrationId: data.id, isWaitlisted };
}

export async function approveRegistrationAction(
  registrationId: string,
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") return { ok: false, error: "Unauthorized." };
  const churchId = session.appContext.church.id;

  await assertEventBelongsToChurch(churchId, eventId);
  await assertRegistrationBelongsToEvent(churchId, eventId, registrationId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.event_registrations
       set status = 'confirmed'
       where id = $1 and church_id = $2 and status = 'pending_approval'`,
      [registrationId, churchId],
    );
    revalidatePath(`/app/church-admin/events/${eventId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("event_registrations")
    .update({ status: "confirmed" })
    .eq("id", registrationId)
    .eq("church_id", churchId)
    .eq("status", "pending_approval");

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/church-admin/events/${eventId}`);
  return { ok: true };
}

export type UpsertRegistrationFormFieldInput = {
  eventId: string;
  fields: Array<{
    label: string;
    fieldKey: string;
    fieldType: "text" | "textarea" | "select" | "checkbox" | "number";
    isRequired: boolean;
    options?: string[];
  }>;
};

export async function upsertRegistrationFormFieldsAction(
  input: UpsertRegistrationFormFieldInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") return { ok: false, error: "Unauthorized." };
  const churchId = session.appContext.church.id;

  await assertEventBelongsToChurch(churchId, input.eventId);

  const normalized = input.fields
    .map((field, index) => ({
      label: field.label.trim(),
      field_key: field.fieldKey.trim(),
      field_type: field.fieldType,
      is_required: field.isRequired,
      options: field.options ?? null,
      sort_order: index,
    }))
    .filter((field) => field.label.length > 0 && field.field_key.length > 0);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `delete from public.event_registration_form_fields where event_id = $1 and church_id = $2`,
      [input.eventId, churchId],
    );

    for (const field of normalized) {
      await queryTenantLocalDb(
        `insert into public.event_registration_form_fields
           (event_id, church_id, label, field_key, field_type, is_required, options, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          input.eventId,
          churchId,
          field.label,
          field.field_key,
          field.field_type,
          field.is_required,
          field.options ? JSON.stringify(field.options) : null,
          field.sort_order,
        ],
      );
    }

    revalidatePath(`/app/church-admin/events/${input.eventId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error: deleteError } = await supabase
    .from("event_registration_form_fields")
    .delete()
    .eq("event_id", input.eventId)
    .eq("church_id", churchId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (normalized.length > 0) {
    const { error: insertError } = await supabase.from("event_registration_form_fields").insert(
      normalized.map((field) => ({
        event_id: input.eventId,
        church_id: churchId,
        ...field,
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidatePath(`/app/church-admin/events/${input.eventId}`);
  return { ok: true };
}

export async function cancelRegistrationAction(
  registrationId: string,
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") return { ok: false, error: "Unauthorized." };
  const churchId = session.appContext.church.id;

  await assertEventBelongsToChurch(churchId, eventId);
  await assertRegistrationBelongsToEvent(churchId, eventId, registrationId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.event_registrations
       set status = 'cancelled' where id = $1 and church_id = $2`,
      [registrationId, churchId],
    );
    revalidatePath(`/app/church-admin/events/${eventId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("event_registrations")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .eq("church_id", churchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/church-admin/events/${eventId}`);
  return { ok: true };
}

export async function checkInRegistrantAction(
  registrationId: string,
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireChurchSession("/app/church-admin/events");
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") return { ok: false, error: "Unauthorized." };
  const churchId = session.appContext.church.id;

  await assertEventBelongsToChurch(churchId, eventId);
  await assertRegistrationBelongsToEvent(churchId, eventId, registrationId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.event_registrations
       set status = 'attended', checked_in_at = now()
       where id = $1 and church_id = $2`,
      [registrationId, churchId],
    );
    revalidatePath(`/app/church-admin/events/${eventId}`);
    return { ok: true };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase
    .from("event_registrations")
    .update({ status: "attended", checked_in_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("church_id", churchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/church-admin/events/${eventId}`);
  return { ok: true };
}
