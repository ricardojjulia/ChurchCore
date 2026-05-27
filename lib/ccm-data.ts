import "server-only";

import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  Allergy,
  CcmAuthorizedPickup,
  CcmCheckinSession,
  CcmChildProfile,
  CcmCustodyRestriction,
  CcmDashboardData,
  CcmIncident,
  CcmRoomStatus,
  CcmRosterData,
  CcmService,
  CcmVolunteerAssignment,
  EmergencyRosterData,
} from "@/lib/ccm-types";
import {
  isMissingCcmSchemaError,
  logMissingCcmSchema,
} from "@/lib/ccm-runtime";
import type { ChildrenRoom } from "@/lib/ministry-forge-types";

function emptyDashboard(): CcmDashboardData {
  return {
    service: null,
    roomStatuses: [],
    totalCheckedIn: 0,
    totalCheckedOut: 0,
    latePickups: [],
    openIncidents: [],
  };
}

function emptyEmergencyRoster(): EmergencyRosterData {
  return {
    service: null,
    entries: [],
    generatedAt: new Date().toISOString(),
  };
}

async function withLocalCcmReadFallback<T>(
  read: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isMissingCcmSchemaError(error)) {
      logMissingCcmSchema(error);
      return fallback;
    }

    throw error;
  }
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapService(r: {
  id: string; church_id: string; ministry_id: string; service_name: string;
  service_date: string; started_at: string; ended_at: string | null;
  status: string;
  checkin_session_status?: string | null;
  checkin_session_starts_at?: string | null;
  checkin_session_ends_at?: string | null;
  checkin_session_token?: string | null;
  checkin_session_enabled_at?: string | null;
  checkin_session_closed_at?: string | null;
  created_by: string | null; created_at: string;
}): CcmService {
  return {
    id: r.id, churchId: r.church_id, ministryId: r.ministry_id,
    serviceName: r.service_name, serviceDate: r.service_date,
    startedAt: r.started_at, endedAt: r.ended_at,
    status: r.status as CcmService["status"],
    checkinSessionStatus:
      (r.checkin_session_status as CcmService["checkinSessionStatus"]) ?? "draft",
    checkinSessionStartsAt: r.checkin_session_starts_at ?? null,
    checkinSessionEndsAt: r.checkin_session_ends_at ?? null,
    checkinSessionToken: r.checkin_session_token ?? "",
    checkinSessionEnabledAt: r.checkin_session_enabled_at ?? null,
    checkinSessionClosedAt: r.checkin_session_closed_at ?? null,
    createdBy: r.created_by, createdAt: r.created_at,
  };
}

function parseAllergies(raw: unknown): Allergy[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is Allergy =>
      typeof a === "object" && a !== null &&
      typeof (a as Allergy).name === "string" &&
      typeof (a as Allergy).severity === "string",
  );
}

function criticalAllergyNames(allergies: Allergy[]): string[] {
  return allergies
    .filter((a) => a.severity === "anaphylactic" || a.severity === "moderate")
    .map((a) => a.name);
}

function mapSession(r: {
  id: string; service_id: string; room_id: string; room_name?: string;
  child_profile_id: string | null; child_name: string;
  guardian_name: string | null; qr_token: string; status: string;
  current_room_id: string | null; current_room_name?: string | null;
  is_first_visit: boolean; checked_in_at: string; checked_out_at: string | null;
  released_to_name: string | null; silent_page_sent_at: string | null;
  late_pickup_notified_at: string | null;
  allergies?: unknown; no_photo_flag?: boolean;
}): CcmCheckinSession {
  const allergies = parseAllergies(r.allergies ?? []);
  return {
    id: r.id, serviceId: r.service_id, roomId: r.room_id,
    roomName: r.room_name ?? "",
    childProfileId: r.child_profile_id, childName: r.child_name,
    guardianName: r.guardian_name, qrToken: r.qr_token,
    status: r.status as CcmCheckinSession["status"],
    currentRoomId: r.current_room_id, currentRoomName: r.current_room_name ?? null,
    isFirstVisit: r.is_first_visit,
    checkedInAt: r.checked_in_at, checkedOutAt: r.checked_out_at,
    releasedToName: r.released_to_name, silentPageSentAt: r.silent_page_sent_at,
    latePickupNotifiedAt: r.late_pickup_notified_at,
    criticalAllergies: criticalAllergyNames(allergies),
    allAllergies: allergies, noPhotoFlag: r.no_photo_flag ?? false,
  };
}

