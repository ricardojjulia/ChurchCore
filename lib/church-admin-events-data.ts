import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
import { normalizeRegistrationPaymentStatus } from "@/lib/event-registration-lifecycle";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchAdminEventSummary = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  category: string;
  location: string | null;
  approvalStatus: string;
};

export type ChurchAdminEventRosterEntry = {
  id: string;
  profileId: string;
  fullName: string;
  memberNumber: string | null;
  roleTitle: string;
  isConfirmed: boolean;
  phone: string | null;
  sevenDayLoad: number;
};

export type ChurchAdminEventAttendanceEntry = {
  id: string;
  profileId: string;
  fullName: string;
  memberNumber: string | null;
  familyName: string | null;
  checkedInAt: string;
  status: string;
  checkInMethod: string;
};

export type ChurchAdminEventPersonOption = {
  id: string;
  fullName: string;
  memberNumber: string | null;
  email: string | null;
  phone: string | null;
  accountStatus: string;
  isRosterEligible: boolean;
  lastAttendance: string | null;
  sevenDayLoad: number;
};

export type ChurchAdminCarePrompt = {
  profileId: string;
  fullName: string;
  detail: string;
};

export type ChurchAdminEventWorkspaceData = {
  event: ChurchAdminEventSummary;
  rosterEntries: ChurchAdminEventRosterEntry[];
  attendanceEntries: ChurchAdminEventAttendanceEntry[];
  people: ChurchAdminEventPersonOption[];
  carePrompts: ChurchAdminCarePrompt[];
  aiDisclaimer: string;
  stats: {
    rosterCount: number;
    attendanceCount: number;
    pendingConfirmations: number;
    burnoutWarnings: number;
  };
};

function buildCarePrompts(
  people: ChurchAdminEventPersonOption[],
  attendanceEntries: ChurchAdminEventAttendanceEntry[],
) {
  const attendedProfileIds = new Set(attendanceEntries.map((entry) => entry.profileId));
  const threeWeeksAgo = Date.now() - 21 * 24 * 60 * 60 * 1000;

  return people
    .filter((person) => {
      if (attendedProfileIds.has(person.id)) {
        return false;
      }

      if (!person.lastAttendance) {
        return true;
      }

      return new Date(person.lastAttendance).getTime() < threeWeeksAgo;
    })
    .slice(0, 4)
    .map((person) => ({
      profileId: person.id,
      fullName: person.fullName,
      detail: person.lastAttendance
        ? `Last attendance was recorded on ${new Date(person.lastAttendance).toLocaleDateString("en-US")}.`
        : "No attendance has been recorded yet.",
    }));
}

function withSevenDayLoad<T extends { profileId: string }>(
  entries: T[],
  sevenDayLoadByProfileId: Map<string, number>,
) {
  return entries.map((entry) => ({
    ...entry,
    sevenDayLoad: sevenDayLoadByProfileId.get(entry.profileId) ?? 0,
  }));
}

export type EventRegistration = {
  id: string;
  eventId: string;
  registrantName: string;
  registrantEmail: string | null;
  registrantPhone: string | null;
  status: "pending_approval" | "confirmed" | "cancelled" | "waitlisted" | "attended";
  isWaitlisted: boolean;
  paymentStatus: "not_required" | "pending" | "paid" | "failed" | "refunded";
  amountPaidCents: number;
  stripePaymentIntentId: string | null;
  customFields: Record<string, unknown> | null;
  notes: string | null;
  registeredAt: string;
  checkedInAt: string | null;
};

export type EventRegistrationSettings = {
  id: string;
  eventId: string;
  registrationOpen: boolean;
  capacity: number | null;
  priceCents: number;
  deadline: string | null;
  confirmationMessage: string | null;
  waitlistEnabled: boolean;
  approvalRequired: boolean;
  householdRegistrationEnabled: boolean;
  mobileMemberCheckInEnabled: boolean;
  mobileMemberCheckInStartsAt: string | null;
  mobileMemberCheckInEndsAt: string | null;
  mobileMemberCheckInAccessCode: string | null;
  mobileMemberCheckInAllowHousehold: boolean;
  mobileMemberCheckInLocationLat: number | null;
  mobileMemberCheckInLocationLng: number | null;
  mobileMemberCheckInLocationRadiusMeters: number | null;
  registrationCount: number;
  waitlistCount: number;
};

