"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type UpdateProfileInput = {
  fullName: string;
  phone: string | null;
  address: string | null;
  preferredContactMethod: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  directoryVisible: boolean;
  contactAllowed: boolean;
};

export type UpdateFamilyInput = {
  familyName: string;
  address: string | null;
  homePhone: string | null;
};

export type CreatePastoralNoteInput = {
  profileId: string;
  content: string;
};

export type CreateCareAssignmentInput = {
  profileId: string;
  summary: string;
  priority: "routine" | "high" | "urgent";
  dueAt: string | null;
};

export type UpdateCareAssignmentStatusInput = {
  assignmentId: string;
  status: "open" | "in_progress" | "closed";
};

export type UpdateChurchAdminPersonInput = {
  profileId: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  displayTitle: string | null;
  membershipStatus: string;
  preferredContactMethod: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  directoryVisible: boolean;
  contactAllowed: boolean;
};

export type UpdateChurchAdminPeopleBulkInput = {
  profileIds: string[];
  membershipStatus: string | null;
  directoryVisible: boolean | null;
  contactAllowed: boolean | null;
};

export type ReassignChurchAdminPersonFamilyInput = {
  profileId: string;
  familyId: string | null;
};

export type MergeChurchAdminDuplicateInput = {
  sourceProfileId: string;
  targetProfileId: string;
};

const ALLOWED_CONTACT_METHODS = new Set(["email", "sms", "app", "none"]);

function validateInput(input: UpdateProfileInput): string | null {
  const name = input.fullName.trim();
  if (!name) return "Full name is required.";
  if (name.length > 200) return "Full name is too long.";
  if (
    input.preferredContactMethod !== null &&
    !ALLOWED_CONTACT_METHODS.has(input.preferredContactMethod)
  ) {
    return "Invalid contact method.";
  }
  return null;
}

function validateFamilyInput(input: UpdateFamilyInput): string | null {
  const familyName = input.familyName.trim();
  if (!familyName) return "Family name is required.";
  if (familyName.length > 200) return "Family name is too long.";
  return null;
}

function validatePastoralNoteInput(input: CreatePastoralNoteInput): string | null {
  if (!input.profileId.trim()) return "Profile is required.";
  if (!input.content.trim()) return "Note content is required.";
  if (input.content.trim().length > 4000) return "Note is too long.";
  return null;
}

function validateCareAssignmentInput(
  input: CreateCareAssignmentInput,
): string | null {
  if (!input.profileId.trim()) return "Profile is required.";
  if (!input.summary.trim()) return "Assignment summary is required.";
  if (input.summary.trim().length > 500) return "Assignment summary is too long.";
  if (!["routine", "high", "urgent"].includes(input.priority)) {
    return "Invalid priority.";
  }
  return null;
}

function validateCareAssignmentStatusInput(
  input: UpdateCareAssignmentStatusInput,
): string | null {
  if (!input.assignmentId.trim()) return "Assignment is required.";
  if (!["open", "in_progress", "closed"].includes(input.status)) {
    return "Invalid assignment status.";
  }
  return null;
}

function validateChurchAdminPersonInput(
  input: UpdateChurchAdminPersonInput,
): string | null {
  if (!input.profileId.trim()) return "Profile is required.";
  if (!input.fullName.trim()) return "Full name is required.";
  if (input.fullName.trim().length > 200) return "Full name is too long.";
  if (
    input.preferredContactMethod !== null &&
    !ALLOWED_CONTACT_METHODS.has(input.preferredContactMethod)
  ) {
    return "Invalid contact method.";
  }
  if (
    !["active", "visitor", "inactive", "baptized", "transferred"].includes(
      input.membershipStatus,
    )
  ) {
    return "Invalid membership status.";
  }
  return null;
}

function validateChurchAdminPeopleBulkInput(
  input: UpdateChurchAdminPeopleBulkInput,
): string | null {
  if (!input.profileIds.length) return "At least one person must be selected.";

  if (
    input.membershipStatus === null &&
    input.directoryVisible === null &&
    input.contactAllowed === null
  ) {
    return "Choose at least one bulk change.";
  }

  if (
    input.membershipStatus !== null &&
    !["active", "visitor", "inactive", "baptized", "transferred"].includes(
      input.membershipStatus,
    )
  ) {
    return "Invalid membership status.";
  }

  return null;
}

function validateReassignChurchAdminPersonFamilyInput(
  input: ReassignChurchAdminPersonFamilyInput,
): string | null {
  if (!input.profileId.trim()) return "Profile is required.";
  return null;
}

function validateMergeChurchAdminDuplicateInput(
  input: MergeChurchAdminDuplicateInput,
): string | null {
  if (!input.sourceProfileId.trim() || !input.targetProfileId.trim()) {
    return "Source and target profiles are required.";
  }
  if (input.sourceProfileId === input.targetProfileId) {
    return "Source and target must be different.";
  }
  return null;
}

