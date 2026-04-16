import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type {
  BurnoutAlert,
  DiscipleshipGroup,
  HealthHistoryEntry,
  KingdomImpactEntry,
  LifeStageCircle,
  MarriageCohort,
  MarriageTrackData,
  MemberMinistriesData,
  MemberMinistryEntry,
  MensTrackData,
  MentorCouple,
  MentorshipPair,
  MinistryForgeDetail,
  MinistryForgeEntry,
  MinistryForgeListData,
  MinistryMember,
  MinistryType,
  MissionPartner,
  MissionTrip,
  MissionsTrackData,
  SupportPairing,
  VolunteerMatchSuggestion,
  VolunteerMatcherData,
  WomensTrackData,
  WorshipRehearsal,
  WorshipSong,
  WorshipTrackData,
} from "@/lib/ministry-forge-types";
import {
  BURNOUT_THRESHOLD_HIGH,
  BURNOUT_THRESHOLD_MEDIUM,
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

// ============================================================
// getVolunteerMatcherData — Phase 3
// Returns pending match suggestions + active burnout alerts
// for a specific ministry, scoped to the calling church.
// ============================================================
export async function getVolunteerMatcherData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<VolunteerMatcherData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { suggestions: [], burnoutAlerts: [] };
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const suggestionsResult = await queryTenantLocalDb<{
      id: string;
      ministry_id: string;
      profile_id: string;
      full_name: string;
      spiritual_gifts: string | null;
      current_ministry_load: string;
      match_score: string;
      reason_text: string | null;
      ai_generated: boolean;
      status: string;
      created_at: string;
      reviewed_at: string | null;
    }>(
      `
        select
          vms.id,
          vms.ministry_id,
          vms.profile_id,
          p.full_name,
          p.spiritual_gifts::text as spiritual_gifts,
          p.current_ministry_load,
          vms.match_score,
          vms.reason_text,
          vms.ai_generated,
          vms.status,
          vms.created_at,
          vms.reviewed_at
        from public.volunteer_match_suggestions vms
        join public.profiles p on p.id = vms.profile_id
        where vms.ministry_id = $1
          and vms.church_id   = $2
          and vms.status      = 'pending'
        order by vms.match_score desc
      `,
      [ministryId, churchId],
    );

    const alertsResult = await queryTenantLocalDb<{
      id: string;
      profile_id: string;
      full_name: string;
      ministry_id: string | null;
      alert_type: string;
      message: string;
      severity: string;
      acknowledged: boolean;
      created_at: string;
    }>(
      `
        select
          ba.id,
          ba.profile_id,
          p.full_name,
          ba.ministry_id,
          ba.alert_type,
          ba.message,
          ba.severity,
          ba.acknowledged,
          ba.created_at
        from public.burnout_alerts ba
        join public.profiles p on p.id = ba.profile_id
        where ba.church_id      = $1
          and ba.acknowledged   = false
          and (ba.ministry_id   = $2 or ba.ministry_id is null)
        order by
          case ba.severity
            when 'high'   then 1
            when 'medium' then 2
            else               3
          end,
          ba.created_at desc
        limit 20
      `,
      [churchId, ministryId],
    );

    return {
      suggestions: suggestionsResult.rows.map((row) => {
        let gifts: string[] | null = null;
        try {
          const parsed = row.spiritual_gifts ? JSON.parse(row.spiritual_gifts) : null;
          gifts = Array.isArray(parsed) ? parsed : null;
        } catch {
          gifts = null;
        }
        return {
          id: row.id,
          ministryId: row.ministry_id,
          profileId: row.profile_id,
          profileName: row.full_name,
          spiritualGifts: gifts,
          currentLoad: parseInt(row.current_ministry_load, 10) || 0,
          matchScore: parseFloat(row.match_score) || 0,
          reasonText: row.reason_text,
          aiGenerated: row.ai_generated,
          status: row.status as VolunteerMatchSuggestion["status"],
          createdAt: row.created_at,
          reviewedAt: row.reviewed_at,
        };
      }),
      burnoutAlerts: alertsResult.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        profileName: row.full_name,
        ministryId: row.ministry_id,
        alertType: row.alert_type as BurnoutAlert["alertType"],
        message: row.message,
        severity: row.severity as BurnoutAlert["severity"],
        acknowledged: row.acknowledged,
        createdAt: row.created_at,
      })),
    };
  }

  // Supabase path
  const supabase = await createTenantServerClient();

  const [suggestionsRes, alertsRes] = await Promise.all([
    supabase
      .from("volunteer_match_suggestions")
      .select(
        "id, ministry_id, profile_id, match_score, reason_text, ai_generated, status, created_at, reviewed_at, profiles(full_name, spiritual_gifts, current_ministry_load)",
      )
      .eq("ministry_id", ministryId)
      .eq("church_id", churchId)
      .eq("status", "pending")
      .order("match_score", { ascending: false }),
    supabase
      .from("burnout_alerts")
      .select(
        "id, profile_id, ministry_id, alert_type, message, severity, acknowledged, created_at, profiles(full_name)",
      )
      .eq("church_id", churchId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const suggestions: VolunteerMatchSuggestion[] = (suggestionsRes.data ?? []).map((row) => {
    const profile = row.profiles as unknown as {
      full_name: string;
      spiritual_gifts: unknown;
      current_ministry_load: number | null;
    } | null;
    let gifts: string[] | null = null;
    if (Array.isArray(profile?.spiritual_gifts)) {
      gifts = profile.spiritual_gifts as string[];
    }
    return {
      id: row.id,
      ministryId: row.ministry_id,
      profileId: row.profile_id,
      profileName: profile?.full_name ?? "Unknown",
      spiritualGifts: gifts,
      currentLoad: profile?.current_ministry_load ?? 0,
      matchScore: (row.match_score as unknown as number) ?? 0,
      reasonText: row.reason_text ?? null,
      aiGenerated: row.ai_generated,
      status: row.status as VolunteerMatchSuggestion["status"],
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? null,
    };
  });

  const burnoutAlerts: BurnoutAlert[] = (alertsRes.data ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string } | null;
    return {
      id: row.id,
      profileId: row.profile_id,
      profileName: profile?.full_name ?? "Unknown",
      ministryId: row.ministry_id ?? null,
      alertType: row.alert_type as BurnoutAlert["alertType"],
      message: row.message,
      severity: row.severity as BurnoutAlert["severity"],
      acknowledged: row.acknowledged,
      createdAt: row.created_at,
    };
  });

  return { suggestions, burnoutAlerts };
}

