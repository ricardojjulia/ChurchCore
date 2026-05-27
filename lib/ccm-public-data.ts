import "server-only";

import {
  createTenantAdminClient,
  hasTenantAdminBackendEnv,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { hasTenantDbUrl } from "@/lib/supabase/config";

export type PublicCcmSessionStatus = "enabled" | "draft" | "paused" | "closed";

export type PublicCcmSessionMode = "checkin" | "checkout";

export type PublicCcmSessionRecord = {
  churchId: string;
  serviceId: string;
  ministryId: string;
  churchName: string;
  serviceName: string;
  serviceDate: string;
  serviceStatus: "open" | "closed" | "emergency";
  sessionStatus: PublicCcmSessionStatus;
  sessionStartsAt: string | null;
  sessionEndsAt: string | null;
  token: string;
};

export type PublicCcmSessionAvailability = {
  state:
    | "available"
    | "no-backend"
    | "not-found"
    | "service-closed"
    | "draft"
    | "paused"
    | "closed"
    | "window-not-open"
    | "window-closed";
  title: string;
  detail: string;
};

export type PublicCcmRoomOption = {
  id: string;
  name: string;
};

export type PublicCcmCheckoutSessionOption = {
  id: string;
  childName: string;
  checkedInAt: string;
  status: "checked_in" | "late_pickup" | "transferred";
};

export function evaluatePublicCcmSessionAvailability(
  record: PublicCcmSessionRecord | null,
  mode: PublicCcmSessionMode,
  nowMs: number = Date.now(),
): PublicCcmSessionAvailability {
  if (!record) {
    return {
      state: "not-found",
      title: "Session link unavailable",
      detail: "This children session link is invalid or no longer active.",
    };
  }

  if (record.serviceStatus !== "open") {
    return {
      state: "service-closed",
      title: "Session is not active",
      detail: "This service is not currently open for parent self-service check-in or checkout.",
    };
  }

  if (record.sessionStatus === "draft") {
    return {
      state: "draft",
      title: "Session has not started",
      detail: "Children session links become active only after staff enables today's session.",
    };
  }

  if (record.sessionStatus === "paused") {
    return {
      state: "paused",
      title: "Session is paused",
      detail: "Staff has temporarily paused parent self-service for this session.",
    };
  }

  if (record.sessionStatus === "closed") {
    return {
      state: "closed",
      title: "Session is closed",
      detail: "This children session is closed and cannot be reused.",
    };
  }

  if (record.sessionStartsAt && record.sessionEndsAt) {
    const startsAt = new Date(record.sessionStartsAt).getTime();
    const endsAt = new Date(record.sessionEndsAt).getTime();

    if (!Number.isNaN(startsAt) && nowMs < startsAt) {
      return {
        state: "window-not-open",
        title: "Session window not open",
        detail: "Parent self-service is configured but today's check-in window has not opened yet.",
      };
    }

    if (!Number.isNaN(endsAt) && nowMs > endsAt) {
      return {
        state: "window-closed",
        title: "Session window closed",
        detail: "Today's parent self-service window is closed for this children's session.",
      };
    }
  }

  const modeLabel = mode === "checkin" ? "check-in" : "checkout";

  return {
    state: "available",
    title: `Parent ${modeLabel} is available`,
    detail: "This session link is active for today's children service.",
  };
}

export async function getPublicCcmSessionByToken(
  token: string,
): Promise<PublicCcmSessionRecord | null> {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return null;
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const result = await queryTenantLocalDb<{
      service_id: string;
      church_id: string;
      ministry_id: string;
      service_name: string;
      service_date: string;
      status: "open" | "closed" | "emergency";
      checkin_session_status: PublicCcmSessionStatus;
      checkin_session_starts_at: string | null;
      checkin_session_ends_at: string | null;
      checkin_session_token: string;
      church_name: string;
    }>(
      `select
        s.id as service_id,
        s.church_id,
        s.ministry_id,
         s.service_name,
         s.service_date::text,
         s.status,
         s.checkin_session_status,
         s.checkin_session_starts_at::text,
         s.checkin_session_ends_at::text,
         s.checkin_session_token,
         c.name as church_name
       from public.ccm_services s
       join public.churches c on c.id = s.church_id
       where s.checkin_session_token = $1
       limit 1`,
      [normalizedToken],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      churchId: String(row.church_id),
      serviceId: String(row.service_id),
      ministryId: String(row.ministry_id),
      churchName: row.church_name,
      serviceName: row.service_name,
      serviceDate: row.service_date,
      serviceStatus: row.status,
      sessionStatus: row.checkin_session_status,
      sessionStartsAt: row.checkin_session_starts_at,
      sessionEndsAt: row.checkin_session_ends_at,
      token: row.checkin_session_token,
    };
  }

  if (!hasTenantAdminBackendEnv()) {
    return null;
  }

  const supabase = createTenantAdminClient();
  const { data, error } = await supabase
    .from("ccm_services")
    .select(
      "id, church_id, ministry_id, service_name, service_date, status, checkin_session_status, checkin_session_starts_at, checkin_session_ends_at, checkin_session_token, churches!inner(name)",
    )
    .eq("checkin_session_token", normalizedToken)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const churchName = Array.isArray(data.churches)
    ? String(data.churches[0]?.name ?? "")
    : String((data.churches as { name?: unknown } | null)?.name ?? "");

  return {
    churchId: String(data.church_id),
    serviceId: String(data.id),
    ministryId: String(data.ministry_id),
    churchName,
    serviceName: String(data.service_name),
    serviceDate: String(data.service_date),
    serviceStatus: data.status as PublicCcmSessionRecord["serviceStatus"],
    sessionStatus: data.checkin_session_status as PublicCcmSessionStatus,
    sessionStartsAt: data.checkin_session_starts_at ? String(data.checkin_session_starts_at) : null,
    sessionEndsAt: data.checkin_session_ends_at ? String(data.checkin_session_ends_at) : null,
    token: String(data.checkin_session_token),
  };
}

