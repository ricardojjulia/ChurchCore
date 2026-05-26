import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import { getMemberShepherdInsights } from "@/lib/shepherd-ai/ops-data";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchAdminPersonEntry = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  displayTitle: string | null;
  role: string;
  membershipStatus: string;
  memberNumber: string | null;
  accountStatus: string | null;
  pendingAccountRequestId: string | null;
  pendingAccountRequestCreatedAt: string | null;
  directoryVisible: boolean;
  contactAllowed: boolean;
  preferredContactMethod: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  familyId: string | null;
  familyName: string | null;
  ministryNames: string[];
  shepherdInsights: Array<{
    id: string;
    workflowCode: string;
    title: string;
    summary: string;
    urgency: string;
    generatedAt: string;
  }>;
  duplicateCandidates: ChurchAdminDuplicateCandidate[];
};

export type ChurchAdminDuplicateCandidate = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  familyName: string | null;
  role: string;
};

export type ChurchAdminFamilyOption = {
  id: string;
  familyName: string;
};

export type ChurchAdminPeopleSummary = {
  totalPeople: number;
  visitorCount: number;
  familyCount: number;
  unassignedHouseholdCount: number;
  incompleteProfiles: number;
  pendingAccountRequests: number;
};

export type ChurchAdminPeopleData = {
  source: "preview" | "live";
  summary: ChurchAdminPeopleSummary;
  people: ChurchAdminPersonEntry[];
  families: ChurchAdminFamilyOption[];
};

function buildPreviewChurchAdminPeopleData(): ChurchAdminPeopleData {
  return {
    source: "preview",
    summary: {
      totalPeople: 0,
      visitorCount: 0,
      familyCount: 0,
      unassignedHouseholdCount: 0,
      incompleteProfiles: 0,
      pendingAccountRequests: 0,
    },
    people: [],
    families: [],
  };
}

function normalizeRole(role: string | null) {
  switch (role) {
    case "church_admin":
      return "church_admin";
    case "secretary":
    case "office_admin":
      return "secretary";
    case "pastor":
    case "pastor_elder":
      return "pastor";
    case "ministry_admin":
    case "ministry_leader":
      return "ministry_leader";
    default:
      return "member";
  }
}

function buildPeople(
  entries: Array<
    Omit<ChurchAdminPersonEntry, "ministryNames" | "shepherdInsights" | "duplicateCandidates">
  >,
  ministryMap: Map<string, string[]>,
  shepherdMap: Map<
    string,
    Array<{
      id: string;
      workflowCode: string;
      title: string;
      summary: string;
      urgency: string;
      generatedAt: string;
    }>
  >,
  duplicateMap: Map<string, ChurchAdminDuplicateCandidate[]>,
): ChurchAdminPersonEntry[] {
  return entries.map((entry) => ({
    ...entry,
    ministryNames: ministryMap.get(entry.id) ?? [],
    shepherdInsights: shepherdMap.get(entry.id) ?? [],
    duplicateCandidates: duplicateMap.get(entry.id) ?? [],
  }));
}

function applyPendingAccountRequests(
  entries: Array<
    Omit<ChurchAdminPersonEntry, "ministryNames" | "shepherdInsights" | "duplicateCandidates">
  >,
  requests: Array<{
    id: string;
    profile_id: string | null;
    email: string;
    created_at: string;
  }>,
) {
  const requestByProfileId = new Map(
    requests
      .filter((request) => request.profile_id)
      .map((request) => [request.profile_id as string, request]),
  );
  const requestByEmail = new Map(
    requests
      .map((request) => [normalizeEmail(request.email), request] as const)
      .filter((entry): entry is [string, (typeof requests)[number]] => Boolean(entry[0])),
  );

  return entries.map((entry) => {
    const request =
      requestByProfileId.get(entry.id) ??
      (entry.email ? requestByEmail.get(normalizeEmail(entry.email) ?? "") : null);

    return {
      ...entry,
      pendingAccountRequestId: request?.id ?? null,
      pendingAccountRequestCreatedAt: request?.created_at ?? null,
    };
  });
}

function buildShepherdMap(
  source: Map<string, Array<{ id: string; workflowCode: string; title: string; summary: string; urgency: string; generatedAt: string }>>,
) {
  return new Map(
    Array.from(source.entries()).map(([memberId, entries]) => [
      memberId,
      entries.slice(0, 3).map((entry) => ({
        id: entry.id,
        workflowCode: entry.workflowCode,
        title: entry.title,
        summary: entry.summary,
        urgency: entry.urgency,
        generatedAt: entry.generatedAt,
      })),
    ]),
  );
}

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizePhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  return digits || null;
}