function mapVolunteer(r: {
  id: string; service_id: string; room_id: string; room_name?: string;
  profile_id: string; full_name?: string; role: string;
  checked_in_at: string | null; checked_out_at: string | null;
  background_check_verified: boolean; safety_clearance_date?: string | null;
}): CcmVolunteerAssignment {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const exp = r.safety_clearance_date ?? null;
  return {
    id: r.id, serviceId: r.service_id, roomId: r.room_id,
    roomName: r.room_name ?? "",
    profileId: r.profile_id, volunteerName: r.full_name ?? "Unknown",
    role: r.role as CcmVolunteerAssignment["role"],
    checkedInAt: r.checked_in_at, checkedOutAt: r.checked_out_at,
    backgroundCheckVerified: r.background_check_verified,
    clearanceDate: exp,
    clearanceExpiringSoon: exp !== null && exp <= thirtyOut && exp >= today,
  };
}

function mapIncident(r: {
  id: string; service_id: string | null; session_id: string | null;
  child_name: string; incident_type: string; severity: string;
  description: string; actions_taken: string | null;
  guardian_notified: boolean; guardian_notified_at: string | null;
  follow_up_required: boolean; reported_by: string | null; created_at: string;
}): CcmIncident {
  return {
    id: r.id, serviceId: r.service_id, sessionId: r.session_id,
    childName: r.child_name,
    incidentType: r.incident_type as CcmIncident["incidentType"],
    severity: r.severity as CcmIncident["severity"],
    description: r.description, actionsTaken: r.actions_taken,
    guardianNotified: r.guardian_notified, guardianNotifiedAt: r.guardian_notified_at,
    followUpRequired: r.follow_up_required, reportedBy: r.reported_by,
    createdAt: r.created_at,
  };
}

// ── buildRoomStatuses helper ──────────────────────────────────────────────────

function buildRoomStatuses(
  rooms: ChildrenRoom[],
  sessions: CcmCheckinSession[],
  volunteers: CcmVolunteerAssignment[],
): CcmRoomStatus[] {
  return rooms.map((room) => {
    const activeSessions = sessions.filter(
      (s) => s.currentRoomId === room.id && s.status === "checked_in",
    );
    const confirmedVolunteers = volunteers.filter(
      (v) => v.roomId === room.id && v.checkedInAt !== null,
    );
    const childCount = activeSessions.length;
    const volunteerCount = confirmedVolunteers.length;
    const actualRatio = volunteerCount > 0
      ? Math.round((childCount / volunteerCount) * 10) / 10
      : childCount;
    let ratioStatus: CcmRoomStatus["ratioStatus"] = "safe";
    if (actualRatio > room.targetRatio) ratioStatus = "alert";
    else if (actualRatio > room.targetRatio * 0.9) ratioStatus = "warning";
    return {
      room, activeSessions, confirmedVolunteers,
      childCount, volunteerCount, actualRatio, ratioStatus,
      twoAdultRuleMet: volunteerCount >= 2,
      hasExpiredBackgroundChecks: confirmedVolunteers.some(
        (v) => !v.backgroundCheckVerified || !v.clearanceDate,
      ),
    };
  });
}

// ── getCcmServiceList ─────────────────────────────────────────────────────────

export async function getCcmServiceList(
  session: ChurchAppSession,
): Promise<CcmService[]> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    return withLocalCcmReadFallback(async () => {
      const result = await queryTenantLocalDb<{
        id: string; church_id: string; ministry_id: string; service_name: string;
        service_date: string; started_at: string; ended_at: string | null;
        status: string;
        checkin_session_status: string;
        checkin_session_starts_at: string | null;
        checkin_session_ends_at: string | null;
        checkin_session_token: string;
        checkin_session_enabled_at: string | null;
        checkin_session_closed_at: string | null;
        created_by: string | null; created_at: string;
      }>(
        `select id, church_id, ministry_id, service_name, service_date::text,
                started_at::text, ended_at::text, status,
                checkin_session_status,
                checkin_session_starts_at::text,
                checkin_session_ends_at::text,
                checkin_session_token,
                checkin_session_enabled_at::text,
                checkin_session_closed_at::text,
                created_by, created_at::text
         from public.ccm_services
         where church_id = $1
         order by service_date desc, started_at desc
         limit 60`,
        [churchId],
      );
      return result.rows.map(mapService);
    }, []);
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("ccm_services")
    .select("*")
    .eq("church_id", churchId)
    .order("service_date", { ascending: false })
    .limit(60);
  return (data ?? []).map(mapService);
}

