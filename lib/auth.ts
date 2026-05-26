import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import {
  getRoleHomePath,
  isChurchRole,
  isControlPlaneRole,
  type PortalRoleId,
} from "@/lib/portal";
import { extractRuntimeChurchId } from "@/lib/control-plane-registry";
import {
  getPreferredSupabaseSurfaceForRedirect,
  getSupabaseSurfaceFallbackOrder,
  hasSupabaseEnvForSurface,
  type SupabaseSurface,
} from "@/lib/supabase/config";
import {
  createControlPlaneServerClient,
  queryControlPlaneLocalDb,
  shouldUseLocalControlPlaneFallback,
} from "@/lib/supabase/control-plane";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export const sessionCookieName = "churchcore_ops_session";
export const appContextCookieName = "churchcore_ops_app_context";

export type ChurchRoleId = Exclude<PortalRoleId, "super-admin">;

export type DemoProfile = {
  id: string;
  name: string;
  email: string;
  title: string;
  roleId: PortalRoleId;
  defaultPath: string;
  focus: string;
};

export type ChurchSummary = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

export type ChurchMembership = {
  church: ChurchSummary;
  roleId: ChurchRoleId;
};

export type TenantViewTarget = ChurchSummary & {
  tenantId: string;
  connectionStatus: string | null;
  runtimeChurchId: string | null;
};

type HydratedProfileRecord = {
  id: string;
  userId: string;
  churchId: string | null;
  fullName: string | null;
  email: string | null;
  role: string | null;
  displayTitle: string | null;
  isPastoral: boolean;
  church: ChurchSummary | null;
};

export type ControlAppContext = {
  kind: "control";
  homePath: "/control";
};

export type ChurchAppContext = {
  kind: "church";
  source: "membership" | "impersonation" | "fallback";
  church: ChurchSummary;
  roleId: ChurchRoleId;
  homePath: string;
};

export type AppContext = ControlAppContext | ChurchAppContext;

type StoredAppContextSelection =
  | {
      kind: "control";
    }
  | {
      kind: "church";
      churchId: string;
      roleId: ChurchRoleId;
      source: "membership" | "impersonation";
    };

export type AuthSession = {
  source: "preview" | "supabase";
  profile: DemoProfile;
  userId: string;
  appContext: AppContext;
  homePath: string;
  canAccessControl: boolean;
  memberships: ChurchMembership[];
  tenantViews: TenantViewTarget[];
};

export type ChurchAppSession = AuthSession & {
  appContext: ChurchAppContext;
};

export const demoProfiles: DemoProfile[] = [
  {
    id: "sarah-platform",
    name: "Sarah Bennett",
    email: "sarah@churchcoreops.app",
    title: "Platform SuperAdmin",
    roleId: "super-admin",
    defaultPath: "/control",
    focus: "Tenant onboarding, billing review, and platform oversight.",
  },
  {
    id: "david-admin",
    name: "David Brooks",
    email: "david@graceharbor.church",
    title: "Church Administrator",
    roleId: "church-admin",
    defaultPath: "/app/church-admin",
    focus: "Weekend operations, giving reconciliation, and member follow-up.",
  },
  {
    id: "olivia-secretary",
    name: "Olivia Reed",
    email: "olivia@graceharbor.church",
    title: "Secretary / Office Admin",
    roleId: "secretary",
    defaultPath: "/app/secretary",
    focus: "Daily Desk calls, office notes, visit scheduling, and request follow-up.",
  },
  {
    id: "miriam-pastor",
    name: "Miriam Cole",
    email: "miriam@newcity.church",
    title: "Pastor / Elder",
    roleId: "pastor",
    defaultPath: "/app/pastor",
    focus: "Sermon prep, prayer review, and pastoral care coordination.",
  },
  {
    id: "elijah-leader",
    name: "Elijah Ross",
    email: "elijah@renew.church",
    title: "Ministry Leader",
    roleId: "ministry-leader",
    defaultPath: "/app/ministry-leader",
    focus: "Volunteer load, event readiness, and follow-up execution.",
  },
  {
    id: "naomi-member",
    name: "Naomi Park",
    email: "naomi@communitymail.com",
    title: "Volunteer / Member",
    roleId: "member",
    defaultPath: "/app/member",
    focus: "Personal schedule, serving commitments, and prayer participation.",
  },
];

