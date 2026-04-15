import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import type { PortalRoleId } from "@/lib/portal";
import { getPortalRole } from "@/lib/portal";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type MemberPortalProfile = {
  id: string;
  fullName: string;
  memberNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  displayTitle: string | null;
  roleId: PortalRoleId;
  isPastoral: boolean;
  membershipStatus: string;
  joinedDate: string | null;
  directoryVisible: boolean;
  contactAllowed: boolean;
  preferredContactMethod: string | null;
  interests: string[];
  // Sensitive fields — sourced from profile_sensitive_fields table
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  familyId: string | null;
  familyName: string | null;
};

export type MemberPortalMinistry = {
  id: string;
  name: string;
  description: string | null;
};

export type MemberPortalEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  category: string;
  visibility: string;
  ministryName: string | null;
};

export type MemberPortalFamilyMember = {
  id: string;
  fullName: string;
  displayTitle: string | null;
};

export type MemberPortalFamily = {
  id: string;
  familyName: string;
  address: string | null;
  homePhone: string | null;
  members: MemberPortalFamilyMember[];
};

export type MemberDirectoryEntry = {
  id: string;
  fullName: string;
  displayTitle: string | null;
  email: string | null;
  phone: string | null;
  familyName: string | null;
  membershipStatus: string;
  ministryNames: string[];
  contactAllowed: boolean;
};

export type MemberAttendanceRecord = {
  id: string;
  checkedInAt: string;
  status: string;
  checkInMethod: string;
  eventTitle: string | null;
};

export type MemberServingAssignment = {
  id: string;
  roleTitle: string;
  isConfirmed: boolean;
  startsAt: string;
  eventTitle: string;
};

export type MemberPortalData = {
  profile: MemberPortalProfile | null;
  ministries: MemberPortalMinistry[];
  upcomingEvents: MemberPortalEvent[];
  attendanceHistory: MemberAttendanceRecord[];
  upcomingServing: MemberServingAssignment[];
  family: MemberPortalFamily | null;
  directory: MemberDirectoryEntry[];
};

function buildPreviewMemberPortalData(session: ChurchAppSession): MemberPortalData {
  const role = getPortalRole("member");

  return {
    profile: {
      id: session.userId,
      fullName: session.profile.name,
      memberNumber: null,
      email: session.profile.email,
      phone: null,
      address: null,
      displayTitle: session.profile.title,
      roleId: "member",
      isPastoral: false,
      membershipStatus: "active",
      joinedDate: null,
      directoryVisible: true,
      contactAllowed: true,
      preferredContactMethod: null,
      interests: [],
      emergencyContactName: null,
      emergencyContactPhone: null,
      familyId: null,
      familyName: null,
    },
    ministries: [],
    upcomingEvents:
      role?.timeline.map((item, index) => ({
        id: `preview-member-event-${index}`,
        title: item.title,
        description: item.detail,
        startsAt: item.time,
        endsAt: item.time,
        category: "general",
        visibility: "members",
        ministryName: null,
      })) ?? [],
    attendanceHistory: [],
    upcomingServing: [],
    family: null,
    directory: [],
  };
}

function mapProfileRole(role: string | null): PortalRoleId {
  switch (role) {
    case "church_admin":
      return "church-admin";
    case "pastor":
    case "pastor_elder":
      return "pastor";
    case "ministry_leader":
    case "ministry_admin":
      return "ministry-leader";
    case "member":
    case "member_volunteer":
    default:
      return "member";
  }
}

function buildDirectory(entries: Array<Omit<MemberDirectoryEntry, "ministryNames">>, ministryMap: Map<string, string[]>) {
  return entries.map((entry) => ({
    ...entry,
    ministryNames: ministryMap.get(entry.id) ?? [],
  }));
}