// ── getCcmDashboard ───────────────────────────────────────────────────────────

export async function getCcmDashboard(
  session: ChurchAppSession,
  serviceId: string,
): Promise<CcmDashboardData> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    return withLocalCcmReadFallback(async () => {
      const [svcResult, roomsResult, sessionsResult, volsResult, incidentsResult] =
        await Promise.all([
          queryTenantLocalDb<{
            id: string; church_id: string; ministry_id: string; service_name: string;
            service_date: string; started_at: string; ended_at: string | null;
            status: string;
            checkin_session_status: string;
            checkin_session_starts_at: string | null;
            checkin_session_ends_at: string | null;
            checkin_session_token: string;
            checkin_session_enabled_at: string | null;
            checkin_session_closed_at: string | null;
            created_by: string | null; created_at: string;
          }>(
            `select id, church_id, ministry_id, service_name, service_date::text,
                    started_at::text, ended_at::text, status,
                    checkin_session_status,
                    checkin_session_starts_at::text,
                    checkin_session_ends_at::text,
                    checkin_session_token,
                    checkin_session_enabled_at::text,
                    checkin_session_closed_at::text,
                    created_by, created_at::text
             from public.ccm_services where id = $1 and church_id = $2`,
            [serviceId, churchId],
          ),
          queryTenantLocalDb<{
            id: string; name: string; age_min: number | null; age_max: number | null;
            capacity: number; target_ratio: string; is_active: boolean; ministry_id: string | null;
          }>(
            `select cr.id, cr.name, cr.age_min, cr.age_max, cr.capacity,
                    cr.target_ratio, cr.is_active, cr.ministry_id
             from public.children_rooms cr
             join public.ccm_services cs on cs.ministry_id = cr.ministry_id
             where cs.id = $1 and cr.church_id = $2 and cr.is_active = true
             order by cr.age_min asc nulls last`,
            [serviceId, churchId],
          ),
          queryTenantLocalDb<{
            id: string; service_id: string; room_id: string; room_name: string;
            child_profile_id: string | null; child_name: string;
            guardian_name: string | null; qr_token: string; status: string;
            current_room_id: string | null; current_room_name: string | null;
            is_first_visit: boolean; checked_in_at: string; checked_out_at: string | null;
            released_to_name: string | null; silent_page_sent_at: string | null;
            late_pickup_notified_at: string | null; allergies: unknown; no_photo_flag: boolean;
          }>(
            `select s.id, s.service_id, s.room_id, cr.name as room_name,
                    s.child_profile_id, s.child_name, s.guardian_name, s.qr_token,
                    s.status, s.current_room_id,
                    cur.name as current_room_name,
                    s.is_first_visit,
                    s.checked_in_at::text, s.checked_out_at::text,
                    s.released_to_name, s.silent_page_sent_at::text,
                    s.late_pickup_notified_at::text,
                    coalesce(csd.allergies, '[]'::jsonb) as allergies,
                    coalesce(csd.no_photo_flag, false) as no_photo_flag
             from public.ccm_checkin_sessions s
             join public.children_rooms cr on cr.id = s.room_id
             left join public.children_rooms cur on cur.id = s.current_room_id
             left join public.children_sensitive_data csd
               on csd.child_profile_id = s.child_profile_id and csd.church_id = s.church_id
             where s.service_id = $1 and s.church_id = $2
             order by s.checked_in_at asc`,
            [serviceId, churchId],
          ),
          queryTenantLocalDb<{
            id: string; service_id: string; room_id: string; room_name: string;
            profile_id: string; full_name: string; role: string;
            checked_in_at: string | null; checked_out_at: string | null;
            background_check_verified: boolean; safety_clearance_date: string | null;
          }>(
            `select va.id, va.service_id, va.room_id, cr.name as room_name,
                    va.profile_id, p.full_name, va.role,
                    va.checked_in_at::text, va.checked_out_at::text,
                    va.background_check_verified, p.safety_clearance_date::text
             from public.ccm_volunteer_assignments va
             join public.children_rooms cr on cr.id = va.room_id
             join public.profiles p on p.id = va.profile_id
             where va.service_id = $1 and va.church_id = $2`,
            [serviceId, churchId],
          ),
          queryTenantLocalDb<{
            id: string; service_id: string | null; session_id: string | null;
            child_name: string; incident_type: string; severity: string;
            description: string; actions_taken: string | null;
            guardian_notified: boolean; guardian_notified_at: string | null;
            follow_up_required: boolean; reported_by: string | null; created_at: string;
          }>(
            `select id, service_id, session_id, child_name, incident_type, severity,
                    description, actions_taken, guardian_notified,
                    guardian_notified_at::text, follow_up_required,
                    reported_by, created_at::text
             from public.ccm_incidents
             where service_id = $1 and church_id = $2
               and follow_up_required = true
             order by created_at desc`,
            [serviceId, churchId],
          ),
        ]);

      const service = svcResult.rows[0] ? mapService(svcResult.rows[0]) : null;
      const rooms: ChildrenRoom[] = roomsResult.rows.map((r) => ({
        id: r.id, name: r.name, ageMin: r.age_min, ageMax: r.age_max,
        capacity: r.capacity, targetRatio: parseFloat(r.target_ratio),
        isActive: r.is_active,
      }));
      const sessions = sessionsResult.rows.map(mapSession);
      const volunteers = volsResult.rows.map(mapVolunteer);
      const openIncidents = incidentsResult.rows.map(mapIncident);

      const roomStatuses = buildRoomStatuses(rooms, sessions, volunteers);
      const totalCheckedIn = sessions.filter((s) => s.status === "checked_in").length;
      const totalCheckedOut = sessions.filter((s) => s.status === "checked_out").length;
      const latePickups = sessions.filter((s) => s.status === "late_pickup");

      return { service, roomStatuses, totalCheckedIn, totalCheckedOut, latePickups, openIncidents };
    }, emptyDashboard());
  }

  // Supabase path
  const supabase = await createTenantServerClient();
  const [{ data: svcData }, { data: sessData }, { data: volData }, { data: incData }] =
    await Promise.all([
      supabase.from("ccm_services").select("*").eq("id", serviceId).eq("church_id", churchId).single(),
      supabase.from("ccm_checkin_sessions").select(`*, room:children_rooms!room_id(name), cur:children_rooms!current_room_id(name), csd:children_sensitive_data(allergies, no_photo_flag)`).eq("service_id", serviceId).eq("church_id", churchId),
      supabase.from("ccm_volunteer_assignments").select(`*, room:children_rooms(name), profile:profiles(full_name, safety_clearance_date)`).eq("service_id", serviceId).eq("church_id", churchId),
      supabase.from("ccm_incidents").select("*").eq("service_id", serviceId).eq("church_id", churchId).eq("follow_up_required", true),
    ]);

  const service = svcData ? mapService(svcData as Parameters<typeof mapService>[0]) : null;
  const sessions = (sessData ?? []).map((r) => mapSession({
    ...r,
    room_name: (r.room as { name: string } | null)?.name ?? "",
    current_room_name: (r.cur as { name: string } | null)?.name ?? null,
    allergies: (r.csd as { allergies: unknown } | null)?.allergies ?? [],
    no_photo_flag: (r.csd as { no_photo_flag: boolean } | null)?.no_photo_flag ?? false,
  }));
  const volunteers = (volData ?? []).map((r) => mapVolunteer({
    ...r,
    room_name: (r.room as { name: string } | null)?.name ?? "",
    full_name: (r.profile as { full_name: string } | null)?.full_name ?? "Unknown",
    safety_clearance_date: (r.profile as { safety_clearance_date: string | null } | null)?.safety_clearance_date ?? null,
  }));

  const roomsForService = [...new Set(sessions.map((s) => s.roomId))];
  const { data: roomsData } = await supabase
    .from("children_rooms")
    .select("*")
    .in("id", roomsForService.length > 0 ? roomsForService : ["00000000-0000-0000-0000-000000000000"]);
  const rooms: ChildrenRoom[] = (roomsData ?? []).map((r) => ({
    id: r.id, name: r.name, ageMin: r.age_min ?? null, ageMax: r.age_max ?? null,
    capacity: r.capacity, targetRatio: parseFloat(String(r.target_ratio)), isActive: r.is_active,
  }));

  const openIncidents = (incData ?? []).map(mapIncident);
  const roomStatuses = buildRoomStatuses(rooms, sessions, volunteers);
  const totalCheckedIn = sessions.filter((s) => s.status === "checked_in").length;
  const totalCheckedOut = sessions.filter((s) => s.status === "checked_out").length;
  const latePickups = sessions.filter((s) => s.status === "late_pickup");

  return { service, roomStatuses, totalCheckedIn, totalCheckedOut, latePickups, openIncidents };
}

