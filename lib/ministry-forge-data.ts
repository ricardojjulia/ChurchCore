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
  BurnoutCandidate,
  CareerMentorship,
  ChildrenCheckin,
  ChildrenRoom,
  ChildrenRoomSafety,
  ChildrenTrackData,
  DiscipleshipGroup,
  DiscipleshipVelocity,
  EducationCourse,
  EducationTrackData,
  LifeStageCircle,
  MarriageCohort,
  MarriageTrackData,
  MemberDoctrinalProgress,
  MemberMinistriesData,
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
  OutreachEvent,
  OutreachTrackData,
  OutreachZone,
  SupportPairing,
  VolunteerMatchSuggestion,
  VolunteerMatcherData,
  WomensTrackData,
  WorshipRehearsal,
  WorshipSong,
  WorshipTrackData,
  YouthMilestone,
  YouthStudent,
  YouthTrackData,
  YoungAdultTrackData,
} from "@/lib/ministry-forge-types";
import {
  BURNOUT_THRESHOLD_HIGH,
  BURNOUT_THRESHOLD_MEDIUM,
} from "@/lib/ministry-forge-types";

function buildBurnoutWarnings(members: MinistryMember[]): string[] {
  return members
    .filter((m) => m.ministryCount > 3)
    .map(
      (m) =>
        `${m.fullName} is serving in ${m.ministryCount} ministries — consider reviewing their load.`,
    );
}

const PREVIEW_MINISTRIES: MinistryForgeEntry[] = [
  {
    id: "preview-worship",
    name: "Worship Team",
    ministryType: "worship",
    visionStatement: "Lead the congregation into an authentic encounter with God through music and song.",
    scripturalAnchor: ["Psalm 150:6", "Colossians 3:16"],
    healthScore: 8.4,
    lastHealthAssessment: "2026-04-01",
    memberCount: 12,
  },
  {
    id: "preview-men",
    name: "Men's Ministry",
    ministryType: "men",
    visionStatement: "Raise up men of integrity who lead their families, church, and community well.",
    scripturalAnchor: ["Joshua 1:9", "Proverbs 27:17"],
    healthScore: 7.1,
    lastHealthAssessment: "2026-03-15",
    memberCount: 24,
  },
  {
    id: "preview-women",
    name: "Women's Ministry",
    ministryType: "women",
    visionStatement: "Connect women across every season of life through biblical community and mutual support.",
    scripturalAnchor: ["Titus 2:3-5", "Proverbs 31:26"],
    healthScore: 8.9,
    lastHealthAssessment: "2026-04-01",
    memberCount: 31,
  },
  {
    id: "preview-marriage",
    name: "Marriage Ministry",
    ministryType: "marriage",
    visionStatement: "Strengthen marriages by connecting couples with mentors and enrichment cohorts.",
    scripturalAnchor: ["Ecclesiastes 4:12", "Ephesians 5:25"],
    healthScore: 7.6,
    lastHealthAssessment: "2026-03-20",
    memberCount: 18,
  },
  {
    id: "preview-missions",
    name: "Global Missions",
    ministryType: "missions",
    visionStatement: "Extend the love of Christ to every nation through partnership, prayer, and presence.",
    scripturalAnchor: ["Matthew 28:19-20", "Isaiah 6:8"],
    healthScore: 8.2,
    lastHealthAssessment: "2026-04-05",
    memberCount: 9,
  },
  {
    id: "preview-children",
    name: "Children's Ministry",
    ministryType: "children",
    visionStatement: "Nurture a generation of young disciples in the love and knowledge of Christ.",
    scripturalAnchor: ["Mark 10:14", "Deuteronomy 6:6-7"],
    healthScore: 7.8,
    lastHealthAssessment: "2026-03-28",
    memberCount: 15,
  },
];

const PREVIEW_MEMBERS: MinistryMember[] = [
  { profileId: "pm1", fullName: "Sarah Mitchell", role: "leader", displayTitle: "Worship Director", spiritualGifts: ["leadership", "music"], ministryCount: 2 },
  { profileId: "pm2", fullName: "James Ortega", role: "member", displayTitle: null, spiritualGifts: ["music", "teaching"], ministryCount: 1 },
  { profileId: "pm3", fullName: "Aisha Thompson", role: "member", displayTitle: null, spiritualGifts: ["service", "music"], ministryCount: 3 },
  { profileId: "pm4", fullName: "David Chen", role: "co-leader", displayTitle: "Associate Director", spiritualGifts: ["administration", "leadership"], ministryCount: 2 },
];