// ============================================================
// computeMinistryBurnoutAlerts — Phase 3
// Rule-based detection. Inspects current member load and
// returns structured alert objects WITHOUT persisting them.
// The server action is responsible for persisting.
// ============================================================
export function computeMinistryBurnoutAlerts(
  members: MinistryMember[],
  churchId: string,
  ministryId: string,
): Array<{
  profileId: string;
  ministryId: string;
  churchId: string;
  alertType: BurnoutAlert["alertType"];
  message: string;
  severity: BurnoutAlert["severity"];
}> {
  const alerts: ReturnType<typeof computeMinistryBurnoutAlerts> = [];

  for (const member of members) {
    const load = member.ministryCount;
    if (load > BURNOUT_THRESHOLD_HIGH) {
      alerts.push({
        profileId: member.profileId,
        ministryId,
        churchId,
        alertType: "high_load",
        message: `${member.fullName} is serving in ${load} ministries — high burnout risk. Consider rotation or a season of rest.`,
        severity: "high",
      });
    } else if (load > BURNOUT_THRESHOLD_MEDIUM) {
      alerts.push({
        profileId: member.profileId,
        ministryId,
        churchId,
        alertType: "high_load",
        message: `${member.fullName} is serving in ${load} ministries — review their capacity with care.`,
        severity: "medium",
      });
    }
  }

  return alerts;
}

// ── Phase 4: Per-track data loaders ──────────────────────────────────────────
// All loaders return empty preview-safe data when no backend is configured.

// ── Worship ───────────────────────────────────────────────────────────────────