export async function getMemberPortalData(
  session: ChurchAppSession,
): Promise<MemberPortalData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMemberPortalData(session);
  }

  if (shouldUseLocalTenantFallback()) {
    const [profileResult, ministriesResult, eventsResult, directoryResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string;
        full_name: string | null;
        member_number: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        display_title: string | null;
        role: string | null;
        is_pastoral: boolean | null;
        membership_status: string | null;
        joined_date: string | null;
        directory_visible: boolean | null;
        contact_allowed: boolean | null;
        preferred_contact_method: string | null;
        interests: string[] | null;
        emergency_contact_name: string | null;
        emergency_contact_phone: string | null;
        family_id: string | null;
        family_name: string | null;
      }>(
        `
          select
            profile.id,
            profile.full_name,
            profile.member_number,
            profile.email,
            profile.phone,
            profile.address,
            profile.display_title,
            profile.role,
            profile.is_pastoral,
            profile.membership_status,
            profile.joined_date,
            profile.directory_visible,
            profile.contact_allowed,
            profile.preferred_contact_method,
            profile.interests,
            sensitive.emergency_contact_name,
            sensitive.emergency_contact_phone,
            profile.family_id,
            family.family_name
          from public.profiles profile
          left join public.families family
            on family.id = profile.family_id
          left join public.profile_sensitive_fields sensitive
            on sensitive.profile_id = profile.id
          where profile.user_id = $1
            and profile.church_id = $2
            and profile.merged_at is null
          limit 1
        `,
        [session.userId, session.appContext.church.id],
      ),
      queryTenantLocalDb<{
        id: string;
        name: string;
        description: string | null;
      }>(
        `
          select ministry.id, ministry.name, ministry.description
          from public.profile_ministries profile_ministry
          join public.profiles profile
            on profile.id = profile_ministry.profile_id
          join public.ministries ministry
            on ministry.id = profile_ministry.ministry_id
          where profile.user_id = $1
            and profile.church_id = $2
            and profile.merged_at is null
          order by ministry.name
        `,
        [session.userId, session.appContext.church.id],
      ),
      queryTenantLocalDb<{
        id: string;
        title: string;
        description: string | null;
        starts_at: string;
        ends_at: string;
        category: string;
        visibility: string;
        ministry_name: string | null;
      }>(
        `
          select
            event.id,
            event.title,
            event.description,
            event.starts_at,
            event.ends_at,
            event.category,
            event.visibility,
            ministry.name as ministry_name
          from public.events event
          left join public.ministries ministry
            on ministry.id = event.ministry_id
          where event.church_id = $1
            and event.starts_at >= timezone('utc', now())
            and event.visibility in ('public', 'members')
          order by event.starts_at asc
          limit 6
        `,
        [session.appContext.church.id],
      ),
      queryTenantLocalDb<{
        id: string;
        full_name: string;
        display_title: string | null;
        email: string | null;
        phone: string | null;
        family_name: string | null;
        membership_status: string | null;
        contact_allowed: boolean | null;
      }>(
        `
          select
            profile.id,
            profile.full_name,
            profile.display_title,
            case when profile.contact_allowed then profile.email else null end as email,
            case when profile.contact_allowed then profile.phone else null end as phone,
            family.family_name,
            profile.membership_status,
            profile.contact_allowed
          from public.profiles profile
          left join public.families family
            on family.id = profile.family_id
          where profile.church_id = $1
            and profile.directory_visible = true
            and profile.merged_at is null
          order by profile.full_name
          limit 200
        `,
        [session.appContext.church.id],
      ),
    ]);

    const profileRow = profileResult.rows[0];

    const directoryIds = directoryResult.rows.map((row) => row.id);
    const directoryMinistryResult = directoryIds.length
      ? await queryTenantLocalDb<{
          profile_id: string;
          ministry_name: string;
        }>(
          `
            select profile_ministry.profile_id, ministry.name as ministry_name
            from public.profile_ministries profile_ministry
            join public.ministries ministry
              on ministry.id = profile_ministry.ministry_id
            where profile_ministry.profile_id = any($1::uuid[])
            order by ministry.name
          `,
          [directoryIds],
        )
      : { rows: [] as Array<{ profile_id: string; ministry_name: string }> };

    const directoryMinistryMap = directoryMinistryResult.rows.reduce((map, row) => {
      const names = map.get(row.profile_id) ?? [];
      names.push(row.ministry_name);
      map.set(row.profile_id, names);
      return map;
    }, new Map<string, string[]>());

    const familyResult =
      profileRow?.family_id
        ? await queryTenantLocalDb<{
            id: string;
            family_name: string;
            address: string | null;
            home_phone: string | null;
          }>(
            `
              select id, family_name, address, home_phone
              from public.families
              where id = $1
                and church_id = $2
              limit 1
            `,
            [profileRow.family_id, session.appContext.church.id],
          )
        : { rows: [] as Array<{ id: string; family_name: string; address: string | null; home_phone: string | null }> };

    const familyMembersResult =
      profileRow?.family_id
        ? await queryTenantLocalDb<{
            id: string;
            full_name: string;
            display_title: string | null;
          }>(
            `
              select id, full_name, display_title
              from public.profiles
              where family_id = $1
                and church_id = $2
                and merged_at is null
              order by full_name
            `,
            [profileRow.family_id, session.appContext.church.id],
          )
        : { rows: [] as Array<{ id: string; full_name: string; display_title: string | null }> };

    const attendanceHistoryResult =
      profileRow
        ? await queryTenantLocalDb<{
            id: string;
            checked_in_at: string;
            status: string;
            check_in_method: string;
            event_title: string | null;
          }>(
            `
              select
                attendance.id,
                attendance.checked_in_at,
                attendance.status,
                attendance.check_in_method,
                event.title as event_title
              from public.attendance attendance
              left join public.events event
                on event.id = attendance.event_id
              where attendance.profile_id = $1
                and attendance.church_id = $2
              order by attendance.checked_in_at desc
              limit 8
            `,
            [profileRow.id, session.appContext.church.id],
          )
        : { rows: [] as Array<{ id: string; checked_in_at: string; status: string; check_in_method: string; event_title: string | null }> };

    const servingResult =
      profileRow
        ? await queryTenantLocalDb<{
            id: string;
            role_title: string;
            is_confirmed: boolean;
            starts_at: string;
            event_title: string;
          }>(
            `
              select
                roster.id,
                roster.role_title,
                roster.is_confirmed,
                event.starts_at,
                event.title as event_title
              from public.event_rosters roster
              join public.events event
                on event.id = roster.event_id
              where roster.profile_id = $1
                and roster.church_id = $2
                and event.starts_at >= timezone('utc', now())
              order by event.starts_at asc
              limit 8
            `,
            [profileRow.id, session.appContext.church.id],
          )
        : { rows: [] as Array<{ id: string; role_title: string; is_confirmed: boolean; starts_at: string; event_title: string }> };

    return {
      profile: profileRow
        ? {
            id: profileRow.id,
            fullName: profileRow.full_name ?? session.profile.name,
            memberNumber: profileRow.member_number,
            email: profileRow.email,
            phone: profileRow.phone,
            address: profileRow.address,
            displayTitle: profileRow.display_title,
            roleId: mapProfileRole(profileRow.role),
            isPastoral: Boolean(profileRow.is_pastoral),
            membershipStatus: profileRow.membership_status ?? "active",
            joinedDate: profileRow.joined_date ?? null,
            directoryVisible: profileRow.directory_visible ?? true,
            contactAllowed: profileRow.contact_allowed ?? true,
            preferredContactMethod: profileRow.preferred_contact_method ?? null,
            interests: profileRow.interests ?? [],
            emergencyContactName: profileRow.emergency_contact_name ?? null,
            emergencyContactPhone: profileRow.emergency_contact_phone ?? null,
            familyId: profileRow.family_id ?? null,
            familyName: profileRow.family_name ?? null,
          }
        : null,
      ministries: ministriesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
      })),
      upcomingEvents: eventsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        category: row.category,
        visibility: row.visibility,
        ministryName: row.ministry_name,
      })),
      attendanceHistory: attendanceHistoryResult.rows.map((row) => ({
        id: row.id,
        checkedInAt: row.checked_in_at,
        status: row.status,
        checkInMethod: row.check_in_method,
        eventTitle: row.event_title,
      })),
      upcomingServing: servingResult.rows.map((row) => ({
        id: row.id,
        roleTitle: row.role_title,
        isConfirmed: row.is_confirmed,
        startsAt: row.starts_at,
        eventTitle: row.event_title,
      })),
      family: familyResult.rows[0]
        ? {
            id: familyResult.rows[0].id,
            familyName: familyResult.rows[0].family_name,
            address: familyResult.rows[0].address,
            homePhone: familyResult.rows[0].home_phone,
            members: familyMembersResult.rows.map((row) => ({
              id: row.id,
              fullName: row.full_name,
              displayTitle: row.display_title,
            })),
          }
        : null,
      directory: buildDirectory(
        directoryResult.rows.map((row) => ({
          id: row.id,
          fullName: row.full_name,
          displayTitle: row.display_title,
          email: row.email,
          phone: row.phone,
          familyName: row.family_name,
          membershipStatus: row.membership_status ?? "active",
          contactAllowed: row.contact_allowed ?? true,
        })),
        directoryMinistryMap,
      ),
    };
  }

  const supabase = await createTenantServerClient();
  const [profileResult, ministriesResult, eventsResult, directoryProfilesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, member_number, email, phone, address, display_title, role, is_pastoral, membership_status, joined_date, directory_visible, contact_allowed, preferred_contact_method, interests, family_id, profile_sensitive_fields(emergency_contact_name, emergency_contact_phone)",
      )
      .eq("user_id", session.userId)
      .eq("church_id", session.appContext.church.id)
      .is("merged_at", null)
      .maybeSingle(),
    supabase
      .from("profile_ministries")
      .select("ministries(id, name, description), profiles!inner(user_id, church_id)")
      .eq("profiles.user_id", session.userId)
      .eq("profiles.church_id", session.appContext.church.id)
      .is("profiles.merged_at", null),
    supabase
      .from("events")
      .select(
        "id, title, description, starts_at, ends_at, category, visibility, ministries(name)",
      )
      .eq("church_id", session.appContext.church.id)
      .gte("starts_at", new Date().toISOString())
      .in("visibility", ["public", "members"])
      .order("starts_at", { ascending: true })
      .limit(6),
    supabase
      .from("profiles")
      .select(
        "id, full_name, display_title, email, phone, membership_status, contact_allowed, family_id",
      )
      .eq("church_id", session.appContext.church.id)
      .eq("directory_visible", true)
      .is("merged_at", null)
      .order("full_name")
      .limit(200),
  ]);

  const profileRow = profileResult.data;
  const familyId = profileRow?.family_id ?? null;

  const familyResult =
    familyId
      ? await supabase
          .from("families")
          .select("id, family_name, address, home_phone")
          .eq("id", familyId)
          .eq("church_id", session.appContext.church.id)
          .maybeSingle()
      : { data: null };

  const familyMembersResult =
    familyId
      ? await supabase
          .from("profiles")
          .select("id, full_name, display_title")
          .eq("church_id", session.appContext.church.id)
          .eq("family_id", familyId)
          .is("merged_at", null)
          .order("full_name")
      : { data: [] as Array<{ id: string; full_name: string; display_title: string | null }> };

  const [attendanceHistoryResult, servingResult] = profileRow
    ? await Promise.all([
        supabase
          .from("attendance")
          .select("id, checked_in_at, status, check_in_method, events(title)")
          .eq("profile_id", profileRow.id)
          .eq("church_id", session.appContext.church.id)
          .order("checked_in_at", { ascending: false })
          .limit(8),
        supabase
          .from("event_rosters")
          .select("id, role_title, is_confirmed, events!inner(title, starts_at)")
          .eq("profile_id", profileRow.id)
          .eq("church_id", session.appContext.church.id)
          .gte("events.starts_at", new Date().toISOString())
          .order("created_at", { ascending: true })
          .limit(8),
      ])
    : [
        { data: [] as Array<{ id: string; checked_in_at: string; status: string; check_in_method: string; events: { title?: string | null } | { title?: string | null }[] | null }> },
        { data: [] as Array<{ id: string; role_title: string; is_confirmed: boolean; events: { title?: string | null; starts_at?: string | null } | { title?: string | null; starts_at?: string | null }[] | null }> },
      ];

  const directoryProfiles = directoryProfilesResult.data ?? [];
  const directoryIds = directoryProfiles.map((row) => row.id);
  const familyIds = Array.from(
    new Set(directoryProfiles.map((row) => row.family_id).filter((value): value is string => Boolean(value))),
  );

  const [directoryMinistriesResult, directoryFamiliesResult] = await Promise.all([
    directoryIds.length
      ? supabase
          .from("profile_ministries")
          .select("profile_id, ministries(name)")
          .in("profile_id", directoryIds)
      : { data: [] as Array<{ profile_id: string; ministries: { name?: string | null } | null }> },
    familyIds.length
      ? supabase
          .from("families")
          .select("id, family_name")
          .in("id", familyIds)
      : { data: [] as Array<{ id: string; family_name: string }> },
  ]);

  const directoryMinistryMap = (directoryMinistriesResult.data ?? []).reduce((map, row) => {
    const name =
      row.ministries && typeof row.ministries === "object" && "name" in row.ministries
        ? String((row.ministries as { name: unknown }).name)
        : null;

    if (!name) {
      return map;
    }

    const names = map.get(row.profile_id) ?? [];
    names.push(name);
    map.set(row.profile_id, names);
    return map;
  }, new Map<string, string[]>());

  const directoryFamilyMap = new Map(
    (directoryFamiliesResult.data ?? []).map((row) => [row.id, row.family_name]),
  );

  return {
    profile: profileRow
      ? {
          id: profileRow.id,
          fullName: profileRow.full_name ?? session.profile.name,
          memberNumber:
            "member_number" in profileRow && profileRow.member_number !== null
              ? String(profileRow.member_number)
              : null,
          email: profileRow.email,
          phone: profileRow.phone,
          address: profileRow.address,
          displayTitle: profileRow.display_title,
          roleId: mapProfileRole(profileRow.role),
          isPastoral: Boolean(profileRow.is_pastoral),
          membershipStatus: profileRow.membership_status ?? "active",
          joinedDate: profileRow.joined_date ?? null,
          directoryVisible: profileRow.directory_visible ?? true,
          contactAllowed: profileRow.contact_allowed ?? true,
          preferredContactMethod: profileRow.preferred_contact_method ?? null,
          interests: profileRow.interests ?? [],
          emergencyContactName:
            (profileRow.profile_sensitive_fields as unknown as Array<{ emergency_contact_name: string | null }> | null)
              ?.[0]?.emergency_contact_name ?? null,
          emergencyContactPhone:
            (profileRow.profile_sensitive_fields as unknown as Array<{ emergency_contact_phone: string | null }> | null)
              ?.[0]?.emergency_contact_phone ?? null,
          familyId,
          familyName:
            familyResult.data && "family_name" in familyResult.data
              ? String((familyResult.data as { family_name: unknown }).family_name)
              : null,
        }
      : null,
    ministries:
      ministriesResult.data?.flatMap((row) => {
        const ministry =
          row.ministries && typeof row.ministries === "object" && "id" in row.ministries
            ? row.ministries
            : Array.isArray(row.ministries)
              ? row.ministries[0]
              : null;

        if (!ministry || typeof ministry !== "object") {
          return [];
        }

        return [
          {
            id: String((ministry as { id: unknown }).id),
            name: String((ministry as { name: unknown }).name),
            description:
              "description" in ministry && (ministry as { description: unknown }).description !== null
                ? String((ministry as { description: unknown }).description)
                : null,
          },
        ];
      }) ?? [],
    upcomingEvents:
      eventsResult.data?.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        category: row.category,
        visibility: row.visibility,
        ministryName:
          row.ministries && typeof row.ministries === "object" && "name" in row.ministries
            ? String((row.ministries as { name: unknown }).name)
            : null,
      })) ?? [],
    attendanceHistory:
      attendanceHistoryResult.data?.map((row) => ({
        id: row.id,
        checkedInAt: row.checked_in_at,
        status: row.status,
        checkInMethod: row.check_in_method,
        eventTitle:
          row.events &&
          typeof row.events === "object" &&
          "title" in row.events &&
          (row.events as { title: unknown }).title !== null
            ? String((row.events as { title: unknown }).title)
            : Array.isArray(row.events) && row.events[0] && typeof row.events[0] === "object" && "title" in row.events[0]
              && (row.events[0] as { title: unknown }).title !== null
              ? String((row.events[0] as { title: unknown }).title)
              : null,
      })) ?? [],
    upcomingServing:
      servingResult.data?.flatMap((row) => {
        const eventRecord = Array.isArray(row.events) ? row.events[0] : row.events;

        if (!eventRecord || typeof eventRecord !== "object") {
          return [];
        }

        return [
          {
            id: row.id,
            roleTitle: row.role_title,
            isConfirmed: row.is_confirmed,
            startsAt:
              "starts_at" in eventRecord && eventRecord.starts_at
                ? String((eventRecord as { starts_at: unknown }).starts_at)
                : "",
            eventTitle:
              "title" in eventRecord && eventRecord.title
                ? String((eventRecord as { title: unknown }).title)
                : "Serving assignment",
          },
        ];
      }) ?? [],
    family:
      familyResult.data && typeof familyResult.data === "object"
        ? {
            id: String((familyResult.data as { id: unknown }).id),
            familyName: String((familyResult.data as { family_name: unknown }).family_name),
            address:
              "address" in familyResult.data && (familyResult.data as { address: unknown }).address !== null
                ? String((familyResult.data as { address: unknown }).address)
                : null,
            homePhone:
              "home_phone" in familyResult.data &&
              (familyResult.data as { home_phone: unknown }).home_phone !== null
                ? String((familyResult.data as { home_phone: unknown }).home_phone)
                : null,
            members:
              familyMembersResult.data?.map((row) => ({
                id: row.id,
                fullName: row.full_name,
                displayTitle: row.display_title,
              })) ?? [],
          }
        : null,
    directory: buildDirectory(
      directoryProfiles.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        displayTitle: row.display_title,
        email: row.contact_allowed ? row.email : null,
        phone: row.contact_allowed ? row.phone : null,
        familyName: row.family_id ? directoryFamilyMap.get(row.family_id) ?? null : null,
        membershipStatus: row.membership_status ?? "active",
        contactAllowed: row.contact_allowed ?? true,
      })),
      directoryMinistryMap,
    ),
  };
}