function buildPreviewMinistryList(): MinistryForgeListData {
  return { ministries: PREVIEW_MINISTRIES };
}

function buildPreviewMinistryDetail(ministryId: string): MinistryForgeDetail {
  const found = PREVIEW_MINISTRIES.find((m) => m.id === ministryId);
  const ministry: MinistryForgeEntry = found ?? {
    id: ministryId,
    name: "Preview Ministry",
    ministryType: null,
    visionStatement: "A place to serve, grow, and belong.",
    scripturalAnchor: ["Romans 12:6"],
    healthScore: 6.5,
    lastHealthAssessment: "2026-04-01",
    memberCount: 4,
  };

  return {
    ministry,
    members: PREVIEW_MEMBERS.slice(0, ministry.memberCount > 0 ? Math.min(4, ministry.memberCount) : 2),
    healthHistory: [
      { id: "hh1", healthScore: ministry.healthScore, assessmentDate: "2026-04-01", notes: "Quarterly review — strong momentum." },
      { id: "hh2", healthScore: Math.max(ministry.healthScore - 0.8, 5), assessmentDate: "2026-01-01", notes: "Post-holiday dip in attendance; back on track." },
      { id: "hh3", healthScore: Math.max(ministry.healthScore - 0.3, 5), assessmentDate: "2025-10-01", notes: "New leader onboarded, energy improving." },
    ],
    recentImpacts: [
      { id: "ki1", impactType: "salvation", description: "Two people made first-time commitments during Sunday worship.", occurredAt: "2026-04-06", createdByName: "Sarah Mitchell" },
      { id: "ki2", impactType: "service", description: "Ministry team served 40+ families at the community food bank.", occurredAt: "2026-03-29", createdByName: "David Chen" },
      { id: "ki3", impactType: "discipleship", description: "Completed 6-week discipleship cohort with 8 participants.", occurredAt: "2026-03-15", createdByName: "James Ortega" },
    ],
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
          count(pm.profile_id)::text as member_count
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

// ── Phase 5: Advanced Track Data Fetchers ────────────────────────────────────

export async function getChildrenTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<ChildrenTrackData> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [roomsResult, checkinsResult, bgChecksResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; name: string; age_min: number | null; age_max: number | null;
        capacity: number; target_ratio: string; is_active: boolean;
      }>(
        `select id, name, age_min, age_max, capacity, target_ratio, is_active
         from public.children_rooms
         where ministry_id = $1 and church_id = $2
         order by age_min asc nulls last`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; room_id: string; room_name: string; child_name: string;
        guardian_name: string | null; checked_in_at: string; checked_out_at: string | null;
        leader_count: number; service_date: string;
      }>(
        `select cc.id, cc.room_id, cr.name as room_name, cc.child_name,
                cc.guardian_name, cc.checked_in_at::text, cc.checked_out_at::text,
                cc.leader_count, cc.service_date::text
         from public.children_checkins cc
         join public.children_rooms cr on cr.id = cc.room_id
         where cc.church_id = $1 and cr.ministry_id = $2
         order by cc.service_date desc, cc.checked_in_at desc
         limit 50`,
        [churchId, ministryId],
      ),
      queryTenantLocalDb<{ id: string; full_name: string; safety_clearance_date: string | null }>(
        `select p.id, p.full_name, p.safety_clearance_date
         from public.profiles p
         join public.profile_ministries pm on pm.profile_id = p.id
         join public.ministries m on m.id = pm.ministry_id
         where m.id = $1 and p.church_id = $2
           and pm.role in ('leader', 'assistant_leader')`,
        [ministryId, churchId],
      ),
    ]);

    const rooms: ChildrenRoom[] = roomsResult.rows.map((r) => ({
      id: r.id, name: r.name, ageMin: r.age_min, ageMax: r.age_max,
      capacity: r.capacity, targetRatio: parseFloat(r.target_ratio), isActive: r.is_active,
    }));

    const recentCheckins: ChildrenCheckin[] = checkinsResult.rows.map((r) => ({
      id: r.id, roomId: r.room_id, roomName: r.room_name, childName: r.child_name,
      guardianName: r.guardian_name, checkedInAt: r.checked_in_at,
      checkedOutAt: r.checked_out_at, leaderCount: r.leader_count, serviceDate: r.service_date,
    }));

    // Build safety snapshot from today's check-ins
    const todayStr = new Date().toISOString().slice(0, 10);
    const safetySnapshot: ChildrenRoomSafety[] = rooms.map((room) => {
      const todayCheckins = recentCheckins.filter(
        (c) => c.roomId === room.id && c.serviceDate === todayStr && !c.checkedOutAt,
      );
      const currentChildren = todayCheckins.length;
      const currentLeaders = todayCheckins[0]?.leaderCount ?? 0;
      const actualRatio = currentLeaders > 0 ? currentChildren / currentLeaders : currentChildren;
      let ratioStatus: ChildrenRoomSafety["ratioStatus"] = "safe";
      if (actualRatio > room.targetRatio) ratioStatus = "alert";
      else if (actualRatio > room.targetRatio * 0.9) ratioStatus = "warning";
      return {
        roomId: room.id, roomName: room.name, capacity: room.capacity,
        targetRatio: room.targetRatio, currentChildren, currentLeaders,
        actualRatio: Math.round(actualRatio * 10) / 10, ratioStatus,
      };
    });

    const today = new Date();
    const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const backgroundChecksDue = bgChecksResult.rows
      .filter((r) => !r.safety_clearance_date || r.safety_clearance_date <= thirtyDaysOut)
      .map((r) => ({
        profileId: r.id,
        name: r.full_name,
        clearanceDate: r.safety_clearance_date,
      }));

    return { rooms, recentCheckins, safetySnapshot, backgroundChecksDue };
  }

  // Supabase path
  const supabase = await createTenantServerClient();
  const [{ data: roomsData }, { data: checkinsData }, { data: bgData }] = await Promise.all([
    supabase.from("children_rooms").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("age_min"),
    supabase.from("children_checkins").select("*, room:children_rooms(name)").eq("church_id", churchId).order("service_date", { ascending: false }).limit(50),
    supabase.from("profiles").select("id, full_name, safety_clearance_date").eq("church_id", churchId),
  ]);

  const rooms: ChildrenRoom[] = (roomsData ?? []).map((r) => ({
    id: r.id, name: r.name, ageMin: r.age_min ?? null, ageMax: r.age_max ?? null,
    capacity: r.capacity, targetRatio: parseFloat(String(r.target_ratio)), isActive: r.is_active,
  }));
  const recentCheckins: ChildrenCheckin[] = (checkinsData ?? []).map((r) => ({
    id: r.id, roomId: r.room_id, roomName: (r.room as { name: string } | null)?.name ?? "",
    childName: r.child_name, guardianName: r.guardian_name ?? null,
    checkedInAt: r.checked_in_at, checkedOutAt: r.checked_out_at ?? null,
    leaderCount: r.leader_count, serviceDate: r.service_date,
  }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const safetySnapshot: ChildrenRoomSafety[] = rooms.map((room) => {
    const todayCheckins = recentCheckins.filter(
      (c) => c.roomId === room.id && c.serviceDate === todayStr && !c.checkedOutAt,
    );
    const currentChildren = todayCheckins.length;
    const currentLeaders = todayCheckins[0]?.leaderCount ?? 0;
    const actualRatio = currentLeaders > 0 ? currentChildren / currentLeaders : currentChildren;
    let ratioStatus: ChildrenRoomSafety["ratioStatus"] = "safe";
    if (actualRatio > room.targetRatio) ratioStatus = "alert";
    else if (actualRatio > room.targetRatio * 0.9) ratioStatus = "warning";
    return {
      roomId: room.id, roomName: room.name, capacity: room.capacity,
      targetRatio: room.targetRatio, currentChildren, currentLeaders,
      actualRatio: Math.round(actualRatio * 10) / 10, ratioStatus,
    };
  });

  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const backgroundChecksDue = (bgData ?? [])
    .filter((r) => !r.safety_clearance_date || r.safety_clearance_date <= thirtyDaysOut)
    .map((r) => ({
      profileId: r.id,
      name: r.full_name ?? "",
      clearanceDate: r.safety_clearance_date ?? null,
    }));

  return { rooms, recentCheckins, safetySnapshot, backgroundChecksDue };
}

export async function getYouthTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<YouthTrackData> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [milestonesResult, trackingResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; name: string; description: string | null;
        milestone_order: number; is_required: boolean;
      }>(
        `select id, name, description, milestone_order, is_required
         from public.youth_milestones
         where ministry_id = $1 and church_id = $2
         order by milestone_order`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        profile_id: string; full_name: string; graduation_year: number | null;
        milestone_id: string; completed_at: string | null;
      }>(
        `select ygt.profile_id,
                p.full_name,
                ygt.graduation_year,
                ygt.milestone_id,
                ygt.completed_at::text
         from public.youth_graduation_tracking ygt
         join public.profiles p on p.id = ygt.profile_id
         where ygt.ministry_id = $1 and ygt.church_id = $2`,
        [ministryId, churchId],
      ),
    ]);

    const milestones: YouthMilestone[] = milestonesResult.rows.map((r) => ({
      id: r.id, name: r.name, description: r.description,
      milestoneOrder: r.milestone_order, isRequired: r.is_required,
    }));

    const requiredMilestones = milestones.filter((m) => m.isRequired);
    const studentMap = new Map<string, YouthStudent>();
    for (const row of trackingResult.rows) {
      if (!studentMap.has(row.profile_id)) {
        studentMap.set(row.profile_id, {
          profileId: row.profile_id, name: row.full_name,
          graduationYear: row.graduation_year,
          completedMilestoneIds: [], completedCount: 0,
          totalRequired: requiredMilestones.length,
          readinessPercent: 0, alertLevel: "on_track",
        });
      }
      const student = studentMap.get(row.profile_id)!;
      if (row.completed_at) {
        student.completedMilestoneIds.push(row.milestone_id);
        student.completedCount++;
      }
    }
    const currentYear = new Date().getFullYear();
    const students: YouthStudent[] = Array.from(studentMap.values()).map((s) => {
      const readinessPercent = s.totalRequired > 0
        ? Math.round((s.completedMilestoneIds.filter((id) =>
            requiredMilestones.some((m) => m.id === id)
          ).length / s.totalRequired) * 100)
        : 100;
      const yearsLeft = s.graduationYear ? s.graduationYear - currentYear : null;
      let alertLevel: YouthStudent["alertLevel"] = "on_track";
      if (readinessPercent < 50 && yearsLeft !== null && yearsLeft <= 1) alertLevel = "critical";
      else if (readinessPercent < 75 && yearsLeft !== null && yearsLeft <= 2) alertLevel = "at_risk";
      return { ...s, readinessPercent, alertLevel };
    });

    return { milestones, students };
  }

  const supabase = await createTenantServerClient();
  const [{ data: milestonesData }, { data: trackingData }] = await Promise.all([
    supabase.from("youth_milestones").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("milestone_order"),
    supabase.from("youth_graduation_tracking").select("*, profile:profiles(full_name)").eq("ministry_id", ministryId).eq("church_id", churchId),
  ]);

  const milestones: YouthMilestone[] = (milestonesData ?? []).map((r) => ({
    id: r.id, name: r.name, description: r.description ?? null,
    milestoneOrder: r.milestone_order, isRequired: r.is_required,
  }));
  const requiredMilestones = milestones.filter((m) => m.isRequired);
  const studentMap = new Map<string, YouthStudent>();
  for (const row of (trackingData ?? [])) {
    const prof = row.profile as { full_name: string } | null;
    if (!studentMap.has(row.profile_id)) {
      studentMap.set(row.profile_id, {
        profileId: row.profile_id,
        name: prof?.full_name ?? "Unknown",
        graduationYear: row.graduation_year ?? null,
        completedMilestoneIds: [], completedCount: 0,
        totalRequired: requiredMilestones.length, readinessPercent: 0, alertLevel: "on_track",
      });
    }
    const student = studentMap.get(row.profile_id)!;
    if (row.completed_at) {
      student.completedMilestoneIds.push(row.milestone_id);
      student.completedCount++;
    }
  }
  const currentYear = new Date().getFullYear();
  const students: YouthStudent[] = Array.from(studentMap.values()).map((s) => {
    const readinessPercent = s.totalRequired > 0
      ? Math.round((s.completedMilestoneIds.filter((id) =>
          requiredMilestones.some((m) => m.id === id)
        ).length / s.totalRequired) * 100)
      : 100;
    const yearsLeft = s.graduationYear ? s.graduationYear - currentYear : null;
    let alertLevel: YouthStudent["alertLevel"] = "on_track";
    if (readinessPercent < 50 && yearsLeft !== null && yearsLeft <= 1) alertLevel = "critical";
    else if (readinessPercent < 75 && yearsLeft !== null && yearsLeft <= 2) alertLevel = "at_risk";
    return { ...s, readinessPercent, alertLevel };
  });
  return { milestones, students };
}