const previewChurches: ChurchSummary[] = [
  {
    id: "grace-harbor",
    name: "Grace Harbor Church",
    slug: "grace-harbor",
    timezone: "America/Chicago",
  },
  {
    id: "new-city",
    name: "New City Chapel",
    slug: "new-city",
    timezone: "America/New_York",
  },
  {
    id: "renew-community",
    name: "Renew Community",
    slug: "renew-community",
    timezone: "America/Denver",
  },
];

const previewMembershipsByProfileId: Record<string, ChurchMembership[]> = {
  "david-admin": [
    {
      church: previewChurches[0],
      roleId: "church-admin",
    },
  ],
  "olivia-secretary": [
    {
      church: previewChurches[0],
      roleId: "secretary",
    },
  ],
  "miriam-pastor": [
    {
      church: previewChurches[1],
      roleId: "pastor",
    },
  ],
  "elijah-leader": [
    {
      church: previewChurches[2],
      roleId: "ministry-leader",
    },
  ],
  "naomi-member": [
    {
      church: previewChurches[0],
      roleId: "member",
    },
  ],
};

export function getDemoProfile(profileId: string) {
  return demoProfiles.find((profile) => profile.id === profileId);
}

function getDefaultProfileTemplate(roleId: PortalRoleId) {
  return (
    demoProfiles.find((profile) => profile.roleId === roleId) ?? demoProfiles[1]
  );
}

function isChurchRoleId(roleId: PortalRoleId): roleId is ChurchRoleId {
  return roleId !== "super-admin";
}

function mapSupabaseRole(rawRole: unknown): PortalRoleId {
  switch (rawRole) {
    case "super_admin":
    case "super-admin":
      return "super-admin";
    case "pastor_elder":
    case "pastor":
    case "elder":
      return "pastor";
    case "ministry_admin":
    case "ministry_admin_leader":
    case "ministry-leader":
    case "ministry_leader":
      return "ministry-leader";
    case "member":
    case "volunteer":
    case "member_volunteer":
      return "member";
    case "secretary":
    case "office_admin":
    case "office-admin":
    case "church_secretary":
      return "secretary";
    case "church_admin":
    case "church-admin":
    default:
      return "church-admin";
  }
}

function normalizeChurchSummary(rawChurch: unknown): ChurchSummary | null {
  if (!rawChurch || typeof rawChurch !== "object") {
    return null;
  }

  const record = rawChurch as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.slug !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    timezone:
      typeof record.timezone === "string"
        ? record.timezone
        : "America/New_York",
  };
}

function normalizeMembershipRows(rows: unknown[] | null | undefined) {
  if (!rows) {
    return [];
  }

  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") {
      return [];
    }

    const record = row as Record<string, unknown>;
    const church =
      normalizeChurchSummary(record.churches) ??
      (Array.isArray(record.churches)
        ? normalizeChurchSummary(record.churches[0])
        : null);
    const roleId = mapSupabaseRole(record.role);

    if (!church || !isChurchRoleId(roleId)) {
      return [];
    }

    return [
      {
        church,
        roleId,
      } satisfies ChurchMembership,
    ];
  });
}