function buildDuplicateMap(
  entries: Array<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    family_name: string | null;
    role: string | null;
  }>,
) {
  const emailGroups = new Map<string, typeof entries>();
  const phoneGroups = new Map<string, typeof entries>();

  for (const entry of entries) {
    const email = normalizeEmail(entry.email);
    const phone = normalizePhone(entry.phone);

    if (email) {
      emailGroups.set(email, [...(emailGroups.get(email) ?? []), entry]);
    }

    if (phone) {
      phoneGroups.set(phone, [...(phoneGroups.get(phone) ?? []), entry]);
    }
  }

  const duplicateMap = new Map<string, ChurchAdminDuplicateCandidate[]>();

  for (const entry of entries) {
    const candidates = new Map<string, ChurchAdminDuplicateCandidate>();
    const email = normalizeEmail(entry.email);
    const phone = normalizePhone(entry.phone);

    for (const candidate of email ? emailGroups.get(email) ?? [] : []) {
      if (candidate.id !== entry.id) {
        candidates.set(candidate.id, {
          id: candidate.id,
          fullName: candidate.full_name,
          email: candidate.email,
          phone: candidate.phone,
          familyName: candidate.family_name,
          role: normalizeRole(candidate.role),
        });
      }
    }

    for (const candidate of phone ? phoneGroups.get(phone) ?? [] : []) {
      if (candidate.id !== entry.id) {
        candidates.set(candidate.id, {
          id: candidate.id,
          fullName: candidate.full_name,
          email: candidate.email,
          phone: candidate.phone,
          familyName: candidate.family_name,
          role: normalizeRole(candidate.role),
        });
      }
    }

    duplicateMap.set(entry.id, Array.from(candidates.values()));
  }

  return duplicateMap;
}