function buildPreviewWorshipData(): WorshipTrackData {
  return {
    songs: [
      { id: "s1", title: "Great Is Thy Faithfulness", artist: "Traditional", songKey: "G", tempo: "Moderate", tags: ["hymn", "sunday"], lastUsedAt: "2026-04-06" },
      { id: "s2", title: "Build My Life", artist: "Housefires", songKey: "D", tempo: "Medium", tags: ["contemporary"], lastUsedAt: "2026-03-30" },
      { id: "s3", title: "Way Maker", artist: "Sinach", songKey: "A", tempo: "Moderate", tags: ["worship", "contemporary"], lastUsedAt: "2026-03-23" },
    ],
    rehearsals: [
      { id: "r1", scheduledAt: "2026-04-19T10:00:00Z", notes: "Run through Easter Sunday set", rsvpCount: 8, songIds: ["s1", "s2"] },
      { id: "r2", scheduledAt: "2026-04-26T10:00:00Z", notes: null, rsvpCount: 6, songIds: ["s3"] },
    ],
  };
}

export async function getWorshipTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<WorshipTrackData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewWorshipData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [songsResult, rehearsalsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; title: string; artist: string | null; song_key: string | null;
        tempo: string | null; tags: string[]; last_used_at: string | null;
      }>(
        `select id, title, artist, song_key, tempo, tags, last_used_at::text
         from public.worship_songs
         where ministry_id = $1 and church_id = $2
         order by last_used_at desc nulls last`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; scheduled_at: string; notes: string | null;
        rsvp_count: number; song_ids: string[];
      }>(
        `select id, scheduled_at::text, notes, rsvp_count, song_ids
         from public.worship_rehearsals
         where ministry_id = $1 and church_id = $2
         order by scheduled_at desc limit 10`,
        [ministryId, churchId],
      ),
    ]);

    const songs: WorshipSong[] = songsResult.rows.map((r) => ({
      id: r.id, title: r.title, artist: r.artist, songKey: r.song_key,
      tempo: r.tempo, tags: r.tags ?? [], lastUsedAt: r.last_used_at,
    }));
    const rehearsals: WorshipRehearsal[] = rehearsalsResult.rows.map((r) => ({
      id: r.id, scheduledAt: r.scheduled_at, notes: r.notes,
      rsvpCount: r.rsvp_count, songIds: r.song_ids ?? [],
    }));
    return { songs, rehearsals };
  }

  const supabase = await createTenantServerClient();
  const [{ data: songsData }, { data: rehearsalsData }] = await Promise.all([
    supabase.from("worship_songs").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("last_used_at", { ascending: false }),
    supabase.from("worship_rehearsals").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("scheduled_at", { ascending: false }).limit(10),
  ]);

  const songs: WorshipSong[] = (songsData ?? []).map((r) => ({
    id: r.id, title: r.title, artist: r.artist ?? null, songKey: r.song_key ?? null,
    tempo: r.tempo ?? null, tags: r.tags ?? [], lastUsedAt: r.last_used_at ?? null,
  }));
  const rehearsals: WorshipRehearsal[] = (rehearsalsData ?? []).map((r) => ({
    id: r.id, scheduledAt: r.scheduled_at, notes: r.notes ?? null,
    rsvpCount: r.rsvp_count ?? 0, songIds: r.song_ids ?? [],
  }));
  return { songs, rehearsals };
}

// ── Men's Ministry ────────────────────────────────────────────────────────────

function buildPreviewMensData(): MensTrackData {
  return {
    mentorshipPairs: [
      { id: "mp1", mentorId: "p1", mentorName: "Robert James", menteeId: "p2", menteeName: "David Chen", status: "active", startedAt: "2026-01-15", notes: null },
      { id: "mp2", mentorId: "p3", mentorName: "Marcus Williams", menteeId: "p4", menteeName: "Tyler Brooks", status: "active", startedAt: "2026-02-01", notes: null },
    ],
    discipleshipGroups: [
      { id: "dg1", name: "Iron Sharpens Iron", leaderId: "p1", leaderName: "Robert James", cadence: "Tuesdays 7pm", isOpen: false, memberCount: 6 },
      { id: "dg2", name: "Young Men's Discipleship", leaderId: "p3", leaderName: "Marcus Williams", cadence: "Thursdays 6:30pm", isOpen: true, memberCount: 4 },
    ],
  };
}

