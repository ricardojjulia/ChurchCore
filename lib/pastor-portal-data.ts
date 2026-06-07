import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import { decryptPastoralField } from "@/lib/crypto/pastoral";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type PastorPortalProfile = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  displayTitle: string | null;
  isPastoral: boolean;
  membershipStatus: string;
};

export type PastorLedMinistry = {
  id: string;
  name: string;
  memberCount: number;
};

export type PastorDirectorySummary = {
  totalPeople: number;
  visibleInDirectory: number;
  familyCount: number;
  visitorCount: number;
};

export type PastorFollowUpPerson = {
  id: string;
  fullName: string;
  displayTitle: string | null;
  membershipStatus: string;
  lastAttendance: string | null;
};

export type PastorPersonEntry = {
  id: string;
  fullName: string;
  displayTitle: string | null;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  lastAttendance: string | null;
  directoryVisible: boolean;
  familyName: string | null;
};

export type PastoralNoteEntry = {
  id: string;
  profileId: string;
  content: string;
  createdAt: string;
  createdByName: string | null;
};

export type CareAssignmentEntry = {
  id: string;
  profileId: string;
  summary: string;
  status: string;
  priority: string;
  dueAt: string | null;
  lastContactAt: string | null;
  assignedToName: string | null;
};

export type PastorPortalData = {
  profile: PastorPortalProfile | null;
  ledMinistries: PastorLedMinistry[];
  directorySummary: PastorDirectorySummary;
  followUpPeople: PastorFollowUpPerson[];
  people: PastorPersonEntry[];
  pastoralNotes: PastoralNoteEntry[];
  careAssignments: CareAssignmentEntry[];
};

function buildPreviewPastorPortalData(session: ChurchAppSession): PastorPortalData {
  return {
    profile: {
      id: session.userId,
      fullName: session.profile.name,
      email: session.profile.email,
      phone: null,
      displayTitle: session.profile.title,
      isPastoral: true,
      membershipStatus: "active",
    },
    ledMinistries: [],
    directorySummary: {
      totalPeople: 0,
      visibleInDirectory: 0,
      familyCount: 0,
      visitorCount: 0,
    },
    followUpPeople: [],
    people: [],
    pastoralNotes: [],
    careAssignments: [],
  };
}

function sortFollowUpPeople(people: PastorFollowUpPerson[]) {
  return [...people].sort((left, right) => {
    if (left.membershipStatus !== right.membershipStatus) {
      return left.membershipStatus.localeCompare(right.membershipStatus);
    }

    return left.fullName.localeCompare(right.fullName);
  });
}