export async function getYoungAdultTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<YoungAdultTrackData> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string; mentor_id: string; mentor_name: string;
      mentee_id: string; mentee_name: string;
      industry: string | null; focus_area: string | null;
      status: string; started_at: string | null;
    }>(
      `select yacm.id,
              yacm.mentor_id, pm.full_name as mentor_name,
              yacm.mentee_id, pe.full_name as mentee_name,
              yacm.industry, yacm.focus_area, yacm.status, yacm.started_at::text
       from public.young_adult_career_mentorships yacm
       join public.profiles pm on pm.id = yacm.mentor_id
       join public.profiles pe on pe.id = yacm.mentee_id
       where yacm.ministry_id = $1 and yacm.church_id = $2
       order by yacm.started_at desc`,
      [ministryId, churchId],
    );

    const careerMentorships: CareerMentorship[] = result.rows.map((r) => ({
      id: r.id, mentorId: r.mentor_id, mentorName: r.mentor_name,
      menteeId: r.mentee_id, menteeName: r.mentee_name,
      industry: r.industry, focusArea: r.focus_area,
      status: r.status, startedAt: r.started_at,
    }));

    const seekingMentors = careerMentorships
      .filter((m) => m.status === "seeking")
      .map((m) => ({ profileId: m.menteeId, name: m.menteeName, industry: m.industry }));

    return { careerMentorships, seekingMentors };
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("young_adult_career_mentorships")
    .select("*, mentor:profiles!mentor_id(full_name), mentee:profiles!mentee_id(full_name)")
    .eq("ministry_id", ministryId)
    .eq("church_id", churchId)
    .order("started_at", { ascending: false });

  const careerMentorships: CareerMentorship[] = (data ?? []).map((r) => {
    const mentor = r.mentor as { full_name: string } | null;
    const mentee = r.mentee as { full_name: string } | null;
    return {
      id: r.id,
      mentorId: r.mentor_id, mentorName: mentor?.full_name ?? "Unknown",
      menteeId: r.mentee_id, menteeName: mentee?.full_name ?? "Unknown",
      industry: r.industry ?? null, focusArea: r.focus_area ?? null,
      status: r.status, startedAt: r.started_at ?? null,
    };
  });
  const seekingMentors = careerMentorships
    .filter((m) => m.status === "seeking")
    .map((m) => ({ profileId: m.menteeId, name: m.menteeName, industry: m.industry }));

  return { careerMentorships, seekingMentors };
}

