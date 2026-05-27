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
      "service_name, service_date, status, checkin_session_status, checkin_session_starts_at, checkin_session_ends_at, checkin_session_token, churches!inner(name)",
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
