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
  email: string | null;
  phone: string | null;
  address: string | null;
  displayTitle: string | null;
  roleId: PortalRoleId;
  isPastoral: boolean;
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

export type MemberPortalData = {
  profile: MemberPortalProfile | null;
  ministries: MemberPortalMinistry[];
  upcomingEvents: MemberPortalEvent[];
};

function buildPreviewMemberPortalData(session: ChurchAppSession): MemberPortalData {
  const role = getPortalRole("member");

  return {
    profile: {
      id: session.userId,
      fullName: session.profile.name,
      email: session.profile.email,
      phone: null,
      address: null,
      displayTitle: session.profile.title,
      roleId: "member",
      isPastoral: false,
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

export async function getMemberPortalData(
  session: ChurchAppSession,
): Promise<MemberPortalData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMemberPortalData(session);
  }

  if (shouldUseLocalTenantFallback()) {
    const [profileResult, ministriesResult, eventsResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        display_title: string | null;
        role: string | null;
        is_pastoral: boolean | null;
      }>(
        `
          select
            id,
            full_name,
            email,
            phone,
            address,
            display_title,
            role,
            is_pastoral
          from public.profiles
          where user_id = $1
            and church_id = $2
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
    ]);

    const profileRow = profileResult.rows[0];

    return {
      profile: profileRow
        ? {
            id: profileRow.id,
            fullName: profileRow.full_name ?? session.profile.name,
            email: profileRow.email,
            phone: profileRow.phone,
            address: profileRow.address,
            displayTitle: profileRow.display_title,
            roleId: mapProfileRole(profileRow.role),
            isPastoral: Boolean(profileRow.is_pastoral),
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
    };
  }

  const supabase = await createTenantServerClient();
  const [profileResult, ministriesResult, eventsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, address, display_title, role, is_pastoral",
      )
      .eq("user_id", session.userId)
      .eq("church_id", session.appContext.church.id)
      .maybeSingle(),
    supabase
      .from("profile_ministries")
      .select("ministries(id, name, description), profiles!inner(user_id, church_id)")
      .eq("profiles.user_id", session.userId)
      .eq("profiles.church_id", session.appContext.church.id),
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
  ]);

  const profileRow = profileResult.data;

  return {
    profile: profileRow
      ? {
          id: profileRow.id,
          fullName: profileRow.full_name ?? session.profile.name,
          email: profileRow.email,
          phone: profileRow.phone,
          address: profileRow.address,
          displayTitle: profileRow.display_title,
          roleId: mapProfileRole(profileRow.role),
          isPastoral: Boolean(profileRow.is_pastoral),
        }
      : null,
    ministries:
      ministriesResult.data?.flatMap((row) => {
        const ministry = Array.isArray(row.ministries)
          ? row.ministries[0]
          : row.ministries;

        if (!ministry || typeof ministry !== "object") {
          return [];
        }

        const record = ministry as Record<string, unknown>;

        if (typeof record.id !== "string" || typeof record.name !== "string") {
          return [];
        }

        return [
          {
            id: record.id,
            name: record.name,
            description:
              typeof record.description === "string"
                ? record.description
                : null,
          },
        ];
      }) ?? [],
    upcomingEvents:
      eventsResult.data?.flatMap((row) => {
        const ministry = Array.isArray(row.ministries)
          ? row.ministries[0]
          : row.ministries;

        return [
          {
            id: row.id,
            title: row.title,
            description: row.description,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            category: row.category,
            visibility: row.visibility,
            ministryName:
              ministry && typeof ministry === "object" && "name" in ministry
                ? String((ministry as Record<string, unknown>).name)
                : null,
          },
        ];
      }) ?? [],
  };
}