export async function getChurchAdminPeopleData(
  session: ChurchAppSession,
): Promise<ChurchAdminPeopleData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewChurchAdminPeopleData();
  }

  if (shouldUseLocalTenantFallback()) {
    const peopleResult = await queryTenantLocalDb<{
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      display_title: string | null;
      role: string | null;
      membership_status: string | null;
      member_number: string | null;
      account_status: string | null;
      directory_visible: boolean | null;
      contact_allowed: boolean | null;
      preferred_contact_method: string | null;
      emergency_contact_name: string | null;
      emergency_contact_phone: string | null;
      family_name: string | null;
      family_id: string | null;
    }>(
      `
        select
          profile.id,
          profile.full_name,
          profile.email,
          profile.phone,
          profile.address,
          profile.display_title,
          profile.role,
          profile.membership_status,
          profile.member_number,
          profile.account_status,
          profile.directory_visible,
          profile.contact_allowed,
          profile.preferred_contact_method,
          sensitive.emergency_contact_name,
          sensitive.emergency_contact_phone,
          family.family_name,
          profile.family_id
        from public.profiles profile
        left join public.families family
          on family.id = profile.family_id
        left join public.profile_sensitive_fields sensitive
          on sensitive.profile_id = profile.id
        where profile.church_id = $1
          and profile.merged_at is null
        order by profile.full_name
        limit 500
      `,
      [session.appContext.church.id],
    );

    const familiesResult = await queryTenantLocalDb<{
      id: string;
      family_name: string;
    }>(
      `
        select id, family_name
        from public.families
        where church_id = $1
        order by family_name
      `,
      [session.appContext.church.id],
    );
    const accountRequestsResult = await queryTenantLocalDb<{
      id: string;
      profile_id: string | null;
      email: string;
      created_at: string;
    }>(
      `
        select id, profile_id, email, created_at
        from public.account_requests
        where church_id = $1
          and status = 'pending'
        order by created_at asc
      `,
      [session.appContext.church.id],
    );

    const peopleRows = peopleResult.rows;
    const duplicateMap = buildDuplicateMap(peopleRows);
    const personIds = peopleRows.map((row) => row.id);
    const ministryResult =
      personIds.length
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
            [personIds],
          )
        : { rows: [] as Array<{ profile_id: string; ministry_name: string }> };

    const ministryMap = ministryResult.rows.reduce((map, row) => {
      const names = map.get(row.profile_id) ?? [];
      names.push(row.ministry_name);
      map.set(row.profile_id, names);
      return map;
    }, new Map<string, string[]>());

    const shepherdMap = buildShepherdMap(
      await getMemberShepherdInsights(
        session,
        peopleRows.map((row) => row.id),
      ),
    );

    const pendingAccountRequests = accountRequestsResult.rows;
    const peopleEntries = applyPendingAccountRequests(
      peopleRows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        address: row.address,
        displayTitle: row.display_title,
        role: normalizeRole(row.role),
        membershipStatus: row.membership_status ?? "active",
        memberNumber: row.member_number,
        accountStatus: row.account_status,
        pendingAccountRequestId: null,
        pendingAccountRequestCreatedAt: null,
        directoryVisible: row.directory_visible !== false,
        contactAllowed: row.contact_allowed !== false,
        preferredContactMethod: row.preferred_contact_method,
        emergencyContactName: row.emergency_contact_name,
        emergencyContactPhone: row.emergency_contact_phone,
        familyId: row.family_id,
        familyName: row.family_name,
      })),
      pendingAccountRequests,
    );

    const people = buildPeople(
      peopleEntries,
      ministryMap,
      shepherdMap,
      duplicateMap,
    );

    const familyIds = new Set(
      peopleRows
        .map((row) => row.family_id)
        .filter((value): value is string => Boolean(value)),
    );

    return {
      source: "live",
      summary: {
        totalPeople: people.length,
        visitorCount: people.filter((person) => person.membershipStatus === "visitor").length,
        familyCount: familyIds.size,
        unassignedHouseholdCount: people.filter((person) => !person.familyId).length,
        incompleteProfiles: people.filter(
          (person) => !person.phone || !person.emergencyContactName,
        ).length,
        pendingAccountRequests: pendingAccountRequests.length,
      },
      people,
      families: familiesResult.rows.map((row) => ({
        id: row.id,
        familyName: row.family_name,
      })),
    };
  }

  const supabase = await createTenantServerClient();
  const [{ data: peopleRows }, { data: familyRowsAll }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, address, display_title, role, membership_status, member_number, account_status, directory_visible, contact_allowed, preferred_contact_method, family_id, profile_sensitive_fields(emergency_contact_name, emergency_contact_phone)",
      )
      .eq("church_id", session.appContext.church.id)
      .is("merged_at", null)
      .order("full_name")
      .limit(500),
    supabase
      .from("families")
      .select("id, family_name")
      .eq("church_id", session.appContext.church.id)
      .order("family_name"),
  ]);

  const people = peopleRows ?? [];
  const personIds = people.map((row) => row.id);
  const familyIds = Array.from(
    new Set(
      people
        .map((row) => row.family_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [ministryRows, familyRows] = await Promise.all([
    personIds.length
      ? supabase
          .from("profile_ministries")
          .select("profile_id, ministries(name)")
          .in("profile_id", personIds)
      : {
          data: [] as Array<{
            profile_id: string;
            ministries: { name?: string | null } | null;
          }>,
        },
    familyIds.length
      ? supabase.from("families").select("id, family_name").in("id", familyIds)
      : { data: [] as Array<{ id: string; family_name: string }> },
  ]);

  const ministryMap = (ministryRows.data ?? []).reduce((map, row) => {
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

  const familyMap = new Map(
    (familyRows.data ?? []).map((row) => [row.id, row.family_name]),
  );
  const duplicateMap = buildDuplicateMap(
    people.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      family_name: row.family_id ? familyMap.get(row.family_id) ?? null : null,
      role: row.role,
    })),
  );

  const shepherdMap = buildShepherdMap(
    await getMemberShepherdInsights(
      session,
      people.map((row) => row.id),
    ),
  );
  const { data: accountRequestRows } = await supabase
    .from("account_requests")
    .select("id, profile_id, email, created_at")
    .eq("church_id", session.appContext.church.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const pendingAccountRequests = accountRequestRows ?? [];
  const peopleEntries = applyPendingAccountRequests(
    people.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      displayTitle: row.display_title,
      role: normalizeRole(row.role),
      membershipStatus: row.membership_status ?? "active",
      memberNumber:
        "member_number" in row ? ((row as { member_number?: string | null }).member_number ?? null) : null,
      accountStatus:
        "account_status" in row ? ((row as { account_status?: string | null }).account_status ?? null) : null,
      pendingAccountRequestId: null,
      pendingAccountRequestCreatedAt: null,
      directoryVisible: row.directory_visible !== false,
      contactAllowed: row.contact_allowed !== false,
      preferredContactMethod: row.preferred_contact_method ?? null,
      emergencyContactName:
        (row.profile_sensitive_fields as unknown as Array<{ emergency_contact_name: string | null }> | null)
          ?.[0]?.emergency_contact_name ?? null,
      emergencyContactPhone:
        (row.profile_sensitive_fields as unknown as Array<{ emergency_contact_phone: string | null }> | null)
          ?.[0]?.emergency_contact_phone ?? null,
      familyId: row.family_id ?? null,
      familyName: row.family_id ? familyMap.get(row.family_id) ?? null : null,
    })),
    pendingAccountRequests,
  );

  const normalizedPeople = buildPeople(
    peopleEntries,
    ministryMap,
    shepherdMap,
    duplicateMap,
  );

  return {
    source: "live",
    summary: {
      totalPeople: normalizedPeople.length,
      visitorCount: normalizedPeople.filter((person) => person.membershipStatus === "visitor")
        .length,
      familyCount: familyIds.length,
      unassignedHouseholdCount: normalizedPeople.filter((person) => !person.familyId).length,
      incompleteProfiles: normalizedPeople.filter(
        (person) => !person.phone || !person.emergencyContactName,
      ).length,
      pendingAccountRequests: pendingAccountRequests.length,
    },
    people: normalizedPeople,
    families:
      familyRowsAll?.map((row) => ({
        id: row.id,
        familyName: row.family_name,
      })) ?? [],
  };
}