// ── getCcmRoster ──────────────────────────────────────────────────────────────

export async function getCcmRoster(
  session: ChurchAppSession,
  serviceId: string,
): Promise<CcmRosterData | null> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    return withLocalCcmReadFallback(async () => {
      const [svcRes, sessRes, volRes, incRes] = await Promise.all([
        queryTenantLocalDb<{
          id: string; church_id: string; ministry_id: string; service_name: string;
          service_date: string; started_at: string; ended_at: string | null;
          status: string;
          checkin_session_status: string;
          checkin_session_starts_at: string | null;
          checkin_session_ends_at: string | null;
          checkin_session_token: string;
          checkin_session_enabled_at: string | null;
          checkin_session_closed_at: string | null;
          created_by: string | null; created_at: string;
        }>(
          `select id, church_id, ministry_id, service_name, service_date::text,
                  started_at::text, ended_at::text, status,
                  checkin_session_status,
                  checkin_session_starts_at::text,
                  checkin_session_ends_at::text,
                  checkin_session_token,
                  checkin_session_enabled_at::text,
                  checkin_session_closed_at::text,
                  created_by, created_at::text
           from public.ccm_services where id = $1 and church_id = $2`,
          [serviceId, churchId],
        ),
        queryTenantLocalDb<{
          id: string; service_id: string; room_id: string; room_name: string;
          child_profile_id: string | null; child_name: string; guardian_name: string | null;
          qr_token: string; status: string; current_room_id: string | null;
          current_room_name: string | null; is_first_visit: boolean;
          checked_in_at: string; checked_out_at: string | null;
          released_to_name: string | null; silent_page_sent_at: string | null;
          late_pickup_notified_at: string | null; allergies: unknown; no_photo_flag: boolean;
        }>(
          `select s.id, s.service_id, s.room_id, cr.name as room_name,
                  s.child_profile_id, s.child_name, s.guardian_name, s.qr_token,
                  s.status, s.current_room_id,
                  cur.name as current_room_name,
                  s.is_first_visit,
                  s.checked_in_at::text, s.checked_out_at::text,
                  s.released_to_name, s.silent_page_sent_at::text,
                  s.late_pickup_notified_at::text,
                  coalesce(csd.allergies, '[]'::jsonb) as allergies,
                  coalesce(csd.no_photo_flag, false) as no_photo_flag
           from public.ccm_checkin_sessions s
           join public.children_rooms cr on cr.id = s.room_id
           left join public.children_rooms cur on cur.id = s.current_room_id
           left join public.children_sensitive_data csd
             on csd.child_profile_id = s.child_profile_id and csd.church_id = s.church_id
           where s.service_id = $1 and s.church_id = $2
           order by cr.name asc, s.child_name asc`,
          [serviceId, churchId],
        ),
        queryTenantLocalDb<{
          id: string; service_id: string; room_id: string; room_name: string;
          profile_id: string; full_name: string; role: string;
          checked_in_at: string | null; checked_out_at: string | null;
          background_check_verified: boolean; safety_clearance_date: string | null;
        }>(
          `select va.id, va.service_id, va.room_id, cr.name as room_name,
                  va.profile_id, p.full_name, va.role,
                  va.checked_in_at::text, va.checked_out_at::text,
                  va.background_check_verified, p.safety_clearance_date::text
           from public.ccm_volunteer_assignments va
           join public.children_rooms cr on cr.id = va.room_id
           join public.profiles p on p.id = va.profile_id
           where va.service_id = $1 and va.church_id = $2`,
          [serviceId, churchId],
        ),
        queryTenantLocalDb<{
          id: string; service_id: string | null; session_id: string | null;
          child_name: string; incident_type: string; severity: string;
          description: string; actions_taken: string | null;
          guardian_notified: boolean; guardian_notified_at: string | null;
          follow_up_required: boolean; reported_by: string | null; created_at: string;
        }>(
          `select id, service_id, session_id, child_name, incident_type, severity,
                  description, actions_taken, guardian_notified,
                  guardian_notified_at::text, follow_up_required,
                  reported_by, created_at::text
           from public.ccm_incidents where service_id = $1 and church_id = $2
           order by created_at desc`,
          [serviceId, churchId],
        ),
      ]);

      if (!svcRes.rows[0]) return null;
      const sessions = sessRes.rows.map(mapSession);
      const volunteers = volRes.rows.map(mapVolunteer);
      return {
        service: mapService(svcRes.rows[0]),
        sessions, volunteerAssignments: volunteers,
        incidents: incRes.rows.map(mapIncident),
        totalChildren: sessions.length, totalVolunteers: volunteers.length,
      };
    }, null);
  }

  const supabase = await createTenantServerClient();
  const { data: svcData } = await supabase.from("ccm_services").select("*").eq("id", serviceId).eq("church_id", churchId).single();
  if (!svcData) return null;
  const [{ data: sessData }, { data: volData }, { data: incData }] = await Promise.all([
    supabase.from("ccm_checkin_sessions").select(`*, room:children_rooms!room_id(name), cur:children_rooms!current_room_id(name), csd:children_sensitive_data(allergies, no_photo_flag)`).eq("service_id", serviceId).eq("church_id", churchId),
    supabase.from("ccm_volunteer_assignments").select(`*, room:children_rooms(name), profile:profiles(full_name, safety_clearance_date)`).eq("service_id", serviceId).eq("church_id", churchId),
    supabase.from("ccm_incidents").select("*").eq("service_id", serviceId).eq("church_id", churchId),
  ]);
  const sessions = (sessData ?? []).map((r) => mapSession({
    ...r,
    room_name: (r.room as { name: string } | null)?.name ?? "",
    current_room_name: (r.cur as { name: string } | null)?.name ?? null,
    allergies: (r.csd as { allergies: unknown } | null)?.allergies ?? [],
    no_photo_flag: (r.csd as { no_photo_flag: boolean } | null)?.no_photo_flag ?? false,
  }));
  const volunteers = (volData ?? []).map((r) => mapVolunteer({
    ...r,
    room_name: (r.room as { name: string } | null)?.name ?? "",
    full_name: (r.profile as { full_name: string } | null)?.full_name ?? "Unknown",
    safety_clearance_date: (r.profile as { safety_clearance_date: string | null } | null)?.safety_clearance_date ?? null,
  }));
  return {
    service: mapService(svcData as Parameters<typeof mapService>[0]),
    sessions, volunteerAssignments: volunteers,
    incidents: (incData ?? []).map(mapIncident),
    totalChildren: sessions.length, totalVolunteers: volunteers.length,
  };
}