async function requirePastorProfileContext(redirectPath: string) {
  const session = await requireChurchSession(redirectPath);

  if (session.appContext.roleId !== "pastor") {
    throw new Error("Pastor access is required.");
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { session, profileId: null as string | null };
  }

  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where user_id = $1
          and church_id = $2
        limit 1
      `,
      [session.userId, session.appContext.church.id],
    );

    return { session, profileId: profileResult.rows[0]?.id ?? null };
  }

  const supabase = await createTenantServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", session.appContext.church.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return { session, profileId: profile?.id ?? null };
}

async function requireChurchAdminSession(redirectPath: string) {
  const session = await requireChurchSession(redirectPath);

  if (session.appContext.roleId !== "church-admin") {
    throw new Error("Church admin access is required.");
  }

  return session;
}

async function requireChurchAdminProfileContext(redirectPath: string) {
  const session = await requireChurchAdminSession(redirectPath);

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { session, profileId: null as string | null };
  }

  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where user_id = $1
          and church_id = $2
        limit 1
      `,
      [session.userId, session.appContext.church.id],
    );

    return { session, profileId: profileResult.rows[0]?.id ?? null };
  }

  const supabase = await createTenantServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", session.appContext.church.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return { session, profileId: profile?.id ?? null };
}

export async function updateMemberProfileAction(input: UpdateProfileInput) {
  const session = await requireChurchSession("/app/member");

  const error = validateInput(input);
  if (error) throw new Error(error);

  const fullName = input.fullName.trim();
  const phone = input.phone?.trim() || null;
  const address = input.address?.trim() || null;
  const emergencyContactName = input.emergencyContactName?.trim() || null;
  const emergencyContactPhone = input.emergencyContactPhone?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    // Preview / dev mode — nothing to persist.
    revalidatePath("/app/member");
    revalidatePath("/portal");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.profiles
        set
          full_name                = $1,
          phone                    = $2,
          address                  = $3,
          preferred_contact_method = $4,
          emergency_contact_name   = $5,
          emergency_contact_phone  = $6,
          directory_visible        = $7,
          contact_allowed          = $8,
          updated_at               = timezone('utc', now())
        where user_id  = $9
          and church_id = $10
      `,
      [
        fullName,
        phone,
        address,
        input.preferredContactMethod,
        emergencyContactName,
        emergencyContactPhone,
        input.directoryVisible,
        input.contactAllowed,
        session.userId,
        session.appContext.church.id,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error: dbError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        address,
        preferred_contact_method: input.preferredContactMethod,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        directory_visible: input.directoryVisible,
        contact_allowed: input.contactAllowed,
      })
      .eq("user_id", session.userId)
      .eq("church_id", session.appContext.church.id);

    if (dbError) throw new Error(dbError.message);
  }

  revalidatePath("/app/member");
  revalidatePath("/app/member/directory");
  revalidatePath("/portal");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}

export async function createPastoralNoteAction(input: CreatePastoralNoteInput) {
  const validationError = validatePastoralNoteInput(input);
  if (validationError) throw new Error(validationError);

  const { session, profileId } = await requirePastorProfileContext(
    "/app/pastor/people",
  );
  const content = input.content.trim();

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/pastor");
    revalidatePath("/app/pastor/people");
    return;
  }

  if (!profileId) {
    throw new Error("No pastor profile was found for this account.");
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.pastoral_notes (church_id, profile_id, created_by, content)
        values ($1, $2, $3, $4)
      `,
      [session.appContext.church.id, input.profileId, profileId, content],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("pastoral_notes").insert({
      church_id: session.appContext.church.id,
      profile_id: input.profileId,
      created_by: profileId,
      content,
    });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}