export async function getEducationTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<EducationTrackData> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [coursesResult, enrollmentsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; title: string; curriculum_area: string; description: string | null;
        duration_weeks: number | null; is_active: boolean; course_order: number;
        enrolled_count: number; completed_count: number;
      }>(
        `select ec.id, ec.title, ec.curriculum_area, ec.description,
                ec.duration_weeks, ec.is_active, ec.course_order,
                count(ee.id)::int as enrolled_count,
                count(ee.completed_at)::int as completed_count
         from public.education_courses ec
         left join public.education_enrollments ee on ee.course_id = ec.id
         where ec.ministry_id = $1 and ec.church_id = $2
         group by ec.id
         order by ec.course_order`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        profile_id: string; full_name: string;
        course_id: string; curriculum_area: string; completed_at: string | null;
      }>(
        `select ee.profile_id,
                p.full_name,
                ee.course_id, ec.curriculum_area, ee.completed_at::text
         from public.education_enrollments ee
         join public.profiles p on p.id = ee.profile_id
         join public.education_courses ec on ec.id = ee.course_id
         where ec.ministry_id = $1 and ee.church_id = $2`,
        [ministryId, churchId],
      ),
    ]);

    const courses: EducationCourse[] = coursesResult.rows.map((r) => ({
      id: r.id, title: r.title, curriculumArea: r.curriculum_area,
      description: r.description, durationWeeks: r.duration_weeks,
      isActive: r.is_active, courseOrder: r.course_order,
      enrolledCount: r.enrolled_count, completedCount: r.completed_count,
    }));

    const totalCourses = courses.length;
    const profileMap = new Map<string, MemberDoctrinalProgress>();
    for (const row of enrollmentsResult.rows) {
      if (!profileMap.has(row.profile_id)) {
        profileMap.set(row.profile_id, {
          profileId: row.profile_id, name: row.full_name,
          completedCourseIds: [], completedAreas: [],
          totalCourses, completedCount: 0, coveragePercent: 0,
        });
      }
      const prog = profileMap.get(row.profile_id)!;
      if (row.completed_at) {
        prog.completedCourseIds.push(row.course_id);
        prog.completedCount++;
        if (!prog.completedAreas.includes(row.curriculum_area)) {
          prog.completedAreas.push(row.curriculum_area);
        }
      }
    }
    const allAreas = [...new Set(courses.map((c) => c.curriculumArea))];
    const memberProgress: MemberDoctrinalProgress[] = Array.from(profileMap.values()).map((p) => ({
      ...p,
      coveragePercent: allAreas.length > 0
        ? Math.round((p.completedAreas.length / allAreas.length) * 100)
        : 0,
    }));

    return { courses, memberProgress };
  }

  const supabase = await createTenantServerClient();
  const [{ data: coursesData }, { data: enrollmentsData }] = await Promise.all([
    supabase.from("education_courses").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("course_order"),
    supabase.from("education_enrollments").select("*, course:education_courses(curriculum_area), profile:profiles(full_name)").eq("church_id", churchId),
  ]);

  const courses: EducationCourse[] = (coursesData ?? []).map((r) => ({
    id: r.id, title: r.title, curriculumArea: r.curriculum_area,
    description: r.description ?? null, durationWeeks: r.duration_weeks ?? null,
    isActive: r.is_active, courseOrder: r.course_order,
    enrolledCount: 0, completedCount: 0,
  }));
  // Count enrollments per course
  for (const enr of (enrollmentsData ?? [])) {
    const course = courses.find((c) => c.id === enr.course_id);
    if (course) {
      course.enrolledCount++;
      if (enr.completed_at) course.completedCount++;
    }
  }

  const totalCourses = courses.length;
  const profileMap = new Map<string, MemberDoctrinalProgress>();
  for (const row of (enrollmentsData ?? [])) {
    const prof = row.profile as { full_name: string } | null;
    const course = row.course as { curriculum_area: string } | null;
    if (!profileMap.has(row.profile_id)) {
      profileMap.set(row.profile_id, {
        profileId: row.profile_id,
        name: prof?.full_name ?? "Unknown",
        completedCourseIds: [], completedAreas: [],
        totalCourses, completedCount: 0, coveragePercent: 0,
      });
    }
    const prog = profileMap.get(row.profile_id)!;
    if (row.completed_at) {
      prog.completedCourseIds.push(row.course_id);
      prog.completedCount++;
      const area = course?.curriculum_area;
      if (area && !prog.completedAreas.includes(area)) prog.completedAreas.push(area);
    }
  }
  const allAreas = [...new Set(courses.map((c) => c.curriculumArea))];
  const memberProgress: MemberDoctrinalProgress[] = Array.from(profileMap.values()).map((p) => ({
    ...p,
    coveragePercent: allAreas.length > 0
      ? Math.round((p.completedAreas.length / allAreas.length) * 100)
      : 0,
  }));

  return { courses, memberProgress };
}

