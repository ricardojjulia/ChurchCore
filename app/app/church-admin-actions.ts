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
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
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
    "http://localhost:3000";

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
        values ($1, $2, $3, 'present', 'manual_admin')
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
        check_in_method: "manual_admin",
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
        values ($1, $2, $3, 'present', 'manual_admin')
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
      check_in_method: "manual_admin",
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
    let profileId = request.profile_id;

    if (profileId) {
      await queryTenantLocalDb(
        `
          update public.profiles
          set
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
        ],
      );
    } else {
      const insertResult = await queryTenantLocalDb<{ id: string }>(
        `
          insert into public.profiles (
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
          values ($1, $2, $3, $4, 'member_volunteer', 'visitor', $5, 'active', true)
          returning id
        `,
        [
          session.appContext.church.id,
          fullName,
          request.email,
          request.phone,
          memberNumber,
        ],
      );

      profileId = insertResult.rows[0]?.id ?? null;
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
    return { previewMode: true, invited: false };
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
