import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import { AI_ASSISTIVE_DISCLAIMER } from "@/lib/ministry-forge-types";
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
              attendance.checked_in_at,
              attendance.status,
              attendance.check_in_method
            from public.attendance attendance
            join public.profiles profile
              on profile.id = attendance.profile_id
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
        .select("id, profile_id, checked_in_at, status, check_in_method, profiles!inner(full_name, member_number)")
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