export async function getOutreachTrackData(
  session: ChurchAppSession,
  ministryId: string,
): Promise<OutreachTrackData> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const [eventsResult, zonesResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string; name: string; event_date: string; location: string | null;
        zone_name: string | null; volunteer_count: number; people_served: number; status: string;
      }>(
        `select id, name, event_date::text, location, zone_name,
                volunteer_count, people_served, status
         from public.outreach_events
         where ministry_id = $1 and church_id = $2
         order by event_date desc
         limit 50`,
        [ministryId, churchId],
      ),
      queryTenantLocalDb<{
        id: string; zone_name: string; description: string | null;
        total_events: number; total_volunteers: number; total_served: number;
        last_event_date: string | null; coverage_level: string;
      }>(
        `select id, zone_name, description, total_events, total_volunteers,
                total_served, last_event_date::text, coverage_level
         from public.outreach_zones
         where ministry_id = $1 and church_id = $2
         order by total_served desc`,
        [ministryId, churchId],
      ),
    ]);

    const events: OutreachEvent[] = eventsResult.rows.map((r) => ({
      id: r.id, name: r.name, eventDate: r.event_date, location: r.location,
      zoneName: r.zone_name, volunteerCount: r.volunteer_count,
      peopleServed: r.people_served, status: r.status,
    }));
    const zones: OutreachZone[] = zonesResult.rows.map((r) => ({
      id: r.id, zoneName: r.zone_name, description: r.description,
      totalEvents: r.total_events, totalVolunteers: r.total_volunteers,
      totalServed: r.total_served, lastEventDate: r.last_event_date,
      coverageLevel: r.coverage_level as OutreachZone["coverageLevel"],
    }));
    const totalVolunteerHours = events.reduce((sum, e) => sum + e.volunteerCount * 3, 0); // estimate 3h/volunteer
    const totalPeopleServed = events.reduce((sum, e) => sum + e.peopleServed, 0);
    return { events, zones, totalVolunteerHours, totalPeopleServed };
  }

  const supabase = await createTenantServerClient();
  const [{ data: eventsData }, { data: zonesData }] = await Promise.all([
    supabase.from("outreach_events").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("event_date", { ascending: false }).limit(50),
    supabase.from("outreach_zones").select("*").eq("ministry_id", ministryId).eq("church_id", churchId).order("total_served", { ascending: false }),
  ]);

  const events: OutreachEvent[] = (eventsData ?? []).map((r) => ({
    id: r.id, name: r.name, eventDate: r.event_date, location: r.location ?? null,
    zoneName: r.zone_name ?? null, volunteerCount: r.volunteer_count,
    peopleServed: r.people_served, status: r.status,
  }));
  const zones: OutreachZone[] = (zonesData ?? []).map((r) => ({
    id: r.id, zoneName: r.zone_name, description: r.description ?? null,
    totalEvents: r.total_events, totalVolunteers: r.total_volunteers,
    totalServed: r.total_served, lastEventDate: r.last_event_date ?? null,
    coverageLevel: r.coverage_level as OutreachZone["coverageLevel"],
  }));
  const totalVolunteerHours = events.reduce((sum, e) => sum + e.volunteerCount * 3, 0);
  const totalPeopleServed = events.reduce((sum, e) => sum + e.peopleServed, 0);
  return { events, zones, totalVolunteerHours, totalPeopleServed };
}