export async function getMensTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<MensTrackData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMensData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [pairsResult, groupsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; mentor_id: string; mentor_name: string; mentee_id: string;
        mentee_name: string; status: string; started_at: string | null; notes: string | null;
      }>(
        `select mp.id, mp.mentor_id, pm.full_name as mentor_name,
                mp.mentee_id, pe.full_name as mentee_name,
                mp.status, mp.started_at::text, mp.notes
         from public.mentorship_pairs mp
         join public.profiles pm on pm.id = mp.mentor_id
         join public.profiles pe on pe.id = mp.mentee_id
         where mp.ministry_id = $1 and mp.church_id = $2
         order by mp.created_at desc`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; name: string; leader_id: string | null; leader_name: string | null;
        cadence: string | null; is_open: boolean; member_count: number;
      }>(
        `select dg.id, dg.name, dg.leader_id,
                p.full_name as leader_name, dg.cadence, dg.is_open,
                cardinality(dg.member_ids) as member_count
         from public.discipleship_groups dg
         left join public.profiles p on p.id = dg.leader_id
         where dg.ministry_id = $1 and dg.church_id = $2`,
        [ministryId, churchId],
      ),
    ]);

    const mentorshipPairs: MentorshipPair[] = pairsResult.rows.map((r) => ({
      id: r.id, mentorId: r.mentor_id, mentorName: r.mentor_name,
      menteeId: r.mentee_id, menteeName: r.mentee_name,
      status: r.status, startedAt: r.started_at, notes: r.notes,
    }));
    const discipleshipGroups: DiscipleshipGroup[] = groupsResult.rows.map((r) => ({
      id: r.id, name: r.name, leaderId: r.leader_id, leaderName: r.leader_name,
      cadence: r.cadence, isOpen: r.is_open, memberCount: r.member_count,
    }));
    return { mentorshipPairs, discipleshipGroups };
  }

  const supabase = await createTenantServerClient();
  const [{ data: pairsData }, { data: groupsData }] = await Promise.all([
    supabase.from("mentorship_pairs").select("*, mentor:profiles!mentor_id(full_name), mentee:profiles!mentee_id(full_name)").eq("ministry_id", ministryId).eq("church_id", churchId),
    supabase.from("discipleship_groups").select("*, leader:profiles(full_name)").eq("ministry_id", ministryId).eq("church_id", churchId),
  ]);

  const mentorshipPairs: MentorshipPair[] = (pairsData ?? []).map((r) => ({
    id: r.id,
    mentorId: r.mentor_id,
    mentorName: (r.mentor as { full_name: string } | null)?.full_name ?? "Unknown",
    menteeId: r.mentee_id,
    menteeName: (r.mentee as { full_name: string } | null)?.full_name ?? "Unknown",
    status: r.status,
    startedAt: r.started_at ?? null,
    notes: r.notes ?? null,
  }));
  const discipleshipGroups: DiscipleshipGroup[] = (groupsData ?? []).map((r) => ({
    id: r.id, name: r.name, leaderId: r.leader_id ?? null,
    leaderName: (r.leader as { full_name: string } | null)?.full_name ?? null,
    cadence: r.cadence ?? null, isOpen: r.is_open,
    memberCount: (r.member_ids as string[] | null)?.length ?? 0,
  }));
  return { mentorshipPairs, discipleshipGroups };
}

// ── Women's Ministry ──────────────────────────────────────────────────────────

function buildPreviewWomensData(): WomensTrackData {
  return {
    lifeStageCircles: [
      { id: "lsc1", name: "New Moms Circle", lifeStage: "new_mom", leaderId: "p5", leaderName: "Sarah Mitchell", memberCount: 8, meetingCadence: "Saturdays 10am" },
      { id: "lsc2", name: "Women of Wisdom", lifeStage: "empty_nester", leaderId: "p6", leaderName: "Grace Thompson", memberCount: 12, meetingCadence: "Wednesdays 1pm" },
    ],
    supportPairings: [
      { id: "sp1", supporterId: "p5", supporterName: "Sarah Mitchell", supportedId: "p7", supportedName: "Emily Davis", pairingReason: "new_mom support", status: "active" },
    ],
  };
}