function normalizeHydratedProfileRow(
  row: unknown,
): HydratedProfileRecord | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;

  if (typeof record.id !== "string" || typeof record.user_id !== "string") {
    return null;
  }

  const church =
    normalizeChurchSummary(record.churches) ??
    (Array.isArray(record.churches)
      ? normalizeChurchSummary(record.churches[0])
      : null);

  return {
    id: record.id,
    userId: record.user_id,
    churchId: typeof record.church_id === "string" ? record.church_id : null,
    fullName: typeof record.full_name === "string" ? record.full_name : null,
    email: typeof record.email === "string" ? record.email : null,
    role: typeof record.role === "string" ? record.role : null,
    displayTitle:
      typeof record.display_title === "string" ? record.display_title : null,
    isPastoral: Boolean(record.is_pastoral),
    church,
  };
}

function normalizeMembershipRowsFromLocalDb(
  rows: Array<{
    church_id: string;
    role: string;
    church_name: string;
    church_slug: string;
    church_timezone: string;
  }>,
) {
  return rows.flatMap((row) => {
    const roleId = mapSupabaseRole(row.role);

    if (!isChurchRoleId(roleId)) {
      return [];
    }

    return [
      {
        church: {
          id: row.church_id,
          name: row.church_name,
          slug: row.church_slug,
          timezone: row.church_timezone,
        },
        roleId,
      } satisfies ChurchMembership,
    ];
  });
}

async function loadSupabaseAppDataFromLocalDb(userId: string) {
  const [membershipsResult, profileResult] = await Promise.all([
    queryTenantLocalDb<{
      church_id: string;
      role: string;
      church_name: string;
      church_slug: string;
      church_timezone: string;
    }>(
      `
        select
          membership.church_id,
          membership.role::text as role,
          church.name as church_name,
          church.slug::text as church_slug,
          church.timezone as church_timezone
        from public.church_memberships membership
        join public.churches church
          on church.id = membership.church_id
        where membership.user_id = $1
          and membership.is_active = true
        order by church.name
      `,
      [userId],
    ),
    queryTenantLocalDb<{
      id: string;
      user_id: string;
      church_id: string | null;
      full_name: string | null;
      email: string | null;
      role: string | null;
      display_title: string | null;
      is_pastoral: boolean | null;
      church_name: string | null;
      church_slug: string | null;
      church_timezone: string | null;
    }>(
      `
        select
          profile.id,
          profile.user_id,
          profile.church_id,
          profile.full_name,
          profile.email,
          profile.role,
          profile.display_title,
          profile.is_pastoral,
          church.name as church_name,
          church.slug::text as church_slug,
          church.timezone as church_timezone
        from public.profiles profile
        left join public.churches church
          on church.id = profile.church_id
        where profile.user_id = $1
        limit 1
      `,
      [userId],
    ),
  ]);

  let platformAdminRows: Array<{ user_id: string }> = [];
  try {
    const platformAdminResult = await queryControlPlaneLocalDb<{ user_id: string }>(
      `
        select user_id
        from public.platform_admins
        where user_id = $1
        limit 1
      `,
      [userId],
    );
    platformAdminRows = platformAdminResult.rows;
  } catch {
    platformAdminRows = [];
  }

  let tenantRows: Array<{
    tenant_id: string;
    name: string;
    slug: string;
    timezone: string;
    connection_status: string | null;
    metadata: Record<string, unknown> | null;
  }> = [];
  if (platformAdminRows.length > 0) {
    try {
      const tenantResult = await queryControlPlaneLocalDb<{
        tenant_id: string;
        name: string;
        slug: string;
        timezone: string;
        connection_status: string | null;
        metadata: Record<string, unknown> | null;
      }>(
        `
          select
            tenant.id as tenant_id,
            tenant.name,
            tenant.slug::text as slug,
            tenant.timezone,
            connection.connection_status::text as connection_status,
            connection.metadata
          from public.tenants tenant
          left join public.tenant_connections connection
            on connection.tenant_id = tenant.id
          order by tenant.name
        `,
      );
      tenantRows = tenantResult.rows;
    } catch {
      tenantRows = [];
    }
  }

  let memberships = normalizeMembershipRowsFromLocalDb(membershipsResult.rows);
  const canAccessControl = platformAdminRows.length > 0;
  const profileRow = profileResult.rows[0];
  const hydratedProfile: HydratedProfileRecord | null = profileRow
    ? {
        id: profileRow.id,
        userId: profileRow.user_id,
        churchId: profileRow.church_id,
        fullName: profileRow.full_name,
        email: profileRow.email,
        role: profileRow.role,
        displayTitle: profileRow.display_title,
        isPastoral: Boolean(profileRow.is_pastoral),
        church:
          profileRow.church_id &&
          profileRow.church_name &&
          profileRow.church_slug &&
          profileRow.church_timezone
            ? {
                id: profileRow.church_id,
                name: profileRow.church_name,
                slug: profileRow.church_slug,
                timezone: profileRow.church_timezone,
              }
            : null,
      }
    : null;

  const hydratedProfileRoleId =
    hydratedProfile?.role ? mapSupabaseRole(hydratedProfile.role) : null;

  if (
    memberships.length === 0 &&
    hydratedProfile?.church &&
    hydratedProfileRoleId &&
    isChurchRoleId(hydratedProfileRoleId)
  ) {
    memberships = [
      {
        church: hydratedProfile.church,
        roleId: hydratedProfileRoleId,
      },
    ];
  }

  const tenantViews = canAccessControl && tenantRows.length > 0
    ? tenantRows.map((row) => {
        const runtimeChurchId = extractRuntimeChurchId(row.metadata);

        return {
          tenantId: row.tenant_id,
          id: runtimeChurchId ?? row.tenant_id,
          name: row.name,
          slug: row.slug,
          timezone: row.timezone,
          connectionStatus: row.connection_status,
          runtimeChurchId,
        };
      })
    : memberships.map((membership) => ({
        ...membership.church,
        tenantId: membership.church.id,
        connectionStatus: "ready",
        runtimeChurchId: membership.church.id,
      }));

  return {
    memberships,
    canAccessControl,
    tenantViews,
    hydratedProfile,
  };
}

