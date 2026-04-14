import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type {
  HealthHistoryEntry,
  KingdomImpactEntry,
  MemberMinistriesData,
  MemberMinistryEntry,
  MinistryForgeDetail,
  MinistryForgeEntry,
  MinistryForgeListData,
  MinistryMember,
  MinistryType,
} from "@/lib/ministry-forge-types";

// ============================================================
// Health score computation (Phase 2 foundation — rule-based)
// Formula: (attendanceRate * 0.4) + (memberEngagement * 0.3)
//          + (retention * 0.2) + (impactCount * 0.1)
// Phase 3 will make this AI-assisted.
// ============================================================
function computeHealthScore(params: {
  memberCount: number;
  recentAttendanceCount: number;
  activeAssignmentCount: number;
  impactCount90d: number;
}): number {
  const { memberCount, recentAttendanceCount, activeAssignmentCount, impactCount90d } = params;

  if (memberCount === 0) return 0;

  // Attendance rate: recent attendances vs expected (members * 4 weeks)
  const expectedAttendances = memberCount * 4;
  const attendanceRate = Math.min(recentAttendanceCount / Math.max(expectedAttendances, 1), 1);

  // Engagement: active care assignments relative to member count
  const engagement = Math.min(activeAssignmentCount / Math.max(memberCount, 1), 1);

  // Retention: simple flat score when member count >= 2
  const retention = memberCount >= 2 ? 0.8 : 0.4;

  // Impact: normalize to a 0-1 score, cap at 10 impacts = 1.0
  const impactRate = Math.min(impactCount90d / 10, 1);

  const raw =
    attendanceRate * 0.4 +
    engagement * 0.3 +
    retention * 0.2 +
    impactRate * 0.1;

  return Math.round(raw * 10 * 100) / 100; // 0–10 scale, 2 decimal places
}

function buildBurnoutWarnings(members: MinistryMember[]): string[] {
  return members
    .filter((m) => m.ministryCount > 3)
    .map(
      (m) =>
        `${m.fullName} is serving in ${m.ministryCount} ministries — consider reviewing their load.`,
    );
}

function buildPreviewMinistryList(): MinistryForgeListData {
  return { ministries: [] };
}

function buildPreviewMinistryDetail(ministryId: string): MinistryForgeDetail {
  return {
    ministry: {
      id: ministryId,
      name: "Preview Ministry",
      ministryType: null,
      visionStatement: null,
      scripturalAnchor: [],
      healthScore: 0,
      lastHealthAssessment: null,
      memberCount: 0,
    },
    members: [],
    healthHistory: [],
    recentImpacts: [],
    burnoutWarnings: [],
  };
}

// ============================================================
// getMinistryForgeList — list all ministries for a church
// Accessible by: pastor, church_admin, ministry_leader
// ============================================================
export async function getMinistryForgeList(
  session: ChurchAppSession,
): Promise<MinistryForgeListData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMinistryList();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const rows = await queryTenantLocalDb<{
      id: string;
      name: string;
      ministry_type: string | null;
      vision_statement: string | null;
      scriptural_anchor: string[] | null;
      health_score: string;
      last_health_assessment: string | null;
      member_count: string;
    }>(
      `
        select
          m.id,
          m.name,
          m.ministry_type,
          m.vision_statement,
          m.scriptural_anchor,
          m.health_score,
          m.last_health_assessment,
          count(pm.id)::text as member_count
        from public.ministries m
        left join public.profile_ministries pm
          on pm.ministry_id = m.id
        where m.church_id = $1
        group by m.id
        order by m.name
      `,
      [churchId],
    );

    return {
      ministries: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        ministryType: (row.ministry_type as MinistryType) ?? null,
        visionStatement: row.vision_statement,
        scripturalAnchor: row.scriptural_anchor ?? [],
        healthScore: parseFloat(row.health_score) || 0,
        lastHealthAssessment: row.last_health_assessment,
        memberCount: parseInt(row.member_count, 10) || 0,
      })),
    };
  }

  const supabase = await createTenantServerClient();
  const { data: ministryRows } = await supabase
    .from("ministries")
    .select(
      "id, name, ministry_type, vision_statement, scriptural_anchor, health_score, last_health_assessment, profile_ministries(id)",
    )
    .eq("church_id", churchId)
    .order("name");

  return {
    ministries: (ministryRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      ministryType: (row.ministry_type as MinistryType) ?? null,
      visionStatement: row.vision_statement ?? null,
      scripturalAnchor: (row.scriptural_anchor as string[]) ?? [],
      healthScore: (row.health_score as unknown as number) ?? 0,
      lastHealthAssessment: row.last_health_assessment ?? null,
      memberCount: Array.isArray(row.profile_ministries) ? row.profile_ministries.length : 0,
    })),
  };
}