// ── getChildProfile ───────────────────────────────────────────────────────────

export async function getChildProfile(
  session: ChurchAppSession,
  childProfileId: string,
): Promise<CcmChildProfile | null> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    return withLocalCcmReadFallback(async () => {
      const [profileRes, pickupsRes, restrictionsRes] = await Promise.all([
        queryTenantLocalDb<{
          id: string; full_name: string; member_number: string | null;
          safety_clearance_date: string | null;
          dob: string | null; photo_url: string | null; no_photo_flag: boolean;
          allergies: unknown; special_needs_notes: string | null; custody_notes: string | null;
        }>(
          `select p.id, p.full_name, p.member_number, p.safety_clearance_date::text,
                  csd.dob::text, csd.photo_url, coalesce(csd.no_photo_flag, false) as no_photo_flag,
                  coalesce(csd.allergies, '[]'::jsonb) as allergies,
                  csd.special_needs_notes, csd.custody_notes
           from public.profiles p
           left join public.children_sensitive_data csd
             on csd.child_profile_id = p.id and csd.church_id = p.church_id
           where p.id = $1 and p.church_id = $2`,
          [childProfileId, churchId],
        ),
        queryTenantLocalDb<{
          id: string; authorized_name: string; relationship: string;
          phone: string | null; photo_url: string | null;
          id_verified: boolean; is_primary: boolean; notes: string | null;
        }>(
          `select id, authorized_name, relationship, phone, photo_url,
                  id_verified, is_primary, notes
           from public.ccm_authorized_pickups
           where child_profile_id = $1 and church_id = $2
           order by is_primary desc, authorized_name asc`,
          [childProfileId, churchId],
        ),
        queryTenantLocalDb<{
          id: string; restricted_name: string; relationship: string | null;
          court_order_on_file: boolean; notes: string | null;
        }>(
          `select id, restricted_name, relationship, court_order_on_file, notes
           from public.ccm_custody_restrictions
           where child_profile_id = $1 and church_id = $2`,
          [childProfileId, churchId],
        ),
      ]);

      const p = profileRes.rows[0];
      if (!p) return null;
      const allergies = parseAllergies(p.allergies);
      return {
        profileId: p.id, churchId, childName: p.full_name,
        dob: p.dob, photoUrl: p.photo_url, noPhotoFlag: p.no_photo_flag,
        allergies, specialNeedsNotes: p.special_needs_notes, custodyNotes: p.custody_notes,
        memberNumber: p.member_number, clearanceDate: p.safety_clearance_date,
        authorizedPickups: pickupsRes.rows.map((r) => ({
          id: r.id, childProfileId, authorizedName: r.authorized_name,
          relationship: r.relationship as CcmAuthorizedPickup["relationship"],
          phone: r.phone, photoUrl: r.photo_url,
          idVerified: r.id_verified, isPrimary: r.is_primary, notes: r.notes,
        })),
        custodyRestrictions: restrictionsRes.rows.map((r) => ({
          id: r.id, childProfileId,
          restrictedName: r.restricted_name, relationship: r.relationship,
          courtOrderOnFile: r.court_order_on_file, notes: r.notes,
        } satisfies CcmCustodyRestriction)),
      };
    }, null);
  }

  const supabase = await createTenantServerClient();
  const [{ data: pData }, { data: pickData }, { data: restData }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, member_number, safety_clearance_date").eq("id", childProfileId).eq("church_id", churchId).single(),
    supabase.from("children_sensitive_data").select("dob, photo_url, no_photo_flag, allergies, special_needs_notes, custody_notes").eq("child_profile_id", childProfileId).eq("church_id", churchId).single(),
    supabase.from("ccm_authorized_pickups").select("*").eq("child_profile_id", childProfileId).eq("church_id", churchId).order("is_primary", { ascending: false }),
    supabase.from("ccm_custody_restrictions").select("*").eq("child_profile_id", childProfileId).eq("church_id", churchId),
  ]);
  if (!pData) return null;
  const csd = pickData as { dob: string | null; photo_url: string | null; no_photo_flag: boolean; allergies: unknown; special_needs_notes: string | null; custody_notes: string | null } | null;
  const allergies = parseAllergies(csd?.allergies ?? []);
  return {
    profileId: (pData as { id: string }).id, churchId,
    childName: (pData as { full_name: string }).full_name,
    dob: csd?.dob ?? null, photoUrl: csd?.photo_url ?? null,
    noPhotoFlag: csd?.no_photo_flag ?? false,
    allergies, specialNeedsNotes: csd?.special_needs_notes ?? null,
    custodyNotes: csd?.custody_notes ?? null,
    memberNumber: (pData as { member_number: string | null }).member_number ?? null,
    clearanceDate: (pData as { safety_clearance_date: string | null }).safety_clearance_date ?? null,
    authorizedPickups: ((restData ?? []) as Array<{
      id: string; authorized_name: string; relationship: string;
      phone: string | null; photo_url: string | null;
      id_verified: boolean; is_primary: boolean; notes: string | null;
    }>).map((r) => ({
      id: r.id, childProfileId,
      authorizedName: r.authorized_name,
      relationship: r.relationship as CcmAuthorizedPickup["relationship"],
      phone: r.phone, photoUrl: r.photo_url,
      idVerified: r.id_verified, isPrimary: r.is_primary, notes: r.notes,
    })),
    custodyRestrictions: [],
  };
}