export type EventRegistrationFormField = {
  id: string;
  eventId: string;
  label: string;
  fieldKey: string;
  fieldType: "text" | "textarea" | "select" | "checkbox" | "number";
  isRequired: boolean;
  options: string[];
  sortOrder: number;
};

export async function getEventRegistrations(
  session: ChurchAppSession,
  eventId: string,
): Promise<{
  registrations: EventRegistration[];
  settings: EventRegistrationSettings | null;
  formFields: EventRegistrationFormField[];
}> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { registrations: [], settings: null, formFields: [] };
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [regRows, settingsRows, fieldRows] = await Promise.all([
      queryTenantLocalDb<{
        id: string; event_id: string; registrant_name: string;
        registrant_email: string | null; registrant_phone: string | null;
        status: string; is_waitlisted: boolean; amount_paid_cents: number;
        payment_status: string | null;
        stripe_payment_intent_id: string | null;
        custom_fields: Record<string, unknown> | null; notes: string | null;
        registered_at: string; checked_in_at: string | null;
      }>(
        `select id, event_id, registrant_name, registrant_email, registrant_phone,
                status, is_waitlisted, payment_status, amount_paid_cents,
                stripe_payment_intent_id, custom_fields, notes,
                registered_at, checked_in_at
         from public.event_registrations
         where event_id = $1 and church_id = $2
         order by registered_at asc`,
        [eventId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; event_id: string; registration_open: boolean;
        capacity: number | null; price_cents: number; deadline: string | null;
        confirmation_message: string | null; waitlist_enabled: boolean;
        approval_required: boolean; household_registration_enabled: boolean;
        mobile_member_check_in_enabled: boolean;
        mobile_member_check_in_starts_at: string | null;
        mobile_member_check_in_ends_at: string | null;
        mobile_member_check_in_access_code: string | null;
        mobile_member_check_in_allow_household: boolean;
        mobile_member_check_in_location_lat: number | null;
        mobile_member_check_in_location_lng: number | null;
        mobile_member_check_in_location_radius_meters: number | null;
      }>(
        `select id, event_id, registration_open, capacity, price_cents,
                deadline, confirmation_message, waitlist_enabled,
                approval_required, household_registration_enabled,
                mobile_member_check_in_enabled, mobile_member_check_in_starts_at,
                mobile_member_check_in_ends_at, mobile_member_check_in_access_code,
                  mobile_member_check_in_allow_household,
                  mobile_member_check_in_location_lat,
                  mobile_member_check_in_location_lng,
                  mobile_member_check_in_location_radius_meters
         from public.event_registration_settings
         where event_id = $1`,
        [eventId],
      ),
      queryTenantLocalDb<{
        id: string; event_id: string; label: string; field_key: string;
        field_type: string; is_required: boolean; options: string[] | null; sort_order: number;
      }>(
        `select id, event_id, label, field_key, field_type, is_required, options, sort_order
         from public.event_registration_form_fields
         where event_id = $1 and church_id = $2
         order by sort_order, created_at`,
        [eventId, churchId],
      ),
    ]);

    const s = settingsRows.rows[0];
    const eventPriceCents = s?.price_cents ?? 0;
    const registrations: EventRegistration[] = regRows.rows.map((r) => ({
      id: r.id,
      eventId: r.event_id,
      registrantName: r.registrant_name,
      registrantEmail: r.registrant_email,
      registrantPhone: r.registrant_phone,
      status: r.status as EventRegistration["status"],
      isWaitlisted: r.is_waitlisted,
      paymentStatus: normalizeRegistrationPaymentStatus({
        status: r.status,
        isWaitlisted: r.is_waitlisted,
        amountPaidCents: r.amount_paid_cents,
        storedPaymentStatus: r.payment_status,
        priceCents: eventPriceCents,
      }),
      amountPaidCents: r.amount_paid_cents,
      customFields: r.custom_fields,
      stripePaymentIntentId: r.stripe_payment_intent_id,
      notes: r.notes,
      registeredAt: r.registered_at,
      checkedInAt: r.checked_in_at,
    }));

    const settings: EventRegistrationSettings | null = s ? {
      id: s.id, eventId: s.event_id, registrationOpen: s.registration_open,
      capacity: s.capacity, priceCents: s.price_cents, deadline: s.deadline,
      confirmationMessage: s.confirmation_message, waitlistEnabled: s.waitlist_enabled,
      approvalRequired: s.approval_required,
      householdRegistrationEnabled: s.household_registration_enabled,
      mobileMemberCheckInEnabled: s.mobile_member_check_in_enabled,
      mobileMemberCheckInStartsAt: s.mobile_member_check_in_starts_at,
      mobileMemberCheckInEndsAt: s.mobile_member_check_in_ends_at,
      mobileMemberCheckInAccessCode: s.mobile_member_check_in_access_code,
      mobileMemberCheckInAllowHousehold: s.mobile_member_check_in_allow_household,
      mobileMemberCheckInLocationLat: s.mobile_member_check_in_location_lat,
      mobileMemberCheckInLocationLng: s.mobile_member_check_in_location_lng,
      mobileMemberCheckInLocationRadiusMeters:
        s.mobile_member_check_in_location_radius_meters,
      registrationCount: registrations.filter((r) => !r.isWaitlisted && r.status !== "cancelled").length,
      waitlistCount: registrations.filter((r) => r.isWaitlisted).length,
    } : null;

    const formFields: EventRegistrationFormField[] = fieldRows.rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      label: row.label,
      fieldKey: row.field_key,
      fieldType: (row.field_type as EventRegistrationFormField["fieldType"]) ?? "text",
      isRequired: row.is_required,
      options: row.options ?? [],
      sortOrder: row.sort_order,
    }));

    return { registrations, settings, formFields };
  }

  const supabase = await createTenantServerClient();
  const [{ data: regData }, { data: settingsData }, { data: formFieldData }] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("*")
      .eq("event_id", eventId)
      .eq("church_id", churchId)
      .order("registered_at"),
    supabase
      .from("event_registration_settings")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("event_registration_form_fields")
      .select("*")
      .eq("event_id", eventId)
      .eq("church_id", churchId)
      .order("sort_order"),
  ]);

  const s = settingsData;
  const eventPriceCents = s?.price_cents ?? 0;
  const registrations: EventRegistration[] = (regData ?? []).map((r) => ({
    id: r.id,
    eventId: r.event_id,
    registrantName: r.registrant_name,
    registrantEmail: r.registrant_email,
    registrantPhone: r.registrant_phone,
    status: r.status as EventRegistration["status"],
    isWaitlisted: r.is_waitlisted,
    paymentStatus: normalizeRegistrationPaymentStatus({
      status: r.status,
      isWaitlisted: r.is_waitlisted,
      amountPaidCents: r.amount_paid_cents,
      storedPaymentStatus: r.payment_status,
      priceCents: eventPriceCents,
    }),
    amountPaidCents: r.amount_paid_cents,
    stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
    customFields: r.custom_fields as Record<string, unknown> | null,
    notes: r.notes,
    registeredAt: r.registered_at,
    checkedInAt: r.checked_in_at,
  }));

  const settings: EventRegistrationSettings | null = s ? {
    id: s.id, eventId: s.event_id, registrationOpen: s.registration_open,
    capacity: s.capacity, priceCents: s.price_cents, deadline: s.deadline,
    confirmationMessage: s.confirmation_message, waitlistEnabled: s.waitlist_enabled,
    approvalRequired: s.approval_required ?? false,
    householdRegistrationEnabled: s.household_registration_enabled ?? false,
    mobileMemberCheckInEnabled: s.mobile_member_check_in_enabled ?? false,
    mobileMemberCheckInStartsAt: s.mobile_member_check_in_starts_at ?? null,
    mobileMemberCheckInEndsAt: s.mobile_member_check_in_ends_at ?? null,
    mobileMemberCheckInAccessCode: s.mobile_member_check_in_access_code ?? null,
    mobileMemberCheckInAllowHousehold: s.mobile_member_check_in_allow_household ?? false,
    mobileMemberCheckInLocationLat: s.mobile_member_check_in_location_lat ?? null,
    mobileMemberCheckInLocationLng: s.mobile_member_check_in_location_lng ?? null,
    mobileMemberCheckInLocationRadiusMeters:
      s.mobile_member_check_in_location_radius_meters ?? null,
    registrationCount: registrations.filter((r) => !r.isWaitlisted && r.status !== "cancelled").length,
    waitlistCount: registrations.filter((r) => r.isWaitlisted).length,
  } : null;

  const formFields: EventRegistrationFormField[] = (formFieldData ?? []).map((field) => ({
    id: field.id,
    eventId: field.event_id,
    label: field.label,
    fieldKey: field.field_key,
    fieldType: (field.field_type as EventRegistrationFormField["fieldType"]) ?? "text",
    isRequired: field.is_required,
    options: (field.options as string[] | null) ?? [],
    sortOrder: field.sort_order,
  }));

  return { registrations, settings, formFields };
}