// ============================================================
// getMinistryForgeDetail — full detail for a single ministry
// ============================================================
export async function getMinistryForgeDetail(
  session: ChurchAppSession,
  ministryId: string,
): Promise<MinistryForgeDetail | null> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMinistryDetail(ministryId);
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    // Ministry row
    const ministryResult = await queryTenantLocalDb<{
      id: string;
      name: string;
      ministry_type: string | null;
      vision_statement: string | null;
      scriptural_anchor: string[] | null;
      health_score: string;
      last_health_assessment: string | null;
    }>(
      `
        select id, name, ministry_type, vision_statement, scriptural_anchor,
               health_score, last_health_assessment
        from public.ministries
        where id = $1 and church_id = $2
        limit 1
      `,
      [ministryId, churchId],
    );

    const ministryRow = ministryResult.rows[0];
    if (!ministryRow) return null;

    // Members
    const membersResult = await queryTenantLocalDb<{
      profile_id: string;
      full_name: string;
      role: string;
      display_title: string | null;
      spiritual_gifts: string | null;
      ministry_count: string;
    }>(
      `
        select
          pm.profile_id,
          p.full_name,
          pm.role,
          p.display_title,
          p.spiritual_gifts::text as spiritual_gifts,
          (
            select count(*)::text
            from public.profile_ministries pm2
            where pm2.profile_id = pm.profile_id
          ) as ministry_count
        from public.profile_ministries pm
        join public.profiles p on p.id = pm.profile_id
        where pm.ministry_id = $1
        order by p.full_name
      `,
      [ministryId],
    );

    // Health history (last 10)
    const historyResult = await queryTenantLocalDb<{
      id: string;
      health_score: string;
      assessment_date: string;
      notes: string | null;
    }>(
      `
        select id, health_score, assessment_date, notes
        from public.ministry_health_history
        where ministry_id = $1 and church_id = $2
        order by assessment_date desc
        limit 10
      `,
      [ministryId, churchId],
    );

    // Kingdom impacts (last 90 days)
    const impactsResult = await queryTenantLocalDb<{
      id: string;
      impact_type: string;
      description: string | null;
      occurred_at: string;
      created_by_name: string | null;
    }>(
      `
        select
          ki.id,
          ki.impact_type,
          ki.description,
          ki.occurred_at,
          p.full_name as created_by_name
        from public.kingdom_impacts ki
        left join public.profiles p on p.id = ki.created_by
        where ki.ministry_id = $1
          and ki.church_id = $2
          and ki.occurred_at >= now() - interval '90 days'
        order by ki.occurred_at desc
        limit 20
      `,
      [ministryId, churchId],
    );

    const members: MinistryMember[] = membersResult.rows.map((row) => {
      let gifts: string[] | null = null;
      try {
        const parsed = row.spiritual_gifts ? JSON.parse(row.spiritual_gifts) : null;
        gifts = Array.isArray(parsed) ? parsed : null;
      } catch {
        gifts = null;
      }
      return {
        profileId: row.profile_id,
        fullName: row.full_name,
        role: row.role,
        displayTitle: row.display_title,
        spiritualGifts: gifts,
        ministryCount: parseInt(row.ministry_count, 10) || 0,
      };
    });

    const ministry: MinistryForgeEntry = {
      id: ministryRow.id,
      name: ministryRow.name,
      ministryType: (ministryRow.ministry_type as MinistryType) ?? null,
      visionStatement: ministryRow.vision_statement,
      scripturalAnchor: ministryRow.scriptural_anchor ?? [],
      healthScore: parseFloat(ministryRow.health_score) || 0,
      lastHealthAssessment: ministryRow.last_health_assessment,
      memberCount: members.length,
    };

    return {
      ministry,
      members,
      healthHistory: historyResult.rows.map((row) => ({
        id: row.id,
        healthScore: parseFloat(row.health_score) || 0,
        assessmentDate: row.assessment_date,
        notes: row.notes,
      })),
      recentImpacts: impactsResult.rows.map((row) => ({
        id: row.id,
        impactType: row.impact_type,
        description: row.description,
        occurredAt: row.occurred_at,
        createdByName: row.created_by_name,
      })),
      burnoutWarnings: buildBurnoutWarnings(members),
    };
  }

  const supabase = await createTenantServerClient();

  const { data: ministryRow } = await supabase
    .from("ministries")
    .select(
      "id, name, ministry_type, vision_statement, scriptural_anchor, health_score, last_health_assessment",
    )
    .eq("id", ministryId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (!ministryRow) return null;

  const [membersRes, historyRes, impactsRes] = await Promise.all([
    supabase
      .from("profile_ministries")
      .select("profile_id, role, profiles(full_name, display_title, spiritual_gifts)")
      .eq("ministry_id", ministryId)
      .order("profiles(full_name)" as Parameters<typeof supabase.from>[0]),
    supabase
      .from("ministry_health_history")
      .select("id, health_score, assessment_date, notes")
      .eq("ministry_id", ministryId)
      .eq("church_id", churchId)
      .order("assessment_date", { ascending: false })
      .limit(10),
    supabase
      .from("kingdom_impacts")
      .select("id, impact_type, description, occurred_at, profiles(full_name)")
      .eq("ministry_id", ministryId)
      .eq("church_id", churchId)
      .gte("occurred_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  // Count per-profile ministry memberships for burnout check
  const profileIds = (membersRes.data ?? []).map((r) => r.profile_id);
  const { data: countRows } = profileIds.length
    ? await supabase
        .from("profile_ministries")
        .select("profile_id")
        .in("profile_id", profileIds)
    : { data: [] as Array<{ profile_id: string }> };

  const ministryCounts = (countRows ?? []).reduce(
    (acc, row) => {
      acc[row.profile_id] = (acc[row.profile_id] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const members: MinistryMember[] = (membersRes.data ?? []).map((row) => {
    const profile = row.profiles as unknown as {
      full_name: string;
      display_title: string | null;
      spiritual_gifts: unknown;
    } | null;
    let gifts: string[] | null = null;
    if (Array.isArray(profile?.spiritual_gifts)) {
      gifts = profile.spiritual_gifts as string[];
    }
    return {
      profileId: row.profile_id,
      fullName: profile?.full_name ?? "Unknown",
      role: row.role,
      displayTitle: profile?.display_title ?? null,
      spiritualGifts: gifts,
      ministryCount: ministryCounts[row.profile_id] ?? 1,
    };
  });

  const ministry: MinistryForgeEntry = {
    id: ministryRow.id,
    name: ministryRow.name,
    ministryType: (ministryRow.ministry_type as MinistryType) ?? null,
    visionStatement: ministryRow.vision_statement ?? null,
    scripturalAnchor: (ministryRow.scriptural_anchor as string[]) ?? [],
    healthScore: (ministryRow.health_score as unknown as number) ?? 0,
    lastHealthAssessment: ministryRow.last_health_assessment ?? null,
    memberCount: members.length,
  };

  return {
    ministry,
    members,
    healthHistory: (historyRes.data ?? []).map((row) => ({
      id: row.id,
      healthScore: (row.health_score as unknown as number) ?? 0,
      assessmentDate: row.assessment_date,
      notes: row.notes ?? null,
    })),
    recentImpacts: (impactsRes.data ?? []).map((row) => {
      const creator = row.profiles as unknown as { full_name: string } | null;
      return {
        id: row.id,
        impactType: row.impact_type,
        description: row.description ?? null,
        occurredAt: row.occurred_at,
        createdByName: creator?.full_name ?? null,
      };
    }),
    burnoutWarnings: buildBurnoutWarnings(members),
  };
}

// ============================================================
// getMemberMinistries — member-facing ministry list
// Returns only the ministries the calling member belongs to
// ============================================================
export async function getMemberMinistriesData(
  session: ChurchAppSession,
): Promise<MemberMinistriesData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { ministries: [], allChurchMinistries: [] };
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const ownResult = await queryTenantLocalDb<{
      id: string;
      name: string;
      ministry_type: string | null;
      vision_statement: string | null;
      role: string;
      member_count: string;
    }>(
      `
        select
          m.id,
          m.name,
          m.ministry_type,
          m.vision_statement,
          pm.role,
          (
            select count(*)::text
            from public.profile_ministries pm2
            where pm2.ministry_id = m.id
          ) as member_count
        from public.profile_ministries pm
        join public.ministries m on m.id = pm.ministry_id
        join public.profiles p on p.id = pm.profile_id
        where p.user_id = $1
          and m.church_id = $2
        order by m.name
      `,
      [session.userId, churchId],
    );

    const allResult = await queryTenantLocalDb<{
      id: string;
      name: string;
      ministry_type: string | null;
    }>(
      `select id, name, ministry_type from public.ministries where church_id = $1 order by name`,
      [churchId],
    );

    return {
      ministries: ownResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        ministryType: (row.ministry_type as MinistryType) ?? null,
        visionStatement: row.vision_statement,
        role: row.role,
        memberCount: parseInt(row.member_count, 10) || 0,
      })),
      allChurchMinistries: allResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        ministryType: (row.ministry_type as MinistryType) ?? null,
      })),
    };
  }

  const supabase = await createTenantServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", churchId)
    .maybeSingle();

  const [ownRes, allRes] = await Promise.all([
    profile
      ? supabase
          .from("profile_ministries")
          .select("role, ministries(id, name, ministry_type, vision_statement, profile_ministries(id))")
          .eq("profile_id", profile.id)
      : { data: [] as Array<unknown> },
    supabase
      .from("ministries")
      .select("id, name, ministry_type")
      .eq("church_id", churchId)
      .order("name"),
  ]);

  return {
    ministries: (ownRes.data ?? []).map((row) => {
      const r = row as {
        role: string;
        ministries: {
          id: string;
          name: string;
          ministry_type: string | null;
          vision_statement: string | null;
          profile_ministries: Array<unknown>;
        } | null;
      };
      return {
        id: r.ministries?.id ?? "",
        name: r.ministries?.name ?? "",
        ministryType: (r.ministries?.ministry_type as MinistryType) ?? null,
        visionStatement: r.ministries?.vision_statement ?? null,
        role: r.role,
        memberCount: r.ministries?.profile_ministries?.length ?? 0,
      };
    }),
    allChurchMinistries: (allRes.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      ministryType: (row.ministry_type as MinistryType) ?? null,
    })),
  };
}

