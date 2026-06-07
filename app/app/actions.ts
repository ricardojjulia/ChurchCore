"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  insertConsentLogEntries,
  type ConsentCommunicationType,
} from "@/lib/consent-log";
import { encryptPastoralField } from "@/lib/crypto/pastoral";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";
import {
  createTenantAdminClient,
  createTenantServerClient,
  hasTenantAdminBackendEnv,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type UpdateProfileInput = {
  fullName: string;
  phone: string | null;
  address: string | null;
  preferredContactMethod: string | null;
  interests: string[];
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

export type MemberSelfServiceUpdateResult = {
  status: "saved" | "pending_review";
  requestId?: string;
};

type MemberChangeRequestType = "profile" | "family";
type MemberChangeRequestStatus = "pending" | "approved" | "rejected";

type ReviewMemberChangeRequestInput = {
  requestId: string;
  decision: "approved" | "rejected";
  reviewerNote?: string | null;
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
  role: ChurchAdminManagedRole;
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
const ALLOWED_CHURCH_ADMIN_MANAGED_ROLES = new Set([
  "church_admin",
  "secretary",
  "pastor",
  "ministry_leader",
  "member",
] as const);

type ChurchAdminManagedRole =
  | "church_admin"
  | "secretary"
  | "pastor"
  | "ministry_leader"
  | "member";

function mapManagedRoleToProfileRole(role: ChurchAdminManagedRole) {
  switch (role) {
    case "church_admin":
      return "church_admin";
    case "secretary":
      return "secretary";
    case "pastor":
      return "pastor_elder";
    case "ministry_leader":
      return "ministry_leader";
    case "member":
      return "member_volunteer";
  }
}

function mapPreferredContactMethodToConsentCommunicationType(
  value: string | null,
): ConsentCommunicationType | null {
  switch (value) {
    case "email":
      return "email";
    case "sms":
      return "sms";
    case "app":
      return "in_app";
    default:
      return null;
  }
}

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
  if (input.interests.some((interest) => interest.trim().length > 120)) {
    return "Each interest must be 120 characters or fewer.";
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
  if (!ALLOWED_CHURCH_ADMIN_MANAGED_ROLES.has(input.role)) {
    return "Invalid role.";
  }
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

async function assertCanChangeChurchAdminPersonRole(
  session: Awaited<ReturnType<typeof requireChurchSession>>,
  targetProfileId: string,
  nextRole: ChurchAdminManagedRole,
) {
  if (nextRole === "church_admin") {
    return;
  }

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where id = $1
          and user_id = $2
          and church_id = $3
          and merged_at is null
        limit 1
      `,
      [targetProfileId, session.userId, session.appContext.church.id],
    );

    if (result.rows[0]) {
      throw new Error("You cannot remove your own church-admin access.");
    }

    return;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetProfileId)
    .eq("user_id", session.userId)
    .eq("church_id", session.appContext.church.id)
    .is("merged_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data) {
    throw new Error("You cannot remove your own church-admin access.");
  }
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

async function resolveSessionProfileId(session: Awaited<ReturnType<typeof requireChurchSession>>) {
  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<{ id: string }>(
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

    return profileResult.rows[0]?.id ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", session.appContext.church.id)
    .is("merged_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return profile?.id ?? null;
}

async function queueMemberChangeRequest(
  session: Awaited<ReturnType<typeof requireChurchSession>>,
  params: {
    targetProfileId: string;
    changeType: MemberChangeRequestType;
    proposedChanges: Record<string, unknown>;
  },
) {
  if (shouldUseLocalTenantFallback()) {
    const requestResult = await queryTenantLocalDb<{ id: string }>(
      `
        insert into public.member_change_requests (
          church_id,
          target_profile_id,
          requested_by_profile_id,
          change_type,
          status,
          proposed_changes
        )
        values ($1, $2, $2, $3, 'pending', $4::jsonb)
        on conflict (church_id, target_profile_id, change_type)
        where status = 'pending'
        do update
          set
            proposed_changes = excluded.proposed_changes,
            reviewer_note = null,
            reviewer_profile_id = null,
            reviewed_at = null,
            updated_at = timezone('utc', now())
        returning id
      `,
      [
        session.appContext.church.id,
        params.targetProfileId,
        params.changeType,
        JSON.stringify(params.proposedChanges),
      ],
    );

    return requestResult.rows[0]?.id ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data: existingRequest, error: existingRequestError } = await supabase
    .from("member_change_requests")
    .select("id")
    .eq("church_id", session.appContext.church.id)
    .eq("target_profile_id", params.targetProfileId)
    .eq("change_type", params.changeType)
    .eq("status", "pending")
    .maybeSingle();

  if (existingRequestError) throw new Error(existingRequestError.message);

  if (existingRequest?.id) {
    const { error: updateError } = await supabase
      .from("member_change_requests")
      .update({
        proposed_changes: params.proposedChanges,
        reviewer_note: null,
        reviewer_profile_id: null,
        reviewed_at: null,
      })
      .eq("id", existingRequest.id)
      .eq("church_id", session.appContext.church.id);

    if (updateError) throw new Error(updateError.message);
    return existingRequest.id;
  }

  const { data: insertedRequest, error: insertError } = await supabase
    .from("member_change_requests")
    .insert({
      church_id: session.appContext.church.id,
      target_profile_id: params.targetProfileId,
      requested_by_profile_id: params.targetProfileId,
      change_type: params.changeType,
      status: "pending",
      proposed_changes: params.proposedChanges,
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);
  return insertedRequest.id;
}

async function applyApprovedProfileChanges(
  churchId: string,
  profileId: string,
  proposedChanges: UpdateProfileInput,
) {
  const fullName = proposedChanges.fullName.trim();
  const phone = proposedChanges.phone?.trim() || null;
  const address = proposedChanges.address?.trim() || null;
  const interests = proposedChanges.interests
    .map((interest) => interest.trim())
    .filter(Boolean)
    .slice(0, 12);
  const emergencyContactName = proposedChanges.emergencyContactName?.trim() || null;
  const emergencyContactPhone = proposedChanges.emergencyContactPhone?.trim() || null;

  if (shouldUseLocalTenantFallback()) {
    const existingProfileResult = await queryTenantLocalDb<{
      id: string;
      directory_visible: boolean | null;
      contact_allowed: boolean | null;
      preferred_contact_method: string | null;
    }>(
      `
        select id, directory_visible, contact_allowed, preferred_contact_method
        from public.profiles
        where id = $1
          and church_id = $2
          and merged_at is null
        limit 1
      `,
      [profileId, churchId],
    );

    const existingProfile = existingProfileResult.rows[0] ?? null;
    if (!existingProfile) throw new Error("No church profile was found for this request.");

    await queryTenantLocalDb(
      `
        update public.profiles
        set
          full_name                = $1,
          phone                    = $2,
          address                  = $3,
          preferred_contact_method = $4,
          interests                = $5,
          directory_visible        = $6,
          contact_allowed          = $7,
          updated_at               = timezone('utc', now())
        where id = $8
          and church_id = $9
      `,
      [
        fullName,
        phone,
        address,
        proposedChanges.preferredContactMethod,
        interests,
        proposedChanges.directoryVisible,
        proposedChanges.contactAllowed,
        profileId,
        churchId,
      ],
    );

    await queryTenantLocalDb(
      `
        insert into public.profile_sensitive_fields (profile_id, church_id, emergency_contact_name, emergency_contact_phone)
        values ($1, $2, $3, $4)
        on conflict (profile_id) do update
          set emergency_contact_name  = excluded.emergency_contact_name,
              emergency_contact_phone = excluded.emergency_contact_phone,
              updated_at              = timezone('utc', now())
      `,
      [profileId, churchId, emergencyContactName, emergencyContactPhone],
    );

    const consentEntries = [
      {
        changed: (existingProfile.directory_visible ?? true) !== proposedChanges.directoryVisible,
        consentType: "directory_visibility",
        consented: proposedChanges.directoryVisible,
        communicationType: null,
      },
      {
        changed: (existingProfile.contact_allowed ?? true) !== proposedChanges.contactAllowed,
        consentType: "member_contact",
        consented: proposedChanges.contactAllowed,
        communicationType: null,
      },
      {
        changed:
          (existingProfile.preferred_contact_method ?? null) !==
          (proposedChanges.preferredContactMethod ?? null),
        consentType: "preferred_contact_method",
        consented: proposedChanges.preferredContactMethod !== null,
        communicationType: mapPreferredContactMethodToConsentCommunicationType(
          proposedChanges.preferredContactMethod,
        ),
      },
    ]
      .filter((entry) => entry.changed)
      .map((entry) => ({
        churchId,
        profileId: existingProfile.id,
        consentType: entry.consentType,
        consented: entry.consented,
        communicationType: entry.communicationType,
      }));

    await insertConsentLogEntries(consentEntries);
    return;
  }

  const supabase = await createTenantServerClient();
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, directory_visible, contact_allowed, preferred_contact_method")
    .eq("id", profileId)
    .eq("church_id", churchId)
    .is("merged_at", null)
    .maybeSingle();

  if (existingProfileError) throw new Error(existingProfileError.message);
  if (!existingProfile) throw new Error("No church profile was found for this request.");

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone,
      address,
      preferred_contact_method: proposedChanges.preferredContactMethod,
      interests,
      directory_visible: proposedChanges.directoryVisible,
      contact_allowed: proposedChanges.contactAllowed,
    })
    .eq("id", profileId)
    .eq("church_id", churchId)
    .select("id, church_id")
    .single();

  if (profileError) throw new Error(profileError.message);

  const { error: sensitiveError } = await supabase
    .from("profile_sensitive_fields")
    .upsert(
      {
        profile_id: updatedProfile.id,
        church_id: updatedProfile.church_id,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
      },
      { onConflict: "profile_id" },
    );

  if (sensitiveError) throw new Error(sensitiveError.message);

  const consentEntries = [
    {
      changed: (existingProfile.directory_visible ?? true) !== proposedChanges.directoryVisible,
      consentType: "directory_visibility",
      consented: proposedChanges.directoryVisible,
      communicationType: null,
    },
    {
      changed: (existingProfile.contact_allowed ?? true) !== proposedChanges.contactAllowed,
      consentType: "member_contact",
      consented: proposedChanges.contactAllowed,
      communicationType: null,
    },
    {
      changed:
        (existingProfile.preferred_contact_method ?? null) !==
        (proposedChanges.preferredContactMethod ?? null),
      consentType: "preferred_contact_method",
      consented: proposedChanges.preferredContactMethod !== null,
      communicationType: mapPreferredContactMethodToConsentCommunicationType(
        proposedChanges.preferredContactMethod,
      ),
    },
  ]
    .filter((entry) => entry.changed)
    .map((entry) => ({
      churchId,
      profileId: updatedProfile.id,
      consentType: entry.consentType,
      consented: entry.consented,
      communicationType: entry.communicationType,
    }));

  await insertConsentLogEntries(consentEntries);
}

async function applyApprovedFamilyChanges(
  churchId: string,
  profileId: string,
  proposedChanges: UpdateFamilyInput,
) {
  const familyName = proposedChanges.familyName.trim();
  const address = proposedChanges.address?.trim() || null;
  const homePhone = proposedChanges.homePhone?.trim() || null;

  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<{ family_id: string | null }>(
      `
        select family_id
        from public.profiles
        where id = $1
          and church_id = $2
        limit 1
      `,
      [profileId, churchId],
    );

    const profile = profileResult.rows[0];
    if (!profile) throw new Error("No church profile was found for this request.");

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
        [familyName, address, homePhone, profile.family_id, churchId],
      );

      return;
    }

    const familyInsertResult = await queryTenantLocalDb<{ id: string }>(
      `
        insert into public.families (church_id, family_name, address, home_phone)
        values ($1, $2, $3, $4)
        returning id
      `,
      [churchId, familyName, address, homePhone],
    );

    const familyId = familyInsertResult.rows[0]?.id;
    if (!familyId) throw new Error("Family could not be created.");

    await queryTenantLocalDb(
      `
        update public.profiles
        set
          family_id = $1,
          updated_at = timezone('utc', now())
        where id = $2
          and church_id = $3
      `,
      [familyId, profileId, churchId],
    );

    return;
  }

  const supabase = await createTenantServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, family_id")
    .eq("id", profileId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("No church profile was found for this request.");

  if (profile.family_id) {
    const { error: familyError } = await supabase
      .from("families")
      .update({
        family_name: familyName,
        address,
        home_phone: homePhone,
      })
      .eq("id", profile.family_id)
      .eq("church_id", churchId);

    if (familyError) throw new Error(familyError.message);
    return;
  }

  const { data: familyRow, error: familyInsertError } = await supabase
    .from("families")
    .insert({
      church_id: churchId,
      family_name: familyName,
      address,
      home_phone: homePhone,
    })
    .select("id")
    .single();

  if (familyInsertError) throw new Error(familyInsertError.message);

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ family_id: familyRow.id })
    .eq("id", profileId)
    .eq("church_id", churchId);

  if (profileUpdateError) throw new Error(profileUpdateError.message);
}

function parseProfileChangePayload(payload: unknown): UpdateProfileInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Profile request payload is invalid.");
  }

  const candidate = payload as Partial<UpdateProfileInput>;
  const normalized: UpdateProfileInput = {
    fullName: typeof candidate.fullName === "string" ? candidate.fullName : "",
    phone: typeof candidate.phone === "string" || candidate.phone === null ? candidate.phone : null,
    address:
      typeof candidate.address === "string" || candidate.address === null
        ? candidate.address
        : null,
    preferredContactMethod:
      typeof candidate.preferredContactMethod === "string" ||
      candidate.preferredContactMethod === null
        ? candidate.preferredContactMethod
        : null,
    interests: Array.isArray(candidate.interests)
      ? candidate.interests.filter((value): value is string => typeof value === "string")
      : [],
    emergencyContactName:
      typeof candidate.emergencyContactName === "string" ||
      candidate.emergencyContactName === null
        ? candidate.emergencyContactName
        : null,
    emergencyContactPhone:
      typeof candidate.emergencyContactPhone === "string" ||
      candidate.emergencyContactPhone === null
        ? candidate.emergencyContactPhone
        : null,
    directoryVisible: Boolean(candidate.directoryVisible),
    contactAllowed: Boolean(candidate.contactAllowed),
  };

  const error = validateInput(normalized);
  if (error) throw new Error(error);
  return normalized;
}

function parseFamilyChangePayload(payload: unknown): UpdateFamilyInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Family request payload is invalid.");
  }

  const candidate = payload as Partial<UpdateFamilyInput>;
  const normalized: UpdateFamilyInput = {
    familyName: typeof candidate.familyName === "string" ? candidate.familyName : "",
    address:
      typeof candidate.address === "string" || candidate.address === null
        ? candidate.address
        : null,
    homePhone:
      typeof candidate.homePhone === "string" || candidate.homePhone === null
        ? candidate.homePhone
        : null,
  };

  const error = validateFamilyInput(normalized);
  if (error) throw new Error(error);
  return normalized;
}

export async function updateMemberProfileAction(
  input: UpdateProfileInput,
): Promise<MemberSelfServiceUpdateResult> {
  const session = await requireChurchSession("/app/member");

  const error = validateInput(input);
  if (error) throw new Error(error);

  const fullName = input.fullName.trim();
  const phone = input.phone?.trim() || null;
  const address = input.address?.trim() || null;
  const interests = input.interests
    .map((interest) => interest.trim())
    .filter(Boolean)
    .slice(0, 12);
  const emergencyContactName = input.emergencyContactName?.trim() || null;
  const emergencyContactPhone = input.emergencyContactPhone?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    // Preview / dev mode — nothing to persist.
    revalidatePath("/app/member");
    revalidatePath("/portal");
    return { status: "saved" };
  }

  const activeProfileId = await resolveSessionProfileId(session);
  if (!activeProfileId) {
    throw new Error("No church profile was found for this account.");
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && hasTenantAdminBackendEnv()) {
    const adminSupabase = createTenantAdminClient();
    await adminSupabase.from("profiles").update({
      full_name: fullName,
      phone,
      address,
      preferred_contact_method: input.preferredContactMethod ?? null,
      interests,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
      directory_visible: input.directoryVisible,
      contact_allowed: input.contactAllowed,
    }).eq("id", activeProfileId).eq("church_id", session.appContext.church.id);

    revalidatePath("/app/member");
    revalidatePath("/app/member/directory");
    revalidatePath("/portal");
    revalidatePath("/app/pastor");
    revalidatePath("/app/pastor/people");

    return { status: "saved" };
  }

  const requestId = await queueMemberChangeRequest(session, {
    targetProfileId: activeProfileId,
    changeType: "profile",
    proposedChanges: {
      fullName,
      phone,
      address,
      preferredContactMethod: input.preferredContactMethod,
      interests,
      emergencyContactName,
      emergencyContactPhone,
      directoryVisible: input.directoryVisible,
      contactAllowed: input.contactAllowed,
    },
  });

  revalidatePath("/app/member");
  revalidatePath("/app/member/directory");
  revalidatePath("/portal");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");

  return {
    status: "pending_review",
    requestId: requestId ?? undefined,
  };
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

  const encryptedContent = encryptPastoralField(content);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.pastoral_notes (church_id, profile_id, created_by, content)
        values ($1, $2, $3, $4)
      `,
      [session.appContext.church.id, input.profileId, profileId, encryptedContent],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("pastoral_notes").insert({
      church_id: session.appContext.church.id,
      profile_id: input.profileId,
      created_by: profileId,
      content: encryptedContent,
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

  const encryptedSummary = encryptPastoralField(summary);

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
        encryptedSummary,
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
      summary: encryptedSummary,
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
  const profileRole = mapManagedRoleToProfileRole(input.role);

  await assertCanChangeChurchAdminPersonRole(session, input.profileId, input.role);

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
          full_name                = $1,
          phone                    = $2,
          address                  = $3,
          display_title            = $4,
          role                     = $5,
          is_pastoral              = $6,
          membership_status        = $7,
          preferred_contact_method = $8,
          directory_visible        = $9,
          contact_allowed          = $10,
          updated_at               = timezone('utc', now())
        where id        = $11
          and church_id = $12
      `,
      [
        fullName,
        phone,
        address,
        displayTitle,
        profileRole,
        input.role === "pastor",
        input.membershipStatus,
        input.preferredContactMethod,
        input.directoryVisible,
        input.contactAllowed,
        input.profileId,
        session.appContext.church.id,
      ],
    );

    const profileResult = await queryTenantLocalDb<{ user_id: string | null }>(
      `
        select user_id
        from public.profiles
        where id = $1
          and church_id = $2
          and merged_at is null
        limit 1
      `,
      [input.profileId, session.appContext.church.id],
    );
    const userId = profileResult.rows[0]?.user_id ?? null;

    if (userId) {
      await queryTenantLocalDb(
        `
          update public.church_memberships
          set is_active = false,
              updated_at = timezone('utc', now())
          where church_id = $1
            and user_id = $2
            and role <> $3::public.app_role
        `,
        [session.appContext.church.id, userId, input.role],
      );
      await queryTenantLocalDb(
        `
          insert into public.church_memberships (church_id, user_id, role, is_active)
          values ($1, $2, $3::public.app_role, true)
          on conflict (church_id, user_id, role) do update
            set is_active = true,
                updated_at = timezone('utc', now())
        `,
        [session.appContext.church.id, userId, input.role],
      );
    }

    await queryTenantLocalDb(
      `
        insert into public.profile_sensitive_fields (profile_id, church_id, emergency_contact_name, emergency_contact_phone)
        values ($1, $2, $3, $4)
        on conflict (profile_id) do update
          set emergency_contact_name  = excluded.emergency_contact_name,
              emergency_contact_phone = excluded.emergency_contact_phone,
              updated_at              = timezone('utc', now())
      `,
      [input.profileId, session.appContext.church.id, emergencyContactName, emergencyContactPhone],
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
        role: profileRole,
        is_pastoral: input.role === "pastor",
        membership_status: input.membershipStatus,
        preferred_contact_method: input.preferredContactMethod,
        directory_visible: input.directoryVisible,
        contact_allowed: input.contactAllowed,
      })
      .eq("id", input.profileId)
      .eq("church_id", session.appContext.church.id);

    if (error) throw new Error(error.message);

    const { data: profileRow, error: profileLookupError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", input.profileId)
      .eq("church_id", session.appContext.church.id)
      .is("merged_at", null)
      .maybeSingle();

    if (profileLookupError) throw new Error(profileLookupError.message);

    const userId =
      profileRow && "user_id" in profileRow && profileRow.user_id
        ? String(profileRow.user_id)
        : null;

    if (userId) {
      const { error: deactivateError } = await supabase
        .from("church_memberships")
        .update({ is_active: false })
        .eq("church_id", session.appContext.church.id)
        .eq("user_id", userId)
        .neq("role", input.role);

      if (deactivateError) throw new Error(deactivateError.message);

      const { error: membershipError } = await supabase
        .from("church_memberships")
        .upsert(
          {
            church_id: session.appContext.church.id,
            user_id: userId,
            role: input.role,
            is_active: true,
          },
          { onConflict: "church_id,user_id,role" },
        );

      if (membershipError) throw new Error(membershipError.message);
    }

    const { error: sensitiveError } = await supabase
      .from("profile_sensitive_fields")
      .upsert(
        {
          profile_id: input.profileId,
          church_id: session.appContext.church.id,
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
        },
        { onConflict: "profile_id" },
      );

    if (sensitiveError) throw new Error(sensitiveError.message);
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

// ============================================================
// Ministry Forge actions
// ============================================================

export type CreateMinistryInput = {
  name: string;
  ministryType: string | null;
  visionStatement: string | null;
  scripturalAnchor: string[];
};

export type UpdateMinistryInput = {
  ministryId: string;
  name: string;
  ministryType: string | null;
  visionStatement: string | null;
  scripturalAnchor: string[];
  leaderProfileId: string | null;
};

export type DeleteMinistryInput = {
  ministryId: string;
};

export type AssignMembersToMinistryInput = {
  ministryId: string;
  profileIds: string[];
  role: "member" | "leader" | "assistant_leader";
};

export type RemoveMemberFromMinistryInput = {
  ministryId: string;
  profileId: string;
};

export type UpdateMinistryHealthScoreInput = {
  ministryId: string;
  healthScore: number;
  notes: string | null;
};

export type LogKingdomImpactInput = {
  ministryId: string | null;
  impactType: "prayer_answered" | "disciple_made" | "salvation" | "restored_relationship";
  description: string | null;
  occurredAt: string | null;
};

export type UpdateMinistryVisionInput = {
  ministryId: string;
  visionStatement: string | null;
  scripturalAnchor: string[];
};

const ALLOWED_MINISTRY_TYPES = new Set([
  "outreach",
  "discipleship",
  "worship",
  "care",
  "administration",
  "youth",
  "children",
  "missions",
  "men",
  "women",
  "marriage",
  "young_adult",
  "education",
]);

const ALLOWED_MEMBER_ROLES = new Set(["member", "leader", "assistant_leader"]);

const ALLOWED_IMPACT_TYPES = new Set([
  "prayer_answered",
  "disciple_made",
  "salvation",
  "restored_relationship",
]);

function validateCreateMinistryInput(input: CreateMinistryInput): string | null {
  if (!input.name.trim()) return "Ministry name is required.";
  if (input.name.trim().length > 200) return "Ministry name is too long.";
  if (input.ministryType !== null && !ALLOWED_MINISTRY_TYPES.has(input.ministryType)) {
    return "Invalid ministry type.";
  }
  if (input.visionStatement && input.visionStatement.trim().length > 2000) {
    return "Vision statement is too long.";
  }
  if (input.scripturalAnchor.some((s) => s.length > 300)) {
    return "A scriptural anchor is too long.";
  }
  return null;
}

function validateUpdateMinistryInput(input: UpdateMinistryInput): string | null {
  if (!input.ministryId.trim()) return "Ministry is required.";
  if (input.leaderProfileId !== null && !input.leaderProfileId.trim()) {
    return "Leader profile is invalid.";
  }
  return validateCreateMinistryInput(input);
}

function validateAssignMembersInput(input: AssignMembersToMinistryInput): string | null {
  if (!input.ministryId.trim()) return "Ministry is required.";
  if (!input.profileIds.length) return "At least one member is required.";
  if (!ALLOWED_MEMBER_ROLES.has(input.role)) return "Invalid member role.";
  return null;
}

function validateLogKingdomImpactInput(input: LogKingdomImpactInput): string | null {
  if (!ALLOWED_IMPACT_TYPES.has(input.impactType)) return "Invalid impact type.";
  if (input.description && input.description.trim().length > 1000) {
    return "Description is too long.";
  }
  return null;
}

function validateUpdateMinistryHealthScoreInput(
  input: UpdateMinistryHealthScoreInput,
): string | null {
  if (!input.ministryId.trim()) return "Ministry is required.";
  if (input.healthScore < 0 || input.healthScore > 10) {
    return "Health score must be between 0 and 10.";
  }
  return null;
}

async function requireMinistryManagerSession(redirectPath: string) {
  const session = await requireChurchSession(redirectPath);
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") {
    throw new Error("Ministry management access is required.");
  }
  return session;
}

async function assertMinistryBelongsToChurch(churchId: string, ministryId: string) {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.ministries
        where id = $1
          and church_id = $2
        limit 1
      `,
      [ministryId, churchId],
    );

    if (!result.rows[0]) {
      throw new Error("Ministry not found in this church.");
    }

    return;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("ministries")
    .select("id")
    .eq("id", ministryId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Ministry not found in this church.");
  }
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

async function assertProfilesBelongToChurch(churchId: string, profileIds: string[]) {
  const uniqueProfileIds = Array.from(new Set(profileIds));

  if (uniqueProfileIds.length === 0) {
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where church_id = $1
          and merged_at is null
          and id = any($2::uuid[])
      `,
      [churchId, uniqueProfileIds],
    );

    if (result.rows.length !== uniqueProfileIds.length) {
      throw new Error("One or more profiles were not found in this church.");
    }

    return;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("church_id", churchId)
    .is("merged_at", null)
    .in("id", uniqueProfileIds);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length !== uniqueProfileIds.length) {
    throw new Error("One or more profiles were not found in this church.");
  }
}

export async function createMinistryAction(input: CreateMinistryInput) {
  const validationError = validateCreateMinistryInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireMinistryManagerSession("/app/church-admin");
  const name = input.name.trim();
  const visionStatement = input.visionStatement?.trim() || null;
  const scripturalAnchor = input.scripturalAnchor.filter((s) => s.trim());

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.ministries (church_id, name, ministry_type, vision_statement, scriptural_anchor)
        values ($1, $2, $3, $4, $5)
      `,
      [
        session.appContext.church.id,
        name,
        input.ministryType,
        visionStatement,
        scripturalAnchor,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("ministries").insert({
      church_id: session.appContext.church.id,
      name,
      ministry_type: input.ministryType,
      vision_statement: visionStatement,
      scriptural_anchor: scripturalAnchor,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/pastor");
}

export async function updateMinistryAction(input: UpdateMinistryInput) {
  const validationError = validateUpdateMinistryInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireMinistryManagerSession("/app/church-admin");
  const name = input.name.trim();
  const visionStatement = input.visionStatement?.trim() || null;
  const scripturalAnchor = input.scripturalAnchor.filter((s) => s.trim());
  const leaderProfileId = input.leaderProfileId?.trim() || null;
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    return;
  }

  if (input.ministryId) {
    await assertMinistryBelongsToChurch(churchId, input.ministryId);
  }

  if (shouldUseLocalTenantFallback()) {
    if (leaderProfileId) {
      await assertProfileBelongsToChurch(churchId, leaderProfileId);
    }

    await queryTenantLocalDb(
      `
        update public.ministries
        set
          name               = $1,
          ministry_type      = $2,
          vision_statement   = $3,
          scriptural_anchor  = $4,
          leader_profile_id  = $5,
          updated_at         = timezone('utc', now())
        where id        = $6
          and church_id = $7
      `,
      [
        name,
        input.ministryType,
        visionStatement,
        scripturalAnchor,
        leaderProfileId,
        input.ministryId,
        churchId,
      ],
    );

    if (leaderProfileId) {
      await queryTenantLocalDb(
        `
          insert into public.profile_ministries (church_id, profile_id, ministry_id, role)
          values ($1, $2, $3, 'leader')
          on conflict (profile_id, ministry_id) do update
            set role = 'leader'
        `,
        [churchId, leaderProfileId, input.ministryId],
      );
    }
  } else {
    const supabase = await createTenantServerClient();

    if (leaderProfileId) {
      await assertProfileBelongsToChurch(churchId, leaderProfileId);
    }

    const { error } = await supabase
      .from("ministries")
      .update({
        name,
        ministry_type: input.ministryType,
        vision_statement: visionStatement,
        scriptural_anchor: scripturalAnchor,
        leader_profile_id: leaderProfileId,
      })
      .eq("id", input.ministryId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);

    if (leaderProfileId) {
      const { error: memberError } = await supabase.from("profile_ministries").upsert(
        {
          church_id: churchId,
          profile_id: leaderProfileId,
          ministry_id: input.ministryId,
          role: "leader",
        },
        { onConflict: "profile_id,ministry_id" },
      );

      if (memberError) throw new Error(memberError.message);
    }
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/ministry");
  revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
  revalidatePath("/app/pastor");
}

export async function deleteMinistryAction(input: DeleteMinistryInput) {
  if (!input.ministryId.trim()) throw new Error("Ministry is required.");
  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    return;
  }

  await assertMinistryBelongsToChurch(churchId, input.ministryId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `delete from public.ministries where id = $1 and church_id = $2`,
      [input.ministryId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("ministries")
      .delete()
      .eq("id", input.ministryId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/pastor");
}

export async function assignMembersToMinistryAction(input: AssignMembersToMinistryInput) {
  const validationError = validateAssignMembersInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    return;
  }

  await assertMinistryBelongsToChurch(churchId, input.ministryId);
  await assertProfilesBelongToChurch(churchId, input.profileIds);

  if (shouldUseLocalTenantFallback()) {
    for (const profileId of input.profileIds) {
      await queryTenantLocalDb(
        `
          insert into public.profile_ministries (church_id, profile_id, ministry_id, role)
          select $1, $2, $3, $4
          where exists (
            select 1 from public.profiles where id = $2 and church_id = $1
          )
          on conflict (profile_id, ministry_id) do update
            set role = excluded.role
        `,
        [churchId, profileId, input.ministryId, input.role],
      );
    }
  } else {
    const supabase = await createTenantServerClient();
    const records = input.profileIds.map((profileId) => ({
      church_id: churchId,
      profile_id: profileId,
      ministry_id: input.ministryId,
      role: input.role,
    }));
    const { error } = await supabase
      .from("profile_ministries")
      .upsert(records, { onConflict: "profile_id,ministry_id" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/ministry");
  revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
  revalidatePath("/app/member/ministries");
  revalidatePath("/app/pastor");
}

export async function removeMemberFromMinistryAction(input: RemoveMemberFromMinistryInput) {
  if (!input.ministryId.trim() || !input.profileId.trim()) {
    throw new Error("Ministry and profile are required.");
  }
  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    return;
  }

  await assertMinistryBelongsToChurch(churchId, input.ministryId);
  await assertProfileBelongsToChurch(churchId, input.profileId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        delete from public.profile_ministries
        where ministry_id = $1 and profile_id = $2 and church_id = $3
      `,
      [input.ministryId, input.profileId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("profile_ministries")
      .delete()
      .eq("ministry_id", input.ministryId)
      .eq("profile_id", input.profileId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/ministry");
  revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
  revalidatePath("/app/member/ministries");
  revalidatePath("/app/pastor");
}

export async function updateMinistryHealthScoreAction(input: UpdateMinistryHealthScoreInput) {
  const validationError = validateUpdateMinistryHealthScoreInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;
  const score = Math.round(input.healthScore * 100) / 100;
  const notes = input.notes?.trim() || null;
  const now = new Date().toISOString();

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
    return;
  }

  await assertMinistryBelongsToChurch(churchId, input.ministryId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.ministries
        set health_score = $1, last_health_assessment = $2, updated_at = timezone('utc', now())
        where id = $3 and church_id = $4
      `,
      [score, now, input.ministryId, churchId],
    );
    await queryTenantLocalDb(
      `
        insert into public.ministry_health_history
          (ministry_id, church_id, health_score, assessment_date, notes)
        values ($1, $2, $3, $4, $5)
      `,
      [input.ministryId, churchId, score, now, notes],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error: updateError } = await supabase
      .from("ministries")
      .update({ health_score: score, last_health_assessment: now })
      .eq("id", input.ministryId)
      .eq("church_id", churchId);
    if (updateError) throw new Error(updateError.message);

    const { error: historyError } = await supabase.from("ministry_health_history").insert({
      ministry_id: input.ministryId,
      church_id: churchId,
      health_score: score,
      assessment_date: now,
      notes,
    });
    if (historyError) throw new Error(historyError.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
  revalidatePath("/app/church-admin/ministry");
  revalidatePath("/app/pastor");
}

export async function logKingdomImpactAction(input: LogKingdomImpactInput) {
  const validationError = validateLogKingdomImpactInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;
  const description = input.description?.trim() || null;
  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt).toISOString()
    : new Date().toISOString();

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    return;
  }

  if (input.ministryId) {
    await assertMinistryBelongsToChurch(churchId, input.ministryId);
  }
  const createdBy = await resolveActiveChurchProfileId(session);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.kingdom_impacts
          (church_id, ministry_id, impact_type, description, occurred_at, created_by)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        churchId,
        input.ministryId,
        input.impactType,
        description,
        occurredAt,
        createdBy,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("kingdom_impacts").insert({
      church_id: churchId,
      ministry_id: input.ministryId,
      impact_type: input.impactType,
      description,
      occurred_at: occurredAt,
      created_by: createdBy,
    });
    if (error) throw new Error(error.message);
  }

  if (input.ministryId) {
    revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
  }
  revalidatePath("/app/church-admin");
  revalidatePath("/app/pastor");
}

export async function updateMinistryVisionAction(input: UpdateMinistryVisionInput) {
  if (!input.ministryId.trim()) throw new Error("Ministry is required.");
  if (input.visionStatement && input.visionStatement.trim().length > 2000) {
    throw new Error("Vision statement is too long.");
  }

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;
  const visionStatement = input.visionStatement?.trim() || null;
  const scripturalAnchor = input.scripturalAnchor.filter((s) => s.trim());

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
    return;
  }

  await assertMinistryBelongsToChurch(churchId, input.ministryId);

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.ministries
        set vision_statement = $1, scriptural_anchor = $2, updated_at = timezone('utc', now())
        where id = $3 and church_id = $4
      `,
      [visionStatement, scripturalAnchor, input.ministryId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("ministries")
      .update({ vision_statement: visionStatement, scriptural_anchor: scripturalAnchor })
      .eq("id", input.ministryId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
  revalidatePath("/app/pastor");
}

// ============================================================
// Phase 3: AI Volunteer Matcher + Burnout Guardian actions
// ============================================================

export type SuggestVolunteersInput = {
  ministryId: string;
};

export type ReviewVolunteerMatchInput = {
  suggestionId: string;
  decision: "approved" | "rejected";
  ministryRole?: "member" | "leader" | "assistant_leader";
};

export type AcknowledgeBurnoutAlertInput = {
  alertId: string;
};

export type CalculateBurnoutAlertsInput = {
  ministryId: string;
};

function validateSuggestVolunteersInput(input: SuggestVolunteersInput): string | null {
  if (!input.ministryId.trim()) return "Ministry is required.";
  return null;
}

function validateReviewVolunteerMatchInput(input: ReviewVolunteerMatchInput): string | null {
  if (!input.suggestionId.trim()) return "Suggestion is required.";
  if (!["approved", "rejected"].includes(input.decision)) return "Decision must be approved or rejected.";
  if (
    input.decision === "approved" &&
    input.ministryRole !== undefined &&
    !["member", "leader", "assistant_leader"].includes(input.ministryRole)
  ) {
    return "Invalid ministry role.";
  }
  return null;
}

// ── suggestVolunteersAction ──────────────────────────────────
// Builds a ranked list of volunteer candidates using rule-based
// matching on spiritual_gifts, interests, and current load.
//
// PHASE 3 STUB: The LLM integration point is marked below.
// When a private LLM endpoint is available, replace the
// rule-based scorer with a call to the approved prompt template.
//
// Approved guardrail prompt template (store in prompt library):
// ─────────────────────────────────────────────────────────────
// SYSTEM:
//   You are an assistive ministry matching tool for ChurchCore.
//   Your role is to SUGGEST — never decide — volunteer placements.
//   Every response must begin with this disclaimer:
//   "This is an assistive tool only. It does not replace prayer,
//    pastoral discernment, or human calling."
//   You may only reference the provided member data (spiritual
//   gifts, interests, current load). You must not make
//   assumptions about a person's calling, spiritual maturity,
//   or character. You must not recommend anyone whose
//   contact_allowed flag is false.
//
// USER:
//   Ministry: {{ministry.name}} (type: {{ministry.ministry_type}})
//   Vision: {{ministry.vision_statement}}
//   Scriptural anchors: {{ministry.scriptural_anchor}}
//   Available candidates (contact_allowed = true, directory_visible = true):
//   {{candidates_json}}
//   Rank these candidates by fit. For each, give:
//     - match_score (0–100)
//     - reason_text (1 sentence, factual, gift/interest based only)
//   Return JSON array: [{profile_id, match_score, reason_text}]
// ─────────────────────────────────────────────────────────────
export async function suggestVolunteersAction(input: SuggestVolunteersInput) {
  const validationError = validateSuggestVolunteersInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
    return;
  }

  await assertMinistryBelongsToChurch(churchId, input.ministryId);

  // ── Fetch ministry details ──
  let ministryName = "";
  let ministryType: string | null = null;
  let visionStatement: string | null = null;
  let scripturalAnchor: string[] = [];

  // ── Fetch candidate profiles ──
  // Only members who are: contact_allowed, directory_visible,
  // not already in this ministry, and not at high burnout load.
  type CandidateRow = {
    id: string;
    full_name: string;
    spiritual_gifts: string | null;
    interests: string | null;
    current_ministry_load: number | string;
  };

  type MinistryRow = {
    name: string;
    ministry_type: string | null;
    vision_statement: string | null;
    scriptural_anchor: string[] | null;
  };

  if (shouldUseLocalTenantFallback()) {
    const ministryResult = await queryTenantLocalDb<MinistryRow>(
      `
        select name, ministry_type, vision_statement, scriptural_anchor
        from public.ministries
        where id = $1 and church_id = $2
        limit 1
      `,
      [input.ministryId, churchId],
    );

    if (!ministryResult.rows[0]) throw new Error("Ministry not found.");
    const m = ministryResult.rows[0];
    ministryName = m.name;
    ministryType = m.ministry_type;
    visionStatement = m.vision_statement;
    scripturalAnchor = m.scriptural_anchor ?? [];

    const candidatesResult = await queryTenantLocalDb<CandidateRow>(
      `
        select
          p.id,
          p.full_name,
          p.spiritual_gifts::text as spiritual_gifts,
          p.interests::text as interests,
          p.current_ministry_load
        from public.profiles p
        where p.church_id        = $1
          and p.contact_allowed  = true
          and p.directory_visible = true
          and p.membership_status in ('active', 'baptized')
          and p.current_ministry_load <= $2
          and not exists (
            select 1 from public.profile_ministries pm
            where pm.profile_id  = p.id
              and pm.ministry_id = $3
          )
        order by p.current_ministry_load asc, p.full_name
        limit 30
      `,
      [churchId, 5, input.ministryId],
    );

    // ── Rule-based scorer (stub for LLM replacement) ──────────
    const suggestions = candidatesResult.rows.map((candidate) => {
      let gifts: string[] = [];
      let interests: string[] = [];
      try {
        const parsedGifts = candidate.spiritual_gifts
          ? JSON.parse(candidate.spiritual_gifts)
          : null;
        if (Array.isArray(parsedGifts)) gifts = parsedGifts;
      } catch { /* ignore */ }
      try {
        const parsedInterests = candidate.interests
          ? JSON.parse(candidate.interests)
          : null;
        if (Array.isArray(parsedInterests)) interests = parsedInterests;
      } catch { /* ignore */ }

      const score = ruleBasedMatchScore({
        gifts,
        interests,
        load: Number(candidate.current_ministry_load),
        ministryType,
        visionStatement,
        scripturalAnchor,
      });

      return {
        profileId: candidate.id,
        matchScore: score.score,
        reasonText: score.reason,
      };
    });

    // Delete existing pending suggestions for this ministry, then insert fresh
    await queryTenantLocalDb(
      `delete from public.volunteer_match_suggestions where ministry_id = $1 and church_id = $2 and status = 'pending'`,
      [input.ministryId, churchId],
    );

    for (const s of suggestions.filter((s) => s.matchScore > 10)) {
      await queryTenantLocalDb(
        `
          insert into public.volunteer_match_suggestions
            (church_id, ministry_id, profile_id, match_score, reason_text, ai_generated)
          values ($1, $2, $3, $4, $5, false)
          on conflict do nothing
        `,
        [churchId, input.ministryId, s.profileId, s.matchScore, s.reasonText],
      );
    }
  } else {
    const supabase = await createTenantServerClient();

    const { data: ministryRow, error: mErr } = await supabase
      .from("ministries")
      .select("name, ministry_type, vision_statement, scriptural_anchor")
      .eq("id", input.ministryId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (mErr) throw new Error(mErr.message);
    if (!ministryRow) throw new Error("Ministry not found.");

    ministryName = ministryRow.name;
    ministryType = ministryRow.ministry_type ?? null;
    visionStatement = ministryRow.vision_statement ?? null;
    scripturalAnchor = (ministryRow.scriptural_anchor as string[]) ?? [];

    // Fetch existing ministry member profile IDs to exclude them
    const { data: existingMembers } = await supabase
      .from("profile_ministries")
      .select("profile_id")
      .eq("ministry_id", input.ministryId);
    const excludeIds = (existingMembers ?? []).map((r) => r.profile_id);

    const candidateQuery = supabase
      .from("profiles")
      .select("id, full_name, spiritual_gifts, interests, current_ministry_load")
      .eq("church_id", churchId)
      .eq("contact_allowed", true)
      .eq("directory_visible", true)
      .in("membership_status", ["active", "baptized"])
      .lte("current_ministry_load", 5)
      .order("current_ministry_load", { ascending: true })
      .limit(30);

    if (excludeIds.length > 0) {
      candidateQuery.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data: candidateRows, error: cErr } = await candidateQuery;
    if (cErr) throw new Error(cErr.message);

    const suggestions = (candidateRows ?? []).map((candidate) => {
      const gifts = Array.isArray(candidate.spiritual_gifts)
        ? (candidate.spiritual_gifts as string[])
        : [];
      const interests = Array.isArray(candidate.interests)
        ? (candidate.interests as string[])
        : [];

      const score = ruleBasedMatchScore({
        gifts,
        interests,
        load: candidate.current_ministry_load ?? 0,
        ministryType,
        visionStatement,
        scripturalAnchor,
      });

      return { profileId: candidate.id, matchScore: score.score, reasonText: score.reason };
    });

    // Upsert — delete pending, reinsert fresh scored list
    await supabase
      .from("volunteer_match_suggestions")
      .delete()
      .eq("ministry_id", input.ministryId)
      .eq("church_id", churchId)
      .eq("status", "pending");

    const toInsert = suggestions
      .filter((s) => s.matchScore > 10)
      .map((s) => ({
        church_id: churchId,
        ministry_id: input.ministryId,
        profile_id: s.profileId,
        match_score: s.matchScore,
        reason_text: s.reasonText,
        ai_generated: false, // Rule-based; set true when LLM path is live
      }));

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("volunteer_match_suggestions")
        .insert(toInsert);
      if (insertErr) throw new Error(insertErr.message);
    }
  }

  // Silence unused-variable warning for ministryName until LLM call is added
  void ministryName;

  revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
}

// ── Rule-based match scorer ──────────────────────────────────
// Produces a 0–100 score and human-readable reason.
// Intended to be replaced by an LLM call in a future sprint.
// Factors:
//   - Gift alignment with ministry type (40 pts)
//   - Interest alignment with vision/anchors (30 pts)
//   - Low current load bonus (30 pts)
// ─────────────────────────────────────────────────────────────
const MINISTRY_GIFT_MAP: Record<string, string[]> = {
  worship:        ["worship", "music", "arts", "intercession"],
  outreach:       ["evangelism", "service", "compassion", "hospitality"],
  discipleship:   ["teaching", "discipleship", "wisdom", "knowledge"],
  care:           ["mercy", "compassion", "helps", "healing", "intercession"],
  administration: ["administration", "leadership", "helps", "wisdom"],
  youth:          ["teaching", "discipleship", "evangelism", "leadership"],
  children:       ["teaching", "helps", "compassion", "faith"],
  missions:       ["evangelism", "faith", "service", "giving"],
};

function ruleBasedMatchScore(params: {
  gifts: string[];
  interests: string[];
  load: number;
  ministryType: string | null;
  visionStatement: string | null;
  scripturalAnchor: string[];
}): { score: number; reason: string } {
  const { gifts, interests, load, ministryType } = params;

  const lowerGifts = gifts.map((g) => g.toLowerCase());
  const lowerInterests = interests.map((i) => i.toLowerCase());
  const alignedGifts = ministryType
    ? (MINISTRY_GIFT_MAP[ministryType] ?? []).filter((g) => lowerGifts.includes(g))
    : [];

  // Gift alignment score (0–40)
  const giftScore = ministryType
    ? Math.min(alignedGifts.length / Math.max((MINISTRY_GIFT_MAP[ministryType]?.length ?? 1), 1), 1) * 40
    : 20; // neutral when no type set

  // Interest alignment score (0–30) — keyword scan against interests
  const interestScore = lowerInterests.length > 0 ? Math.min(lowerInterests.length * 5, 30) : 10;

  // Load bonus (0–30) — prefer low-load candidates
  const loadScore = Math.max(30 - load * 5, 0);

  const total = Math.round(giftScore + interestScore + loadScore);

  const reasonParts: string[] = [];
  if (alignedGifts.length > 0) {
    reasonParts.push(`Gifted in ${alignedGifts.slice(0, 2).join(" and ")}`);
  }
  if (load === 0) {
    reasonParts.push("currently not serving in any ministry");
  } else if (load <= 2) {
    reasonParts.push(`serving in ${load} ministr${load === 1 ? "y" : "ies"} — good capacity`);
  }
  const reason = reasonParts.length > 0
    ? reasonParts.join("; ") + "."
    : "No specific gift or interest overlap detected — review manually.";

  return { score: total, reason };
}

// ── reviewVolunteerMatchAction ───────────────────────────────
// Approve: assigns the person to the ministry and marks the
//          suggestion as approved.
// Reject: marks as rejected — no profile_ministries write.
// Full audit: reviewed_by + reviewed_at recorded on every review.
// ─────────────────────────────────────────────────────────────
export async function reviewVolunteerMatchAction(input: ReviewVolunteerMatchInput) {
  const validationError = validateReviewVolunteerMatchInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;
  const now = new Date().toISOString();
  const role = input.ministryRole ?? "member";

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin");
    return;
  }

  // Resolve the reviewer's profile_id
  let reviewerProfileId: string | null = null;

  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<{ id: string }>(
      `select id from public.profiles where user_id = $1 and church_id = $2 limit 1`,
      [session.userId, churchId],
    );
    reviewerProfileId = profileResult.rows[0]?.id ?? null;

    // Fetch the suggestion row
    const suggestionResult = await queryTenantLocalDb<{
      id: string;
      ministry_id: string;
      profile_id: string;
      status: string;
    }>(
      `select id, ministry_id, profile_id, status from public.volunteer_match_suggestions where id = $1 and church_id = $2 limit 1`,
      [input.suggestionId, churchId],
    );

    const suggestion = suggestionResult.rows[0];
    if (!suggestion) throw new Error("Suggestion not found.");
    if (suggestion.status !== "pending") throw new Error("Suggestion has already been reviewed.");

    // Mark suggestion reviewed
    await queryTenantLocalDb(
      `
        update public.volunteer_match_suggestions
        set status = $1, reviewed_by = $2, reviewed_at = $3
        where id = $4 and church_id = $5
      `,
      [input.decision, reviewerProfileId, now, input.suggestionId, churchId],
    );

    // If approved, assign to ministry
    if (input.decision === "approved") {
      await queryTenantLocalDb(
        `
          insert into public.profile_ministries (church_id, profile_id, ministry_id, role)
          select $1, $2, $3, $4
          where exists (select 1 from public.profiles where id = $2 and church_id = $1)
          on conflict (profile_id, ministry_id) do update
            set role = excluded.role
        `,
        [churchId, suggestion.profile_id, suggestion.ministry_id, role],
      );
    }

    revalidatePath(`/app/church-admin/ministry/${suggestion.ministry_id}`);
  } else {
    const supabase = await createTenantServerClient();

    const { data: reviewerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", session.userId)
      .eq("church_id", churchId)
      .maybeSingle();
    reviewerProfileId = reviewerProfile?.id ?? null;

    const { data: suggestion, error: sErr } = await supabase
      .from("volunteer_match_suggestions")
      .select("id, ministry_id, profile_id, status")
      .eq("id", input.suggestionId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!suggestion) throw new Error("Suggestion not found.");
    if (suggestion.status !== "pending") throw new Error("Suggestion has already been reviewed.");

    const { error: updateErr } = await supabase
      .from("volunteer_match_suggestions")
      .update({
        status: input.decision,
        reviewed_by: reviewerProfileId,
        reviewed_at: now,
      })
      .eq("id", input.suggestionId)
      .eq("church_id", churchId);

    if (updateErr) throw new Error(updateErr.message);

    if (input.decision === "approved") {
      const { error: assignErr } = await supabase
        .from("profile_ministries")
        .upsert(
          {
            church_id: churchId,
            profile_id: suggestion.profile_id,
            ministry_id: suggestion.ministry_id,
            role,
          },
          { onConflict: "profile_id,ministry_id" },
        );
      if (assignErr) throw new Error(assignErr.message);
    }

    revalidatePath(`/app/church-admin/ministry/${suggestion.ministry_id}`);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/pastor");
  revalidatePath("/app/member/ministries");
}

// ── calculateBurnoutAlertsAction ─────────────────────────────
// Re-evaluates burnout risk for all members of a ministry and
// persists new alerts. Does not duplicate recent alerts.
// ─────────────────────────────────────────────────────────────
export async function calculateBurnoutAlertsAction(input: CalculateBurnoutAlertsInput) {
  if (!input.ministryId.trim()) throw new Error("Ministry is required.");

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7-day dedup window

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
    return;
  }

  await assertMinistryBelongsToChurch(churchId, input.ministryId);

  if (shouldUseLocalTenantFallback()) {
    const membersResult = await queryTenantLocalDb<{
      profile_id: string;
      full_name: string;
      current_ministry_load: string;
    }>(
      `
        select pm.profile_id, p.full_name, p.current_ministry_load
        from public.profile_ministries pm
        join public.profiles p on p.id = pm.profile_id
        where pm.ministry_id = $1
      `,
      [input.ministryId],
    );

    for (const row of membersResult.rows) {
      const load = parseInt(row.current_ministry_load, 10) || 0;
      const severity = load > 5 ? "high" : load > 3 ? "medium" : null;
      if (!severity) continue;

      // Dedup: skip if a non-acknowledged alert for this profile+type exists within 7 days
      const existing = await queryTenantLocalDb<{ id: string }>(
        `
          select id from public.burnout_alerts
          where profile_id  = $1
            and church_id   = $2
            and alert_type  = 'high_load'
            and acknowledged = false
            and created_at  > $3
          limit 1
        `,
        [row.profile_id, churchId, cutoff],
      );

      if (existing.rows.length > 0) continue;

      await queryTenantLocalDb(
        `
          insert into public.burnout_alerts
            (church_id, profile_id, ministry_id, alert_type, message, severity)
          values ($1, $2, $3, 'high_load', $4, $5)
        `,
        [
          churchId,
          row.profile_id,
          input.ministryId,
          load > 5
            ? `${row.full_name} is serving in ${load} ministries — high burnout risk.`
            : `${row.full_name} is serving in ${load} ministries — review their capacity.`,
          severity,
        ],
      );
    }
  } else {
    const supabase = await createTenantServerClient();

    const { data: members, error: mErr } = await supabase
      .from("profile_ministries")
      .select("profile_id, profiles(full_name, current_ministry_load)")
      .eq("ministry_id", input.ministryId);

    if (mErr) throw new Error(mErr.message);

    for (const row of members ?? []) {
      const profile = row.profiles as unknown as {
        full_name: string;
        current_ministry_load: number | null;
      } | null;
      const load = profile?.current_ministry_load ?? 0;
      const severity = load > 5 ? "high" : load > 3 ? "medium" : null;
      if (!severity) continue;

      const { data: existing } = await supabase
        .from("burnout_alerts")
        .select("id")
        .eq("profile_id", row.profile_id)
        .eq("church_id", churchId)
        .eq("alert_type", "high_load")
        .eq("acknowledged", false)
        .gte("created_at", cutoff)
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      await supabase.from("burnout_alerts").insert({
        church_id: churchId,
        profile_id: row.profile_id,
        ministry_id: input.ministryId,
        alert_type: "high_load",
        message:
          load > 5
            ? `${profile?.full_name ?? "A volunteer"} is serving in ${load} ministries — high burnout risk.`
            : `${profile?.full_name ?? "A volunteer"} is serving in ${load} ministries — review their capacity.`,
        severity,
      });
    }
  }

  revalidatePath(`/app/church-admin/ministry/${input.ministryId}`);
}

// ── acknowledgeBurnoutAlertAction ────────────────────────────
export async function acknowledgeBurnoutAlertAction(input: AcknowledgeBurnoutAlertInput) {
  if (!input.alertId.trim()) throw new Error("Alert is required.");

  const session = await requireMinistryManagerSession("/app/church-admin");
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.burnout_alerts set acknowledged = true where id = $1 and church_id = $2`,
      [input.alertId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("burnout_alerts")
      .update({ acknowledged: true })
      .eq("id", input.alertId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
}

export async function upsertMemberFamilyAction(
  input: UpdateFamilyInput,
): Promise<MemberSelfServiceUpdateResult> {
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
    return { status: "saved" };
  }

  const activeProfileId = await resolveSessionProfileId(session);
  if (!activeProfileId) {
    throw new Error("No church profile was found for this account.");
  }

  const requestId = await queueMemberChangeRequest(session, {
    targetProfileId: activeProfileId,
    changeType: "family",
    proposedChanges: {
      familyName,
      address,
      homePhone,
    },
  });

  revalidatePath("/app/member");
  revalidatePath("/app/member/family");
  revalidatePath("/app/member/directory");
  revalidatePath("/portal");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");

  return {
    status: "pending_review",
    requestId: requestId ?? undefined,
  };
}

export async function reviewMemberChangeRequestAction(
  input: ReviewMemberChangeRequestInput,
) {
  const reviewerContext = await requireChurchAdminProfileContext(
    "/app/church-admin/people",
  );
  const churchId = reviewerContext.session.appContext.church.id;

  const requestId = input.requestId.trim();
  if (!requestId) throw new Error("A request id is required.");
  if (input.decision !== "approved" && input.decision !== "rejected") {
    throw new Error("Decision must be approved or rejected.");
  }

  const reviewerNote = input.reviewerNote?.trim() || null;
  const reviewerProfileId = reviewerContext.profileId;

  if (!hasTenantBackendEnv() || reviewerContext.session.source !== "supabase") {
    revalidatePath("/app/church-admin/people");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    const requestResult = await queryTenantLocalDb<{
      id: string;
      target_profile_id: string;
      change_type: MemberChangeRequestType;
      proposed_changes: unknown;
      status: MemberChangeRequestStatus;
    }>(
      `
        select id, target_profile_id, change_type, proposed_changes, status
        from public.member_change_requests
        where id = $1
          and church_id = $2
        limit 1
      `,
      [requestId, churchId],
    );

    const requestRow = requestResult.rows[0];
    if (!requestRow) throw new Error("Change request not found.");
    if (requestRow.status !== "pending") {
      throw new Error("Only pending requests can be reviewed.");
    }

    if (input.decision === "approved") {
      if (requestRow.change_type === "profile") {
        await applyApprovedProfileChanges(
          churchId,
          requestRow.target_profile_id,
          parseProfileChangePayload(requestRow.proposed_changes),
        );
      } else {
        await applyApprovedFamilyChanges(
          churchId,
          requestRow.target_profile_id,
          parseFamilyChangePayload(requestRow.proposed_changes),
        );
      }
    }

    await queryTenantLocalDb(
      `
        update public.member_change_requests
        set
          status = $1,
          reviewer_profile_id = $2,
          reviewer_note = $3,
          reviewed_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
        where id = $4
          and church_id = $5
      `,
      [input.decision, reviewerProfileId, reviewerNote, requestId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { data: requestRow, error: requestError } = await supabase
      .from("member_change_requests")
      .select("id, target_profile_id, change_type, proposed_changes, status")
      .eq("id", requestId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (requestError) throw new Error(requestError.message);
    if (!requestRow) throw new Error("Change request not found.");
    if (requestRow.status !== "pending") {
      throw new Error("Only pending requests can be reviewed.");
    }

    if (input.decision === "approved") {
      if (requestRow.change_type === "profile") {
        await applyApprovedProfileChanges(
          churchId,
          requestRow.target_profile_id,
          parseProfileChangePayload(requestRow.proposed_changes),
        );
      } else {
        await applyApprovedFamilyChanges(
          churchId,
          requestRow.target_profile_id,
          parseFamilyChangePayload(requestRow.proposed_changes),
        );
      }
    }

    const { error: updateError } = await supabase
      .from("member_change_requests")
      .update({
        status: input.decision,
        reviewer_profile_id: reviewerProfileId,
        reviewer_note: reviewerNote,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("church_id", churchId);

    if (updateError) throw new Error(updateError.message);
  }

  revalidatePath("/app/church-admin/people");
  revalidatePath("/app/member");
  revalidatePath("/app/member/family");
  revalidatePath("/app/member/directory");
  revalidatePath("/portal");
  revalidatePath("/app/pastor");
  revalidatePath("/app/pastor/people");
}

// ── Add churchgoer (offline record, no auth account required) ─────────────

export type AddChurchgoerInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  role: string;
};

function validateAddChurchgoerInput(input: AddChurchgoerInput): string | null {
  const name = input.fullName.trim();
  if (!name) return "Full name is required.";
  if (name.length > 200) return "Full name is too long.";
  const validStatuses = new Set(["active", "visitor", "inactive", "baptized", "transferred"]);
  if (!validStatuses.has(input.membershipStatus)) return "Invalid membership status.";
  const validRoles = new Set(["church_admin", "secretary", "pastor", "ministry_leader", "member"]);
  if (!validRoles.has(input.role)) return "Invalid role.";
  return null;
}

export async function addChurchgoerAction(input: AddChurchgoerInput) {
  const validationError = validateAddChurchgoerInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireChurchAdminSession("/app/church-admin/people");
  const churchId = session.appContext.church.id;

  const fullName = input.fullName.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const profileRole = mapManagedRoleToProfileRole(input.role as ChurchAdminManagedRole);

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin/people");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.profiles
          (full_name, email, church_id, role, membership_status, directory_visible, contact_allowed,
           phone, updated_at, created_at)
        values ($1, $2, $3, $4, $5, false, false, $6, timezone('utc', now()), timezone('utc', now()))
        on conflict (email) where email is not null
        do update set
          church_id         = excluded.church_id,
          full_name         = excluded.full_name,
          role              = excluded.role,
          membership_status = excluded.membership_status,
          phone             = excluded.phone,
          updated_at        = timezone('utc', now())
      `,
      [fullName, email, churchId, profileRole, input.membershipStatus, phone],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("profiles").insert({
      full_name: fullName,
      email,
      church_id: churchId,
      role: profileRole,
      membership_status: input.membershipStatus,
      phone,
      directory_visible: false,
      contact_allowed: false,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/people");
}

// ── Invite user by email (Supabase auth invite or stub) ───────────────────

export type InviteUserInput = {
  email: string;
  role: string;
  fullName: string | null;
};

function validateInviteUserInput(input: InviteUserInput): string | null {
  if (!input.email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Enter a valid email address.";
  const validRoles = new Set(["church-admin", "secretary", "pastor", "ministry-leader", "member"]);
  if (!validRoles.has(input.role)) return "Invalid role.";
  return null;
}

export async function inviteUserAction(input: InviteUserInput) {
  const validationError = validateInviteUserInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireChurchAdminSession("/app/church-admin/people");

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { ok: false, error: "Backend not configured. Supabase connection required." };
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName?.trim() || null;
  const membershipRole =
    input.role === "church-admin"
      ? "church_admin"
      : input.role === "ministry-leader"
        ? "ministry_leader"
        : input.role;
  const profileRole =
    input.role === "church-admin"
      ? "church_admin"
      : input.role === "secretary"
        ? "secretary"
      : input.role === "ministry-leader"
        ? "ministry_leader"
        : input.role === "pastor"
          ? "pastor_elder"
          : "member_volunteer";

  if (!hasTenantAdminBackendEnv()) {
    return { ok: false, error: "Backend not configured. Supabase connection required." };
  }

  const admin = createTenantAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      church_id: session.appContext.church.id,
      role: membershipRole,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/${input.role}`,
  });

  if (error) throw new Error(error.message);

  const userId = data.user?.id;

  if (userId) {
    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("id, member_number")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfileError) throw new Error(existingProfileError.message);

    let memberNumber = existingProfile?.member_number ?? null;

    if (!memberNumber && membershipRole === "member") {
      const { data: generatedMemberNumber, error: memberNumberError } = await admin.rpc(
        "generate_member_number",
      );

      if (memberNumberError) throw new Error(memberNumberError.message);
      memberNumber = generatedMemberNumber as string;
    }

    if (existingProfile) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({
          church_id: session.appContext.church.id,
          email,
          full_name: fullName,
          role: profileRole,
          account_status: "active",
          member_number: memberNumber,
        })
        .eq("id", existingProfile.id);

      if (profileError) throw new Error(profileError.message);
    }

    const { error: membershipError } = await admin
      .from("church_memberships")
      .upsert(
        {
          church_id: session.appContext.church.id,
          user_id: userId,
          role: membershipRole,
          is_active: true,
        },
        { onConflict: "church_id,user_id,role" },
      );

    if (membershipError) throw new Error(membershipError.message);
  }

  revalidatePath("/app/church-admin/people");
  return { previewMode: false };
}

// ── Deactivate a person from the church ──────────────────────────────────

export type DeactivateChurchAdminPersonInput = {
  profileId: string;
};

export async function deactivateChurchAdminPersonAction(
  input: DeactivateChurchAdminPersonInput,
) {
  if (!input.profileId) throw new Error("A profile ID is required.");

  const session = await requireChurchAdminSession("/app/church-admin/people");
  const churchId = session.appContext.church.id;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/church-admin/people");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.profiles
        set membership_status = 'inactive',
            directory_visible = false,
            contact_allowed   = false,
            updated_at        = timezone('utc', now())
        where id        = $1
          and church_id = $2
      `,
      [input.profileId, churchId],
    );
    await queryTenantLocalDb(
      `
        update public.church_memberships
        set is_active  = false,
            updated_at = timezone('utc', now())
        where user_id  = (select id from public.profiles where id = $1 and church_id = $2 limit 1)
          and church_id = $2
      `,
      [input.profileId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        membership_status: "inactive",
        directory_visible: false,
        contact_allowed: false,
      })
      .eq("id", input.profileId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/church-admin");
  revalidatePath("/app/church-admin/people");
}