export async function createCareAssignmentAction(
  input: CreateCareAssignmentInput,
) {
  const validationError = validateCareAssignmentInput(input);
  if (validationError) throw new Error(validationError);

  const { session, profileId } = await requirePastorProfileContext(
    "/app/pastor/people",
  );
  const summary = input.summary.trim();
  const dueAt = input.dueAt?.trim() ? new Date(input.dueAt).toISOString() : null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/pastor");
    revalidatePath("/app/pastor/people");
    return;
  }

  if (!profileId) {
    throw new Error("No pastor profile was found for this account.");
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.care_assignments (
          church_id,
          profile_id,
          created_by,
          assigned_to,
          summary,
          priority,
          status,
          due_at
        )
        values ($1, $2, $3, $3, $4, $5, 'open', $6)
      `,
      [
        session.appContext.church.id,
        input.profileId,
        profileId,
        summary,
        input.priority,
        dueAt,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("care_assignments").insert({
      church_id: session.appContext.church.id,
      profile_id: input.profileId,
      created_by: profileId,
      assigned_to: profileId,
      summary,
      priority: input.priority,
      status: "open",
      due_at: dueAt,
    });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}

export async function updateCareAssignmentStatusAction(
  input: UpdateCareAssignmentStatusInput,
) {
  const validationError = validateCareAssignmentStatusInput(input);
  if (validationError) throw new Error(validationError);

  const { session } = await requirePastorProfileContext("/app/pastor/people");
  const lastContactAt =
    input.status === "closed" || input.status === "in_progress"
      ? new Date().toISOString()
      : null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/pastor");
    revalidatePath("/app/pastor/people");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.care_assignments
        set
          status = $1,
          last_contact_at = coalesce($2, last_contact_at),
          updated_at = timezone('utc', now())
        where id = $3
          and church_id = $4
      `,
      [input.status, lastContactAt, input.assignmentId, session.appContext.church.id],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("care_assignments")
      .update({
        status: input.status,
        last_contact_at: lastContactAt,
      })
      .eq("id", input.assignmentId)
      .eq("church_id", session.appContext.church.id);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}

export async function updateChurchAdminPersonAction(
  input: UpdateChurchAdminPersonInput,
) {
  const validationError = validateChurchAdminPersonInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireChurchAdminSession("/app/church-admin/people");

  const fullName = input.fullName.trim();
  const phone = input.phone?.trim() || null;
  const address = input.address?.trim() || null;
  const displayTitle = input.displayTitle?.trim() || null;
  const emergencyContactName = input.emergencyContactName?.trim() || null;
  const emergencyContactPhone = input.emergencyContactPhone?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    revalidatePath("/app/church-admin/people");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.profiles
        set
          full_name = $1,
          phone = $2,
          address = $3,
          display_title = $4,
          membership_status = $5,
          preferred_contact_method = $6,
          emergency_contact_name = $7,
          emergency_contact_phone = $8,
          directory_visible = $9,
          contact_allowed = $10,
          updated_at = timezone('utc', now())
        where id = $11
          and church_id = $12
      `,
      [
        fullName,
        phone,
        address,
        displayTitle,
        input.membershipStatus,
        input.preferredContactMethod,
        emergencyContactName,
        emergencyContactPhone,
        input.directoryVisible,
        input.contactAllowed,
        input.profileId,
        session.appContext.church.id,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        address,
        display_title: displayTitle,
        membership_status: input.membershipStatus,
        preferred_contact_method: input.preferredContactMethod,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        directory_visible: input.directoryVisible,
        contact_allowed: input.contactAllowed,
      })
      .eq("id", input.profileId)
      .eq("church_id", session.appContext.church.id);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/people");
}

export async function updateChurchAdminPeopleBulkAction(
  input: UpdateChurchAdminPeopleBulkInput,
) {
  const validationError = validateChurchAdminPeopleBulkInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireChurchAdminSession("/app/church-admin/people");

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    revalidatePath("/app/church-admin/people");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.profiles
        set
          membership_status = coalesce($1, membership_status),
          directory_visible = coalesce($2, directory_visible),
          contact_allowed = coalesce($3, contact_allowed),
          updated_at = timezone('utc', now())
        where id = any($4::uuid[])
          and church_id = $5
      `,
      [
        input.membershipStatus,
        input.directoryVisible,
        input.contactAllowed,
        input.profileIds,
        session.appContext.church.id,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const payload: {
      membership_status?: string;
      directory_visible?: boolean;
      contact_allowed?: boolean;
    } = {};

    if (input.membershipStatus !== null) {
      payload.membership_status = input.membershipStatus;
    }

    if (input.directoryVisible !== null) {
      payload.directory_visible = input.directoryVisible;
    }

    if (input.contactAllowed !== null) {
      payload.contact_allowed = input.contactAllowed;
    }

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .in("id", input.profileIds)
      .eq("church_id", session.appContext.church.id);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/people");
}

export async function reassignChurchAdminPersonFamilyAction(
  input: ReassignChurchAdminPersonFamilyInput,
) {
  const validationError = validateReassignChurchAdminPersonFamilyInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireChurchAdminSession("/app/church-admin/people");

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    revalidatePath("/app/church-admin/people");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    if (input.familyId) {
      const familyResult = await queryTenantLocalDb<{ id: string }>(
        `
          select id
          from public.families
          where id = $1
            and church_id = $2
          limit 1
        `,
        [input.familyId, session.appContext.church.id],
      );

      if (!familyResult.rows[0]) {
        throw new Error("Family was not found in this church.");
      }
    }

    await queryTenantLocalDb(
      `
        update public.profiles
        set
          family_id = $1,
          updated_at = timezone('utc', now())
        where id = $2
          and church_id = $3
      `,
      [input.familyId, input.profileId, session.appContext.church.id],
    );
  } else {
    const supabase = await createTenantServerClient();

    if (input.familyId) {
      const { data: familyRow, error: familyError } = await supabase
        .from("families")
        .select("id")
        .eq("id", input.familyId)
        .eq("church_id", session.appContext.church.id)
        .maybeSingle();

      if (familyError) throw new Error(familyError.message);
      if (!familyRow) throw new Error("Family was not found in this church.");
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        family_id: input.familyId,
      })
      .eq("id", input.profileId)
      .eq("church_id", session.appContext.church.id);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/people");
  revalidatePath("/app/member");
  revalidatePath("/app/member/family");
  revalidatePath("/app/member/directory");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}