export type ChurchAdminEventsListEntry = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  category: string;
  location: string | null;
  approvalStatus: string;
  rosterCount: number;
};

export async function getChurchAdminEventsList(
  session: ChurchAppSession,
): Promise<ChurchAdminEventsListEntry[]> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") return [];

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      category: string;
      location: string | null;
      approval_status: string;
      roster_count: number;
    }>(
      `select e.id, e.title, e.starts_at, e.ends_at, e.category, e.location,
              e.approval_status::text as approval_status,
              coalesce((select count(*)::int from public.event_rosters er
                         where er.event_id = e.id), 0) as roster_count
       from public.events e
       where e.church_id = $1
       order by e.starts_at desc
       limit 100`,
      [churchId],
    );
    return result.rows.map((r) => ({
      id: r.id, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at,
      category: r.category, location: r.location,
      approvalStatus: r.approval_status, rosterCount: r.roster_count,
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, category, location, approval_status")
    .eq("church_id", churchId)
    .order("starts_at", { ascending: false })
    .limit(100);

  const eventIds = (data ?? []).map((row) => row.id);
  const { data: rosterRows } = eventIds.length
    ? await supabase
        .from("event_rosters")
        .select("event_id")
        .eq("church_id", churchId)
        .in("event_id", eventIds)
    : { data: [] as Array<{ event_id: string }> };

  const rosterCountByEventId = (rosterRows ?? []).reduce((map, row) => {
    map.set(row.event_id, (map.get(row.event_id) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  return (data ?? []).map((r) => ({
    id: r.id, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at,
    category: r.category, location: r.location,
    approvalStatus: r.approval_status, rosterCount: rosterCountByEventId.get(r.id) ?? 0,
  }));
}

export async function getChurchAdminEventWorkspaceData(
  session: ChurchAppSession,
  eventId: string,
): Promise<ChurchAdminEventWorkspaceData | null> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return null;
  }

  if (shouldUseLocalTenantFallback()) {
    const eventResult = await queryTenantLocalDb<{
      id: string;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string;
      category: string;
      location: string | null;
      approval_status: string;
    }>(
      `
        select
          event.id,
          event.title,
          event.description,
          event.starts_at,
          event.ends_at,
          event.category,
          event.location,
          event.approval_status::text as approval_status
        from public.events event
        where event.id = $1
          and event.church_id = $2
        limit 1
      `,
      [eventId, session.appContext.church.id],
    );

    const event = eventResult.rows[0];

    if (!event) {
      return null;
    }

    const [rosterResult, attendanceResult, peopleResult, loadResult] =
      await Promise.all([
        queryTenantLocalDb<{
          id: string;
          profile_id: string;
          full_name: string;
          member_number: string | null;
          role_title: string;
          is_confirmed: boolean;
          phone: string | null;
        }>(
          `
            select
              roster.id,
              roster.profile_id,
              profile.full_name,
              profile.member_number,
              roster.role_title,
              roster.is_confirmed,
              profile.phone
            from public.event_rosters roster
            join public.profiles profile
              on profile.id = roster.profile_id
            where roster.event_id = $1
              and roster.church_id = $2
            order by roster.created_at asc
          `,
          [eventId, session.appContext.church.id],
        ),
        queryTenantLocalDb<{
          id: string;
          profile_id: string;
          full_name: string;
          member_number: string | null;
          family_name: string | null;
          checked_in_at: string;
          status: string;
          check_in_method: string;
        }>(
          `
            select
              attendance.id,
              attendance.profile_id,
              profile.full_name,
              profile.member_number,
              family.family_name,
              attendance.checked_in_at,
              attendance.status,
              attendance.check_in_method
            from public.attendance attendance
            join public.profiles profile
              on profile.id = attendance.profile_id
            left join public.families family
              on family.id = profile.family_id
            where attendance.event_id = $1
              and attendance.church_id = $2
            order by attendance.checked_in_at desc
          `,
          [eventId, session.appContext.church.id],
        ),
        queryTenantLocalDb<{
          id: string;
          full_name: string;
          member_number: string | null;
          email: string | null;
          phone: string | null;
          account_status: string;
          is_roster_eligible: boolean;
          last_attendance: string | null;
        }>(
          `
            select
              profile.id,
              profile.full_name,
              profile.member_number,
              profile.email,
              profile.phone,
              profile.account_status,
              profile.is_roster_eligible,
              profile.last_attendance
            from public.profiles profile
            where profile.church_id = $1
              and profile.merged_at is null
            order by profile.full_name
          `,
          [session.appContext.church.id],
        ),
        queryTenantLocalDb<{
          profile_id: string;
          assignment_count: string;
        }>(
          `
            select
              roster.profile_id,
              count(*)::text as assignment_count
            from public.event_rosters roster
            join public.events event
              on event.id = roster.event_id
            where roster.church_id = $1
              and event.starts_at >= $2::timestamptz
              and event.starts_at < ($2::timestamptz + interval '7 days')
            group by roster.profile_id
          `,
          [session.appContext.church.id, event.starts_at],
        ),
      ]);

    const sevenDayLoadByProfileId = new Map(
      loadResult.rows.map((row) => [row.profile_id, Number(row.assignment_count)]),
    );

    const rosterEntries = withSevenDayLoad(
      rosterResult.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        fullName: row.full_name,
        memberNumber: row.member_number,
        roleTitle: row.role_title,
        isConfirmed: row.is_confirmed,
        phone: row.phone,
      })),
      sevenDayLoadByProfileId,
    );

    const attendanceEntries = attendanceResult.rows.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      fullName: row.full_name,
      memberNumber: row.member_number,
      familyName: row.family_name,
      checkedInAt: row.checked_in_at,
      status: row.status,
      checkInMethod: row.check_in_method,
    }));

    const people = withSevenDayLoad(
      peopleResult.rows.map((row) => ({
        id: row.id,
        profileId: row.id,
        fullName: row.full_name,
        memberNumber: row.member_number,
        email: row.email,
        phone: row.phone,
        accountStatus: row.account_status,
        isRosterEligible: row.is_roster_eligible,
        lastAttendance: row.last_attendance,
      })),
      sevenDayLoadByProfileId,
    ).map((entry) => ({
      id: entry.id,
      fullName: entry.fullName,
      memberNumber: entry.memberNumber,
      email: entry.email,
      phone: entry.phone,
      accountStatus: entry.accountStatus,
      isRosterEligible: entry.isRosterEligible,
      lastAttendance: entry.lastAttendance,
      sevenDayLoad: entry.sevenDayLoad,
    }));

    const burnoutWarnings = people.filter(
      (person) => person.isRosterEligible && person.sevenDayLoad > 3,
    ).length;

    return {
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        category: event.category,
        location: event.location,
        approvalStatus: event.approval_status,
      },
      rosterEntries,
      attendanceEntries,
      people,
      carePrompts: buildCarePrompts(people, attendanceEntries),
      aiDisclaimer: AI_ASSISTIVE_DISCLAIMER,
      stats: {
        rosterCount: rosterEntries.length,
        attendanceCount: attendanceEntries.length,
        pendingConfirmations: rosterEntries.filter((entry) => !entry.isConfirmed).length,
        burnoutWarnings,
      },
    };
  }

  const supabase = await createTenantServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, starts_at, ends_at, category, location, approval_status")
    .eq("id", eventId)
    .eq("church_id", session.appContext.church.id)
    .maybeSingle();

  if (!event) {
    return null;
  }

  const [{ data: rosterRows }, { data: attendanceRows }, { data: peopleRows }, { data: loadRows }] =
    await Promise.all([
      supabase
        .from("event_rosters")
        .select("id, profile_id, role_title, is_confirmed, profiles!inner(full_name, member_number, phone)")
        .eq("event_id", eventId)
        .eq("church_id", session.appContext.church.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("attendance")
        .select("id, profile_id, checked_in_at, status, check_in_method, profiles!inner(full_name, member_number, family_id, families(family_name))")
        .eq("event_id", eventId)
        .eq("church_id", session.appContext.church.id)
        .order("checked_in_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, member_number, email, phone, account_status, is_roster_eligible, last_attendance")
        .eq("church_id", session.appContext.church.id)
        .is("merged_at", null)
        .order("full_name"),
      supabase
        .from("event_rosters")
        .select("profile_id, events!inner(starts_at)")
        .eq("church_id", session.appContext.church.id)
        .gte("events.starts_at", event.starts_at)
        .lt("events.starts_at", new Date(new Date(event.starts_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  const sevenDayLoadByProfileId = (loadRows ?? []).reduce((map, row) => {
    map.set(row.profile_id, (map.get(row.profile_id) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const rosterEntries = withSevenDayLoad(
    (rosterRows ?? []).flatMap((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

      if (!profile) {
        return [];
      }

      return [
        {
          id: row.id,
          profileId: row.profile_id,
          fullName: String((profile as { full_name: unknown }).full_name),
          memberNumber:
            "member_number" in (profile as Record<string, unknown>) &&
            (profile as { member_number: unknown }).member_number !== null
              ? String((profile as { member_number: unknown }).member_number)
              : null,
          roleTitle: row.role_title,
          isConfirmed: row.is_confirmed,
          phone:
            "phone" in (profile as Record<string, unknown>) &&
            (profile as { phone: unknown }).phone !== null
              ? String((profile as { phone: unknown }).phone)
              : null,
        },
      ];
    }),
    sevenDayLoadByProfileId,
  );

  const attendanceEntries = (attendanceRows ?? []).flatMap((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    if (!profile) {
      return [];
    }

    return [
      {
        id: row.id,
        profileId: row.profile_id,
        fullName: String((profile as { full_name: unknown }).full_name),
        memberNumber:
          "member_number" in (profile as Record<string, unknown>) &&
          (profile as { member_number: unknown }).member_number !== null
            ? String((profile as { member_number: unknown }).member_number)
            : null,
        familyName:
          "families" in (profile as Record<string, unknown>)
            ? (
                Array.isArray((profile as { families?: Array<{ family_name?: unknown }> }).families)
                  ? (profile as { families?: Array<{ family_name?: unknown }> }).families?.[0]
                      ?.family_name
                  : undefined
              )?.toString() ?? null
            : null,
        checkedInAt: row.checked_in_at,
        status: row.status,
        checkInMethod: row.check_in_method,
      },
    ];
  });

  const people = (peopleRows ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    memberNumber: row.member_number,
    email: row.email,
    phone: row.phone,
    accountStatus: row.account_status ?? "pending",
    isRosterEligible: row.is_roster_eligible ?? true,
    lastAttendance: row.last_attendance,
    sevenDayLoad: sevenDayLoadByProfileId.get(row.id) ?? 0,
  }));

  return {
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      category: event.category,
      location: event.location,
      approvalStatus: event.approval_status,
    },
    rosterEntries,
    attendanceEntries,
    people,
    carePrompts: buildCarePrompts(people, attendanceEntries),
    aiDisclaimer: AI_ASSISTIVE_DISCLAIMER,
    stats: {
      rosterCount: rosterEntries.length,
      attendanceCount: attendanceEntries.length,
      pendingConfirmations: rosterEntries.filter((entry) => !entry.isConfirmed).length,
      burnoutWarnings: people.filter((person) => person.isRosterEligible && person.sevenDayLoad > 3).length,
    },
  };
}