// ── getCcmIncidents ───────────────────────────────────────────────────────────

export async function getCcmIncidents(
  session: ChurchAppSession,
  filters?: { serviceId?: string; followUpOnly?: boolean },
): Promise<CcmIncident[]> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    return withLocalCcmReadFallback(async () => {
      const conditions = ["church_id = $1"];
      const params: unknown[] = [churchId];
      if (filters?.serviceId) { params.push(filters.serviceId); conditions.push(`service_id = $${params.length}`); }
      if (filters?.followUpOnly) conditions.push("follow_up_required = true");
      const result = await queryTenantLocalDb<{
        id: string; service_id: string | null; session_id: string | null;
        child_name: string; incident_type: string; severity: string;
        description: string; actions_taken: string | null;
        guardian_notified: boolean; guardian_notified_at: string | null;
        follow_up_required: boolean; reported_by: string | null; created_at: string;
      }>(
        `select id, service_id, session_id, child_name, incident_type, severity,
                description, actions_taken, guardian_notified,
                guardian_notified_at::text, follow_up_required,
                reported_by, created_at::text
         from public.ccm_incidents
         where ${conditions.join(" and ")}
         order by created_at desc limit 100`,
        params,
      );
      return result.rows.map(mapIncident);
    }, []);
  }

  const supabase = await createTenantServerClient();
  let q = supabase.from("ccm_incidents").select("*").eq("church_id", churchId);
  if (filters?.serviceId) q = q.eq("service_id", filters.serviceId);
  if (filters?.followUpOnly) q = q.eq("follow_up_required", true);
  const { data } = await q.order("created_at", { ascending: false }).limit(100);
  return (data ?? []).map(mapIncident);
}