export async function getWomensTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<WomensTrackData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewWomensData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [circlesResult, pairingsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; name: string; life_stage: string; leader_id: string | null;
        leader_name: string | null; member_count: number; meeting_cadence: string | null;
      }>(
        `select lsc.id, lsc.name, lsc.life_stage, lsc.leader_id,
                p.full_name as leader_name,
                cardinality(lsc.member_ids) as member_count,
                lsc.meeting_cadence
         from public.life_stage_circles lsc
         left join public.profiles p on p.id = lsc.leader_id
         where lsc.ministry_id = $1 and lsc.church_id = $2`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; supporter_id: string; supporter_name: string;
        supported_id: string; supported_name: string;
        pairing_reason: string | null; status: string;
      }>(
        `select sp.id, sp.supporter_id, ps.full_name as supporter_name,
                sp.supported_id, pe.full_name as supported_name,
                sp.pairing_reason, sp.status
         from public.support_pairings sp
         join public.profiles ps on ps.id = sp.supporter_id
         join public.profiles pe on pe.id = sp.supported_id
         where sp.ministry_id = $1 and sp.church_id = $2`,
        [ministryId, churchId],
      ),
    ]);

    const lifeStageCircles: LifeStageCircle[] = circlesResult.rows.map((r) => ({
      id: r.id, name: r.name, lifeStage: r.life_stage, leaderId: r.leader_id,
      leaderName: r.leader_name, memberCount: r.member_count, meetingCadence: r.meeting_cadence,
    }));
    const supportPairings: SupportPairing[] = pairingsResult.rows.map((r) => ({
      id: r.id, supporterId: r.supporter_id, supporterName: r.supporter_name,
      supportedId: r.supported_id, supportedName: r.supported_name,
      pairingReason: r.pairing_reason, status: r.status,
    }));
    return { lifeStageCircles, supportPairings };
  }

  const supabase = await createTenantServerClient();
  const [{ data: circlesData }, { data: pairingsData }] = await Promise.all([
    supabase.from("life_stage_circles").select("*, leader:profiles(full_name)").eq("ministry_id", ministryId).eq("church_id", churchId),
    supabase.from("support_pairings").select("*, supporter:profiles!supporter_id(full_name), supported:profiles!supported_id(full_name)").eq("ministry_id", ministryId).eq("church_id", churchId),
  ]);

  const lifeStageCircles: LifeStageCircle[] = (circlesData ?? []).map((r) => ({
    id: r.id, name: r.name, lifeStage: r.life_stage, leaderId: r.leader_id ?? null,
    leaderName: (r.leader as { full_name: string } | null)?.full_name ?? null,
    memberCount: (r.member_ids as string[] | null)?.length ?? 0,
    meetingCadence: r.meeting_cadence ?? null,
  }));
  const supportPairings: SupportPairing[] = (pairingsData ?? []).map((r) => ({
    id: r.id, supporterId: r.supporter_id,
    supporterName: (r.supporter as { full_name: string } | null)?.full_name ?? "Unknown",
    supportedId: r.supported_id,
    supportedName: (r.supported as { full_name: string } | null)?.full_name ?? "Unknown",
    pairingReason: r.pairing_reason ?? null, status: r.status,
  }));
  return { lifeStageCircles, supportPairings };
}

// ── Marriage Ministry ─────────────────────────────────────────────────────────

function buildPreviewMarriageData(): MarriageTrackData {
  return {
    mentorCouples: [
      { id: "mc1", partner1Id: "p8", partner1Name: "John & Mary Anderson", partner2Id: null, partner2Name: null, coupleName: "The Andersons", yearsMarried: 28, isAvailable: true, cohortFocus: "newlywed" },
      { id: "mc2", partner1Id: "p9", partner1Name: "Carlos & Rosa Mendez", partner2Id: null, partner2Name: null, coupleName: "The Mendezes", yearsMarried: 15, isAvailable: false, cohortFocus: "5_15_years" },
    ],
    cohorts: [
      { id: "co1", name: "Newlywed Cohort 2026", cohortStage: "newlywed", mentorCoupleId: "mc1", mentorCoupleName: "The Andersons", coupleCount: 4 },
      { id: "co2", name: "Growing Together", cohortStage: "5_15_years", mentorCoupleId: "mc2", mentorCoupleName: "The Mendezes", coupleCount: 6 },
    ],
  };
}