export async function getPastorPortalData(
  session: ChurchAppSession,
): Promise<PastorPortalData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewPastorPortalData(session);
  }

  if (shouldUseLocalTenantFallback()) {
    const [
      profileResult,
      peopleResult,
      pastoralNotesResult,
      careAssignmentsResult,
    ] = await Promise.all([
      queryTenantLocalDb<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        display_title: string | null;
        is_pastoral: boolean | null;
        membership_status: string | null;
      }>(
        `
          select id, full_name, email, phone, display_title, is_pastoral, membership_status
          from public.profiles
          where user_id = $1
            and church_id = $2
            and merged_at is null
          limit 1
        `,
        [session.userId, session.appContext.church.id],
      ),
      queryTenantLocalDb<{
        id: string;
        full_name: string;
        display_title: string | null;
        email: string | null;
        phone: string | null;
        membership_status: string | null;
        last_attendance: string | null;
        directory_visible: boolean | null;
        family_id: string | null;
        family_name: string | null;
      }>(
        `
          select
            profile.id,
            profile.full_name,
            profile.display_title,
            profile.email,
            profile.phone,
            profile.membership_status,
            profile.last_attendance,
            profile.directory_visible,
            profile.family_id,
            family.family_name
          from public.profiles
          profile
          left join public.families family
            on family.id = profile.family_id
          where profile.church_id = $1
            and profile.merged_at is null
          order by profile.full_name
        `,
        [session.appContext.church.id],
      ),
      queryTenantLocalDb<{
        id: string;
        profile_id: string;
        content: string;
        created_at: string;
        created_by_name: string | null;
      }>(
        `
          select
            note.id,
            note.profile_id,
            note.content,
            note.created_at,
            author.full_name as created_by_name
          from public.pastoral_notes note
          left join public.profiles author
            on author.id = note.created_by
          where note.church_id = $1
          order by note.created_at desc
          limit 200
        `,
        [session.appContext.church.id],
      ).catch(() => ({
        rows: [] as Array<{
          id: string;
          profile_id: string;
          content: string;
          created_at: string;
          created_by_name: string | null;
        }>,
      })),
      queryTenantLocalDb<{
        id: string;
        profile_id: string;
        summary: string;
        status: string;
        priority: string;
        due_at: string | null;
        last_contact_at: string | null;
        assigned_to_name: string | null;
      }>(
        `
          select
            assignment.id,
            assignment.profile_id,
            assignment.summary,
            assignment.status,
            assignment.priority,
            assignment.due_at,
            assignment.last_contact_at,
            assignee.full_name as assigned_to_name
          from public.care_assignments assignment
          left join public.profiles assignee
            on assignee.id = assignment.assigned_to
          where assignment.church_id = $1
          order by assignment.created_at desc
          limit 200
        `,
        [session.appContext.church.id],
      ).catch(() => ({
        rows: [] as Array<{
          id: string;
          profile_id: string;
          summary: string;
          status: string;
          priority: string;
          due_at: string | null;
          last_contact_at: string | null;
          assigned_to_name: string | null;
        }>,
      })),
    ]);

    const profile = profileResult.rows[0] ?? null;
    const people = peopleResult.rows;
    const familyIds = new Set(people.map((person) => person.family_id).filter(Boolean));

    const ledMinistriesResult =
      profile?.id
        ? await queryTenantLocalDb<{
            id: string;
            name: string;
            member_count: string;
          }>(
            `
              select
                ministry.id,
                ministry.name,
                count(profile_ministry.profile_id)::text as member_count
              from public.ministries ministry
              left join public.profile_ministries profile_ministry
                on profile_ministry.ministry_id = ministry.id
              where ministry.church_id = $1
                and ministry.leader_profile_id = $2
              group by ministry.id, ministry.name
              order by ministry.name
            `,
            [session.appContext.church.id, profile.id],
          )
        : { rows: [] as Array<{ id: string; name: string; member_count: string }> };

    const followUpPeople = sortFollowUpPeople(
      people
        .filter(
          (person) =>
            person.membership_status === "visitor" ||
            person.membership_status === "inactive" ||
            !person.last_attendance,
        )
        .slice(0, 8)
        .map((person) => ({
          id: person.id,
          fullName: person.full_name,
          displayTitle: person.display_title,
          membershipStatus: person.membership_status ?? "active",
          lastAttendance: person.last_attendance,
        })),
    );

    return {
      profile: profile
        ? {
            id: profile.id,
            fullName: profile.full_name ?? session.profile.name,
            email: profile.email,
            phone: profile.phone,
            displayTitle: profile.display_title,
            isPastoral: Boolean(profile.is_pastoral),
            membershipStatus: profile.membership_status ?? "active",
          }
        : null,
      ledMinistries: ledMinistriesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        memberCount: Number(row.member_count),
      })),
      directorySummary: {
        totalPeople: people.length,
        visibleInDirectory: people.filter((person) => person.directory_visible !== false).length,
        familyCount: familyIds.size,
        visitorCount: people.filter((person) => person.membership_status === "visitor").length,
      },
      followUpPeople,
      people: people.map((person) => ({
        id: person.id,
        fullName: person.full_name,
        displayTitle: person.display_title,
        email: person.email,
        phone: person.phone,
        membershipStatus: person.membership_status ?? "active",
        lastAttendance: person.last_attendance,
        directoryVisible: person.directory_visible !== false,
        familyName: person.family_name ?? null,
      })),
      pastoralNotes: pastoralNotesResult.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        content: decryptPastoralField(row.content),
        createdAt: row.created_at,
        createdByName: row.created_by_name,
      })),
      careAssignments: careAssignmentsResult.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        summary: decryptPastoralField(row.summary),
        status: row.status,
        priority: row.priority,
        dueAt: row.due_at,
        lastContactAt: row.last_contact_at,
        assignedToName: row.assigned_to_name,
      })),
    };
  }

  const supabase = await createTenantServerClient();
  const [
    { data: profile },
    { data: people },
    pastoralNotesQuery,
    careAssignmentsQuery,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, display_title, is_pastoral, membership_status")
      .eq("user_id", session.userId)
      .eq("church_id", session.appContext.church.id)
      .is("merged_at", null)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, display_title, email, phone, membership_status, last_attendance, directory_visible, family_id")
      .eq("church_id", session.appContext.church.id)
      .is("merged_at", null)
      .order("full_name")
      .limit(400),
    supabase
      .from("pastoral_notes")
      .select("id, profile_id, created_by, content, created_at")
      .eq("church_id", session.appContext.church.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then((result) => result.data ?? []),
    supabase
      .from("care_assignments")
      .select("id, profile_id, assigned_to, summary, status, priority, due_at, last_contact_at")
      .eq("church_id", session.appContext.church.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then((result) => result.data ?? []),
  ]);

  const ledMinistriesResult =
    profile?.id
      ? await supabase
          .from("ministries")
          .select("id, name")
          .eq("church_id", session.appContext.church.id)
          .eq("leader_profile_id", profile.id)
          .order("name")
      : { data: [] as Array<{ id: string; name: string }> };

  const ledMinistryIds = ledMinistriesResult.data?.map((ministry) => ministry.id) ?? [];
  const ledMinistryMembersResult =
    ledMinistryIds.length
      ? await supabase
          .from("profile_ministries")
          .select("ministry_id")
          .in("ministry_id", ledMinistryIds)
      : { data: [] as Array<{ ministry_id: string }> };

  const ledCounts = (ledMinistryMembersResult.data ?? []).reduce((map, row) => {
    map.set(row.ministry_id, (map.get(row.ministry_id) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const churchPeople = people ?? [];
  const familyIds = new Set(churchPeople.map((person) => person.family_id).filter(Boolean));
  const familyNameResult =
    familyIds.size
      ? await supabase
          .from("families")
          .select("id, family_name")
          .in("id", Array.from(familyIds))
      : { data: [] as Array<{ id: string; family_name: string }> };
  const familyNameMap = new Map(
    (familyNameResult.data ?? []).map((row) => [row.id, row.family_name]),
  );
  const noteAuthorIds = Array.from(
    new Set(
      (pastoralNotesQuery ?? [])
        .map((row) => row.created_by)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const assignmentAssigneeIds = Array.from(
    new Set(
      (careAssignmentsQuery ?? [])
        .map((row) => row.assigned_to)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const peopleNameIds = Array.from(new Set([...noteAuthorIds, ...assignmentAssigneeIds]));
  const peopleNamesResult =
    peopleNameIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", peopleNameIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
  const peopleNameMap = new Map(
    (peopleNamesResult.data ?? []).map((row) => [row.id, row.full_name]),
  );
  const followUpPeople = sortFollowUpPeople(
    churchPeople
      .filter(
        (person) =>
          person.membership_status === "visitor" ||
          person.membership_status === "inactive" ||
          !person.last_attendance,
      )
      .slice(0, 8)
      .map((person) => ({
        id: person.id,
        fullName: person.full_name,
        displayTitle: person.display_title,
        membershipStatus: person.membership_status ?? "active",
        lastAttendance: person.last_attendance,
      })),
  );

  return {
    profile: profile
      ? {
          id: profile.id,
          fullName: profile.full_name ?? session.profile.name,
          email: profile.email,
          phone: profile.phone,
          displayTitle: profile.display_title,
          isPastoral: Boolean(profile.is_pastoral),
          membershipStatus: profile.membership_status ?? "active",
        }
      : null,
    ledMinistries:
      ledMinistriesResult.data?.map((ministry) => ({
        id: ministry.id,
        name: ministry.name,
        memberCount: ledCounts.get(ministry.id) ?? 0,
      })) ?? [],
    directorySummary: {
      totalPeople: churchPeople.length,
      visibleInDirectory: churchPeople.filter((person) => person.directory_visible !== false).length,
      familyCount: familyIds.size,
      visitorCount: churchPeople.filter((person) => person.membership_status === "visitor").length,
    },
    followUpPeople,
    people: churchPeople.map((person) => ({
      id: person.id,
      fullName: person.full_name,
      displayTitle: person.display_title,
      email: person.email,
      phone: person.phone,
      membershipStatus: person.membership_status ?? "active",
      lastAttendance: person.last_attendance,
      directoryVisible: person.directory_visible !== false,
      familyName: person.family_id ? familyNameMap.get(person.family_id) ?? null : null,
    })),
    pastoralNotes: (pastoralNotesQuery ?? []).map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      content: decryptPastoralField(row.content),
      createdAt: row.created_at,
      createdByName: peopleNameMap.get(row.created_by) ?? null,
    })),
    careAssignments: (careAssignmentsQuery ?? []).map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      summary: decryptPastoralField(row.summary),
      status: row.status,
      priority: row.priority,
      dueAt: row.due_at,
      lastContactAt: row.last_contact_at,
      assignedToName: row.assigned_to ? peopleNameMap.get(row.assigned_to) ?? null : null,
    })),
  };
}