// ── getEmergencyRoster ────────────────────────────────────────────────────────

export async function getEmergencyRoster(
  session: ChurchAppSession,
  serviceId: string,
): Promise<EmergencyRosterData> {
  const churchId = session.appContext.church.id;
  const generatedAt = new Date().toISOString();

  if (shouldUseLocalTenantFallback()) {
    return withLocalCcmReadFallback(async () => {
      const [svcRes, entryRes] = await Promise.all([
        queryTenantLocalDb<{
          id: string; church_id: string; ministry_id: string; service_name: string;
          service_date: string; started_at: string; ended_at: string | null;
          status: string;
          checkin_session_status: string;
          checkin_session_starts_at: string | null;
          checkin_session_ends_at: string | null;
          checkin_session_token: string;
          checkin_session_enabled_at: string | null;
          checkin_session_closed_at: string | null;
          created_by: string | null; created_at: string;
        }>(
          `select id, church_id, ministry_id, service_name, service_date::text,
                  started_at::text, ended_at::text, status,
                  checkin_session_status,
                  checkin_session_starts_at::text,
                  checkin_session_ends_at::text,
                  checkin_session_token,
                  checkin_session_enabled_at::text,
                  checkin_session_closed_at::text,
                  created_by, created_at::text
           from public.ccm_services where id = $1 and church_id = $2`,
          [serviceId, churchId],
        ),
        queryTenantLocalDb<{
          child_name: string; room_name: string; allergies: unknown;
          guardian_name: string | null; checked_in_at: string;
        }>(
          `select s.child_name, cr.name as room_name,
                  coalesce(csd.allergies, '[]'::jsonb) as allergies,
                  s.guardian_name,
                  s.checked_in_at::text
           from public.ccm_checkin_sessions s
           join public.children_rooms cr on cr.id = s.current_room_id
           left join public.children_sensitive_data csd
             on csd.child_profile_id = s.child_profile_id and csd.church_id = s.church_id
           where s.service_id = $1 and s.church_id = $2
             and s.status = 'checked_in'
           order by cr.name asc, s.child_name asc`,
          [serviceId, churchId],
        ),
      ]);

      const service = svcRes.rows[0] ? mapService(svcRes.rows[0]) : null;
      const entries = entryRes.rows.map((r) => ({
        childName: r.child_name, roomName: r.room_name,
        criticalAllergies: criticalAllergyNames(parseAllergies(r.allergies)),
        guardianName: r.guardian_name, guardianPhone: null,
        checkedInAt: r.checked_in_at,
      }));
      return { service, entries, generatedAt };
    }, emptyEmergencyRoster());
  }

  const supabase = await createTenantServerClient();
  const { data: svcData } = await supabase.from("ccm_services").select("*").eq("id", serviceId).eq("church_id", churchId).single();
  const { data: sessData } = await supabase
    .from("ccm_checkin_sessions")
    .select(`child_name, guardian_name, checked_in_at, cur:children_rooms!current_room_id(name), csd:children_sensitive_data(allergies)`)
    .eq("service_id", serviceId).eq("church_id", churchId).eq("status", "checked_in");
  const service = svcData ? mapService(svcData as Parameters<typeof mapService>[0]) : null;
  const entries = (sessData ?? []).map((r) => ({
    childName: r.child_name,
    roomName: ((r.cur as unknown) as { name: string } | { name: string }[] | null) !== null
      ? (Array.isArray(r.cur) ? (r.cur as { name: string }[])[0]?.name : (r.cur as unknown as { name: string })?.name) ?? "Unknown"
      : "Unknown",
    criticalAllergies: criticalAllergyNames(parseAllergies(((r.csd as unknown) as { allergies: unknown } | { allergies: unknown }[] | null) !== null
      ? (Array.isArray(r.csd) ? (r.csd as { allergies: unknown }[])[0]?.allergies : (r.csd as unknown as { allergies: unknown })?.allergies) ?? []
      : [])),
    guardianName: r.guardian_name ?? null, guardianPhone: null,
    checkedInAt: r.checked_in_at,
  }));
  return { service, entries, generatedAt };
}