export async function getMarriageTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<MarriageTrackData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMarriageData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [couplesResult, cohortsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; partner1_id: string; partner1_name: string;
        partner2_id: string | null; partner2_name: string | null;
        couple_name: string | null; years_married: number | null;
        is_available: boolean; cohort_focus: string | null;
      }>(
        `select mc.id, mc.partner1_id, p1.full_name as partner1_name,
                mc.partner2_id, p2.full_name as partner2_name,
                mc.couple_name, mc.years_married, mc.is_available, mc.cohort_focus
         from public.mentor_couples mc
         join public.profiles p1 on p1.id = mc.partner1_id
         left join public.profiles p2 on p2.id = mc.partner2_id
         where mc.ministry_id = $1 and mc.church_id = $2`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; name: string; cohort_stage: string;
        mentor_couple_id: string | null; mentor_couple_name: string | null; couple_count: number;
      }>(
        `select mco.id, mco.name, mco.cohort_stage, mco.mentor_couple_id,
                mc.couple_name as mentor_couple_name,
                cardinality(mco.couple_ids) as couple_count
         from public.marriage_cohorts mco
         left join public.mentor_couples mc on mc.id = mco.mentor_couple_id
         where mco.ministry_id = $1 and mco.church_id = $2`,
        [ministryId, churchId],
      ),
    ]);

    const mentorCouples: MentorCouple[] = couplesResult.rows.map((r) => ({
      id: r.id, partner1Id: r.partner1_id, partner1Name: r.partner1_name,
      partner2Id: r.partner2_id, partner2Name: r.partner2_name,
      coupleName: r.couple_name, yearsMarried: r.years_married,
      isAvailable: r.is_available, cohortFocus: r.cohort_focus,
    }));
    const cohorts: MarriageCohort[] = cohortsResult.rows.map((r) => ({
      id: r.id, name: r.name, cohortStage: r.cohort_stage,
      mentorCoupleId: r.mentor_couple_id, mentorCoupleName: r.mentor_couple_name,
      coupleCount: r.couple_count,
    }));
    return { mentorCouples, cohorts };
  }

  const supabase = await createTenantServerClient();
  const [{ data: couplesData }, { data: cohortsData }] = await Promise.all([
    supabase.from("mentor_couples").select("*, p1:profiles!partner1_id(full_name), p2:profiles!partner2_id(full_name)").eq("ministry_id", ministryId).eq("church_id", churchId),
    supabase.from("marriage_cohorts").select("*, mc:mentor_couples(couple_name)").eq("ministry_id", ministryId).eq("church_id", churchId),
  ]);

  const mentorCouples: MentorCouple[] = (couplesData ?? []).map((r) => ({
    id: r.id, partner1Id: r.partner1_id,
    partner1Name: (r.p1 as { full_name: string } | null)?.full_name ?? "Unknown",
    partner2Id: r.partner2_id ?? null,
    partner2Name: (r.p2 as { full_name: string } | null)?.full_name ?? null,
    coupleName: r.couple_name ?? null, yearsMarried: r.years_married ?? null,
    isAvailable: r.is_available, cohortFocus: r.cohort_focus ?? null,
  }));
  const cohorts: MarriageCohort[] = (cohortsData ?? []).map((r) => ({
    id: r.id, name: r.name, cohortStage: r.cohort_stage,
    mentorCoupleId: r.mentor_couple_id ?? null,
    mentorCoupleName: (r.mc as { couple_name: string } | null)?.couple_name ?? null,
    coupleCount: (r.couple_ids as string[] | null)?.length ?? 0,
  }));
  return { mentorCouples, cohorts };
}

// ── Missions ─────────────────────────────────────────────────────────────────