function buildControlAppContext(): ControlAppContext {
  return {
    kind: "control",
    homePath: "/control",
  };
}

function buildChurchAppContext({
  church,
  roleId,
  source,
}: {
  church: ChurchSummary;
  roleId: ChurchRoleId;
  source: ChurchAppContext["source"];
}): ChurchAppContext {
  return {
    kind: "church",
    source,
    church,
    roleId,
    homePath: `/app/${roleId}`,
  };
}

async function readAppContextSelection() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(appContextCookieName)?.value;

  if (!raw) {
    return null;
  }

  const parseSelection = (value: string) =>
    JSON.parse(value) as StoredAppContextSelection;

  try {
    return parseSelection(raw);
  } catch {
    try {
      return parseSelection(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
}

async function writeAppContextSelection(selection: StoredAppContextSelection) {
  const cookieStore = await cookies();

  cookieStore.set(appContextCookieName, JSON.stringify(selection), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearAppContextSelection() {
  const cookieStore = await cookies();
  cookieStore.delete(appContextCookieName);
}

export async function setChurchAppContextSelection({
  churchId,
  roleId,
  source,
}: {
  churchId: string;
  roleId: ChurchRoleId;
  source: "membership" | "impersonation";
}) {
  await writeAppContextSelection({
    kind: "church",
    churchId,
    roleId,
    source,
  });
}

export async function setControlAppContextSelection() {
  await writeAppContextSelection({
    kind: "control",
  });
}

function buildProfileFromSupabaseUser({
  user,
  canAccessControl,
  memberships,
  hydratedProfile,
}: {
  user: User;
  canAccessControl: boolean;
  memberships: ChurchMembership[];
  hydratedProfile?: HydratedProfileRecord | null;
}): DemoProfile {
  const profileRoleId = hydratedProfile?.role
    ? mapSupabaseRole(hydratedProfile.role)
    : null;
  const fallbackRoleId = profileRoleId
    ?? mapSupabaseRole(
      user.app_metadata.role ??
        user.user_metadata.role ??
        user.user_metadata.portal_role,
    );
  const resolvedFallbackRoleId =
    fallbackRoleId === "super-admin" && !canAccessControl
      ? "church-admin"
      : fallbackRoleId;
  const roleId =
    canAccessControl
      ? "super-admin"
      : memberships[0]?.roleId ?? resolvedFallbackRoleId;
  const template = getDefaultProfileTemplate(roleId);
  const name =
    hydratedProfile?.fullName ||
    (typeof user.user_metadata.full_name === "string" &&
      user.user_metadata.full_name) ||
    (typeof user.user_metadata.name === "string" && user.user_metadata.name) ||
    user.email?.split("@")[0] ||
    template.name;
  const title = canAccessControl
    ? template.title
    : hydratedProfile?.displayTitle ||
      (hydratedProfile?.isPastoral ? "Pastor / Elder" : null) ||
      (typeof user.user_metadata.title === "string" && user.user_metadata.title) ||
      template.title;
  const focus = canAccessControl
    ? template.focus
    : hydratedProfile?.church
      ? `Serving in ${hydratedProfile.church.name}.`
      : template.focus;

  return {
    id: user.id,
    name,
    email: hydratedProfile?.email ?? user.email ?? template.email,
    title,
    roleId,
    defaultPath: canAccessControl ? "/control" : getRoleHomePath(roleId),
    focus,
  };
}

function resolveAppContext({
  canAccessControl,
  memberships,
  tenantViews,
  storedSelection,
  fallbackRoleId,
  fallbackChurch,
}: {
  canAccessControl: boolean;
  memberships: ChurchMembership[];
  tenantViews: TenantViewTarget[];
  storedSelection: StoredAppContextSelection | null;
  fallbackRoleId: PortalRoleId;
  fallbackChurch: ChurchSummary | null;
}): AppContext {
  if (storedSelection?.kind === "control" && canAccessControl) {
    return buildControlAppContext();
  }

  if (storedSelection?.kind === "church") {
    if (storedSelection.source === "membership") {
      const membership = memberships.find(
        (entry) => entry.church.id === storedSelection.churchId,
      );

      if (membership) {
        return buildChurchAppContext({
          church: membership.church,
          roleId: membership.roleId,
          source: "membership",
        });
      }
    }

    if (storedSelection.source === "impersonation" && canAccessControl) {
      const tenant = tenantViews.find(
        (entry) => entry.id === storedSelection.churchId,
      );

      if (tenant) {
        return buildChurchAppContext({
          church: tenant,
          roleId: storedSelection.roleId,
          source: "impersonation",
        });
      }
    }
  }

  if (canAccessControl) {
    return buildControlAppContext();
  }

  if (memberships[0]) {
    return buildChurchAppContext({
      church: memberships[0].church,
      roleId: memberships[0].roleId,
      source: "membership",
    });
  }

  if (isChurchRole(fallbackRoleId) && fallbackChurch) {
    return buildChurchAppContext({
      church: fallbackChurch,
      roleId: fallbackRoleId,
      source: "fallback",
    });
  }

  return buildControlAppContext();
}

function buildSession({
  source,
  profile,
  userId,
  appContext,
  memberships,
  tenantViews,
  canAccessControl,
}: {
  source: AuthSession["source"];
  profile: DemoProfile;
  userId: string;
  appContext: AppContext;
  memberships: ChurchMembership[];
  tenantViews: TenantViewTarget[];
  canAccessControl: boolean;
}): AuthSession {
  return {
    source,
    profile,
    userId,
    appContext,
    homePath: appContext.homePath,
    canAccessControl,
    memberships,
    tenantViews,
  };
}

function buildPreviewSession(profile: DemoProfile, storedSelection: StoredAppContextSelection | null) {
  const memberships = previewMembershipsByProfileId[profile.id] ?? [];
  const canAccessControl = isControlPlaneRole(profile.roleId);
  const tenantViews = canAccessControl
    ? previewChurches.map((church) => ({
        ...church,
        tenantId: church.id,
        connectionStatus: "ready",
        runtimeChurchId: church.id,
      }))
    : [];
  const appContext = resolveAppContext({
    canAccessControl,
    memberships,
    tenantViews,
    storedSelection,
    fallbackRoleId: profile.roleId,
    fallbackChurch: memberships[0]?.church ?? previewChurches[0] ?? null,
  });

  return buildSession({
    source: "preview",
    profile,
    userId: profile.id,
    appContext,
    memberships,
    tenantViews,
    canAccessControl,
  });
}

export function sanitizeRedirectTarget(target?: string | null) {
  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return "/workspace";
  }

  return target;
}

export function isChurchAppContext(context: AppContext): context is ChurchAppContext {
  return context.kind === "church";
}

async function getSupabaseAuthUser(preferredSurface: SupabaseSurface) {
  for (const surface of getSupabaseSurfaceFallbackOrder(preferredSurface)) {
    if (!hasSupabaseEnvForSurface(surface)) {
      continue;
    }

    const supabase =
      surface === "control-plane"
        ? await createControlPlaneServerClient()
        : await createTenantServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      return user;
    }
  }

  return null;
}

export async function getSession(
  redirectHint = "/workspace",
): Promise<AuthSession | null> {
  const storedSelection = await readAppContextSelection();
  const preferredSurface = getPreferredSupabaseSurfaceForRedirect(redirectHint);
  const authUser = await getSupabaseAuthUser(preferredSurface);

  if (authUser) {
    const user = authUser;

    const fallbackRoleId = mapSupabaseRole(
      user.app_metadata.role ??
        user.user_metadata.role ??
        user.user_metadata.portal_role,
    );
    const appData =
      shouldUseLocalControlPlaneFallback() || shouldUseLocalTenantFallback()
      ? await loadSupabaseAppDataFromLocalDb(user.id)
      : await (async () => {
          const controlPlaneSupabase = await createControlPlaneServerClient();
          const tenantSupabase = await createTenantServerClient();
          const [
            { data: platformAdmin },
            { data: membershipRows },
            { data: tenantRows },
            { data: profileRow },
          ] =
            await Promise.all([
              controlPlaneSupabase
                .from("platform_admins")
                .select("user_id")
                .eq("user_id", user.id)
                .maybeSingle(),
              tenantSupabase
                .from("church_memberships")
                .select("church_id, role, churches(id, name, slug, timezone)")
                .eq("user_id", user.id)
                .eq("is_active", true),
              controlPlaneSupabase
                .from("tenants")
                .select(
                  "id, name, slug, timezone, tenant_connections(connection_status, metadata)",
                )
                .order("name"),
              tenantSupabase
                .from("profiles")
                .select(
                  "id, user_id, church_id, full_name, email, role, display_title, is_pastoral, churches(id, name, slug, timezone)",
                )
                .eq("user_id", user.id)
                .maybeSingle(),
            ]);

          let memberships = normalizeMembershipRows(membershipRows);
          const canAccessControl = Boolean(platformAdmin);
          const hydratedProfile = normalizeHydratedProfileRow(profileRow);
          const allVisibleChurches =
            tenantRows?.flatMap((row) => {
              if (!row || typeof row !== "object") {
                return [];
              }

              const record = row as Record<string, unknown>;

              if (
                typeof record.name !== "string" ||
                typeof record.slug !== "string"
              ) {
                return [];
              }

              const runtimeChurchId =
                record.tenant_connections &&
                typeof record.tenant_connections === "object"
                  ? Array.isArray(record.tenant_connections)
                    ? extractRuntimeChurchId(
                        record.tenant_connections[0] &&
                          typeof record.tenant_connections[0] === "object"
                          ? (record.tenant_connections[0] as Record<string, unknown>)
                              .metadata
                          : null,
                      )
                    : extractRuntimeChurchId(
                        (record.tenant_connections as Record<string, unknown>).metadata,
                      )
                  : null;

              const resolvedId =
                runtimeChurchId ||
                (typeof record.id === "string" ? record.id : null);

              if (!resolvedId) {
                return [];
              }

              return [
                {
                  tenantId:
                    typeof record.id === "string" ? record.id : resolvedId,
                  id: resolvedId,
                  name: record.name,
                  slug: record.slug,
                  timezone:
                    typeof record.timezone === "string"
                      ? record.timezone
                      : "America/New_York",
                  connectionStatus:
                    record.tenant_connections &&
                    typeof record.tenant_connections === "object"
                      ? Array.isArray(record.tenant_connections)
                        ? record.tenant_connections[0] &&
                          typeof record.tenant_connections[0] === "object" &&
                          "connection_status" in record.tenant_connections[0]
                            ? String(
                                (
                                  record.tenant_connections[0] as Record<
                                    string,
                                    unknown
                                  >
                                ).connection_status,
                              )
                            : null
                        : "connection_status" in
                              (record.tenant_connections as Record<string, unknown>)
                          ? String(
                              (
                                record.tenant_connections as Record<
                                  string,
                                  unknown
                                >
                              ).connection_status,
                            )
                          : null
                      : null,
                  runtimeChurchId,
                },
              ];
            }) ?? [];
          const hydratedProfileRoleId =
            hydratedProfile?.role ? mapSupabaseRole(hydratedProfile.role) : null;

          if (
            memberships.length === 0 &&
            hydratedProfile?.church &&
            hydratedProfileRoleId &&
            isChurchRoleId(hydratedProfileRoleId)
          ) {
            memberships = [
              {
                church: hydratedProfile.church,
                roleId: hydratedProfileRoleId,
              },
            ];
          }

          const tenantViews = canAccessControl
            ? allVisibleChurches
            : memberships.map((membership) => ({
                ...membership.church,
                tenantId: membership.church.id,
                connectionStatus: "ready",
                runtimeChurchId: membership.church.id,
              }));

          return {
            memberships,
            canAccessControl,
            tenantViews,
            hydratedProfile,
          };
        })();

    const { memberships, canAccessControl, tenantViews, hydratedProfile } =
      appData;
    const profile = buildProfileFromSupabaseUser({
      user,
      canAccessControl,
      memberships,
      hydratedProfile,
    });
    const appContext = resolveAppContext({
      canAccessControl,
      memberships,
      tenantViews,
      storedSelection,
      fallbackRoleId,
      fallbackChurch: memberships[0]?.church ?? tenantViews[0] ?? null,
    });

    return buildSession({
      source: "supabase",
      profile,
      userId: user.id,
      appContext,
      memberships,
      tenantViews,
      canAccessControl,
    });
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName)?.value;

  if (!sessionId) {
    return null;
  }

  const profile = getDemoProfile(sessionId);

  if (!profile) {
    return null;
  }

  return buildPreviewSession(profile, storedSelection);
}

export async function requireSession(redirectTo: string) {
  const session = await getSession(redirectTo);

  if (!session) {
    redirect(`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return session;
}

export async function requireControlPlaneSession(redirectTo: string) {
  const session = await requireSession(redirectTo);

  if (!session.canAccessControl) {
    redirect(
      `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}&force=1&message=${encodeURIComponent(
        "Sign in with a control-plane account to open ChurchCore Ops Control.",
      )}`,
    );
  }

  return session;
}

export async function requireChurchSession(
  redirectTo: string,
): Promise<ChurchAppSession> {
  const session = await requireSession(redirectTo);

  if (!isChurchAppContext(session.appContext)) {
    redirect(session.homePath);
  }

  return session as ChurchAppSession;
}