export async function mergeChurchAdminDuplicateAction(
  input: MergeChurchAdminDuplicateInput,
) {
  const validationError = validateMergeChurchAdminDuplicateInput(input);
  if (validationError) throw new Error(validationError);

  const { session, profileId } = await requireChurchAdminProfileContext(
    "/app/church-admin/people",
  );

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    revalidatePath("/app/church-admin/people");
    return;
  }

  if (!profileId) {
    throw new Error("No church-admin profile was found for this account.");
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        select public.merge_duplicate_profile($1, $2, $3)
      `,
      [input.sourceProfileId, input.targetProfileId, profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.rpc("merge_duplicate_profile", {
      source_profile_id: input.sourceProfileId,
      target_profile_id: input.targetProfileId,
      actor_profile_id: profileId,
    });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/people");
  revalidatePath("/app/member");
  revalidatePath("/app/member/directory");
  revalidatePath("/app/member/family");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}

export async function upsertMemberFamilyAction(input: UpdateFamilyInput) {
  const session = await requireChurchSession("/app/member/family");

  const error = validateFamilyInput(input);
  if (error) throw new Error(error);

  const familyName = input.familyName.trim();
  const address = input.address?.trim() || null;
  const homePhone = input.homePhone?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/member");
    revalidatePath("/app/member/family");
    revalidatePath("/portal");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<{
      family_id: string | null;
    }>(
      `
        select family_id
        from public.profiles
        where user_id = $1
          and church_id = $2
        limit 1
      `,
      [session.userId, session.appContext.church.id],
    );

    const profile = profileResult.rows[0];

    if (!profile) {
      throw new Error("No church profile was found for this account.");
    }

    if (profile.family_id) {
      await queryTenantLocalDb(
        `
          update public.families
          set
            family_name = $1,
            address = $2,
            home_phone = $3,
            updated_at = timezone('utc', now())
          where id = $4
            and church_id = $5
        `,
        [familyName, address, homePhone, profile.family_id, session.appContext.church.id],
      );
    } else {
      const familyInsertResult = await queryTenantLocalDb<{ id: string }>(
        `
          insert into public.families (church_id, family_name, address, home_phone)
          values ($1, $2, $3, $4)
          returning id
        `,
        [session.appContext.church.id, familyName, address, homePhone],
      );

      const familyId = familyInsertResult.rows[0]?.id;

      if (!familyId) {
        throw new Error("Family could not be created.");
      }

      await queryTenantLocalDb(
        `
          update public.profiles
          set
            family_id = $1,
            updated_at = timezone('utc', now())
          where user_id = $2
            and church_id = $3
        `,
        [familyId, session.userId, session.appContext.church.id],
      );
    }
  } else {
    const supabase = await createTenantServerClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, family_id")
      .eq("user_id", session.userId)
      .eq("church_id", session.appContext.church.id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("No church profile was found for this account.");

    if (profile.family_id) {
      const { error: familyError } = await supabase
        .from("families")
        .update({
          family_name: familyName,
          address,
          home_phone: homePhone,
        })
        .eq("id", profile.family_id)
        .eq("church_id", session.appContext.church.id);

      if (familyError) throw new Error(familyError.message);
    } else {
      const { data: familyRow, error: familyInsertError } = await supabase
        .from("families")
        .insert({
          church_id: session.appContext.church.id,
          family_name: familyName,
          address,
          home_phone: homePhone,
        })
        .select("id")
        .single();

      if (familyInsertError) throw new Error(familyInsertError.message);

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          family_id: familyRow.id,
        })
        .eq("user_id", session.userId)
        .eq("church_id", session.appContext.church.id);

      if (profileUpdateError) throw new Error(profileUpdateError.message);
    }
  }

  revalidatePath("/app/member");
  revalidatePath("/app/member/family");
  revalidatePath("/app/member/directory");
  revalidatePath("/portal");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}