function buildPreviewMissionsData(): MissionsTrackData {
  return {
    partners: [
      { id: "mpr1", name: "Hope Africa Initiative", region: "East Africa", focusArea: "Church planting", relationshipStatus: "active", contactName: "Pastor Samuel Osei", contactEmail: "samuel@hopeafrica.org" },
      { id: "mpr2", name: "Guatemala Serve", region: "Central America", focusArea: "Medical outreach", relationshipStatus: "active", contactName: "Maria Gonzalez", contactEmail: "maria@guatemalaserve.org" },
    ],
    trips: [
      { id: "mt1", name: "Kenya 2026", destination: "Nairobi, Kenya", departsAt: "2026-06-15", returnsAt: "2026-06-29", status: "confirmed", participantCount: 12, hoursServed: 0, peopleReached: 0, impactNotes: null, partnerId: "mpr1", partnerName: "Hope Africa Initiative" },
      { id: "mt2", name: "Guatemala Medical 2025", destination: "Antigua, Guatemala", departsAt: "2025-11-01", returnsAt: "2025-11-10", status: "completed", participantCount: 8, hoursServed: 480, peopleReached: 320, impactNotes: "Served 320 community members; ran 4 mobile clinics.", partnerId: "mpr2", partnerName: "Guatemala Serve" },
    ],
  };
}

export async function getMissionsTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<MissionsTrackData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMissionsData();
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [partnersResult, tripsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; name: string; region: string | null; focus_area: string | null;
        relationship_status: string; contact_name: string | null; contact_email: string | null;
      }>(
        `select id, name, region, focus_area, relationship_status, contact_name, contact_email
         from public.mission_partners
         where ministry_id = $1 and church_id = $2
         order by name`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; name: string; destination: string | null;
        departs_at: string | null; returns_at: string | null; status: string;
        participant_count: number; hours_served: number; people_reached: number;
        impact_notes: string | null; partner_id: string | null; partner_name: string | null;
      }>(
        `select mt.id, mt.name, mt.destination,
                mt.departs_at::text, mt.returns_at::text, mt.status,
                cardinality(mt.participant_ids) as participant_count,
                mt.hours_served, mt.people_reached, mt.impact_notes,
                mt.partner_id, mp.name as partner_name
         from public.mission_trips mt
         left join public.mission_partners mp on mp.id = mt.partner_id
         where mt.ministry_id = $1 and mt.church_id = $2
         order by mt.departs_at desc`,
        [ministryId, churchId],
      ),
    ]);

    const partners: MissionPartner[] = partnersResult.rows.map((r) => ({
      id: r.id, name: r.name, region: r.region, focusArea: r.focus_area,
      relationshipStatus: r.relationship_status, contactName: r.contact_name, contactEmail: r.contact_email,
    }));
    const trips: MissionTrip[] = tripsResult.rows.map((r) => ({
      id: r.id, name: r.name, destination: r.destination,
      departsAt: r.departs_at, returnsAt: r.returns_at, status: r.status,
      participantCount: r.participant_count, hoursServed: r.hours_served,
      peopleReached: r.people_reached, impactNotes: r.impact_notes,
      partnerId: r.partner_id, partnerName: r.partner_name,
    }));
    return { partners, trips };
  }

  const supabase = await createTenantServerClient();
  const [{ data: partnersData }, { data: tripsData }] = await Promise.all([
    supabase.from("mission_partners").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("name"),
    supabase.from("mission_trips").select("*, partner:mission_partners(name)").eq("ministry_id", ministryId).eq("church_id", churchId).order("departs_at", { ascending: false }),
  ]);

  const partners: MissionPartner[] = (partnersData ?? []).map((r) => ({
    id: r.id, name: r.name, region: r.region ?? null, focusArea: r.focus_area ?? null,
    relationshipStatus: r.relationship_status, contactName: r.contact_name ?? null,
    contactEmail: r.contact_email ?? null,
  }));
  const trips: MissionTrip[] = (tripsData ?? []).map((r) => ({
    id: r.id, name: r.name, destination: r.destination ?? null,
    departsAt: r.departs_at ?? null, returnsAt: r.returns_at ?? null, status: r.status,
    participantCount: (r.participant_ids as string[] | null)?.length ?? 0,
    hoursServed: r.hours_served ?? 0, peopleReached: r.people_reached ?? 0,
    impactNotes: r.impact_notes ?? null, partnerId: r.partner_id ?? null,
    partnerName: (r.partner as { name: string } | null)?.name ?? null,
  }));
  return { partners, trips };
}