export async function getPublicCcmSessionRooms(
  record: PublicCcmSessionRecord,
): Promise<PublicCcmRoomOption[]> {
  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const result = await queryTenantLocalDb<{ id: string; name: string }>(
      `select id, name
       from public.children_rooms
       where church_id = $1
         and ministry_id = $2
         and is_active = true
       order by age_min asc nulls last, name asc`,
      [record.churchId, record.ministryId],
    );

    return result.rows.map((row) => ({ id: row.id, name: row.name }));
  }

  if (!hasTenantAdminBackendEnv()) {
    return [];
  }

  const supabase = createTenantAdminClient();
  const { data, error } = await supabase
    .from("children_rooms")
    .select("id, name")
    .eq("church_id", record.churchId)
    .eq("ministry_id", record.ministryId)
    .eq("is_active", true)
    .order("age_min", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function getPublicCcmCheckoutSessions(
  record: PublicCcmSessionRecord,
): Promise<PublicCcmCheckoutSessionOption[]> {
  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const result = await queryTenantLocalDb<{
      id: string;
      child_name: string;
      checked_in_at: string;
      status: "checked_in" | "late_pickup" | "transferred";
    }>(
      `select id, child_name, checked_in_at::text, status
       from public.ccm_checkin_sessions
       where church_id = $1
         and service_id = $2
         and status in ('checked_in', 'late_pickup', 'transferred')
       order by checked_in_at desc`,
      [record.churchId, record.serviceId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      childName: row.child_name,
      checkedInAt: row.checked_in_at,
      status: row.status,
    }));
  }

  if (!hasTenantAdminBackendEnv()) {
    return [];
  }

  const supabase = createTenantAdminClient();
  const { data, error } = await supabase
    .from("ccm_checkin_sessions")
    .select("id, child_name, checked_in_at, status")
    .eq("church_id", record.churchId)
    .eq("service_id", record.serviceId)
    .in("status", ["checked_in", "late_pickup", "transferred"])
    .order("checked_in_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: String(row.id),
    childName: String(row.child_name),
    checkedInAt: String(row.checked_in_at),
    status: row.status as PublicCcmCheckoutSessionOption["status"],
  }));
}