export async function getDiscipleshipVelocity(
  session: ChurchAppSession,
): Promise<DiscipleshipVelocity> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      leader_count: string; avg_days_to_leader: string | null;
      min_days: number | null; max_days: number | null;
    }>(
      `select leader_count, avg_days_to_leader, min_days, max_days
       from public.discipleship_velocity
       where church_id = $1`,
      [churchId],
    );
    const row = result.rows[0];
    return {
      leaderCount: row ? parseInt(row.leader_count) : 0,
      avgDaysToLeader: row?.avg_days_to_leader ? parseFloat(row.avg_days_to_leader) : null,
      minDays: row?.min_days ?? null, maxDays: row?.max_days ?? null,
    };
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase.from("discipleship_velocity").select("*").eq("church_id", churchId).single();
  return {
    leaderCount: data ? Number(data.leader_count) : 0,
    avgDaysToLeader: data?.avg_days_to_leader ? Number(data.avg_days_to_leader) : null,
    minDays: data?.min_days ?? null, maxDays: data?.max_days ?? null,
  };
}

export async function getBurnoutCandidates(
  session: ChurchAppSession,
): Promise<BurnoutCandidate[]> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      profile_id: string; full_name: string;
      distinct_track_count: string; active_tracks: string[];
    }>(
      `select profile_id, full_name, distinct_track_count, active_tracks
       from public.burnout_category_counts
       where church_id = $1 and distinct_track_count > 3
       order by distinct_track_count desc`,
      [churchId],
    );
    return result.rows.map((r) => ({
      profileId: r.profile_id, fullName: r.full_name,
      distinctTrackCount: parseInt(r.distinct_track_count),
      activeTracks: r.active_tracks,
    }));
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("burnout_category_counts")
    .select("*")
    .eq("church_id", churchId)
    .gt("distinct_track_count", 3)
    .order("distinct_track_count", { ascending: false });

  return (data ?? []).map((r) => ({
    profileId: r.profile_id, fullName: r.full_name,
    distinctTrackCount: Number(r.distinct_track_count),
    activeTracks: (r.active_tracks as string[]) ?? [],
  }));
}
