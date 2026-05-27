// ─────────────────────────────────────────────────────────────────────────────
// Children's Church Ministry (CCM) — Shared TypeScript types
// All monetary and PII values: strings from DB, never numbers for phone/IDs.
// PIN is NEVER present in any type returned from reads.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChildrenRoom } from "@/lib/ministry-forge-types";

// ── Service instances ─────────────────────────────────────────────────────────

export type CcmServiceStatus = "open" | "closed" | "emergency";

export type CcmCheckinSessionLifecycleStatus =
  | "draft"
  | "enabled"
  | "paused"
  | "closed";

export type CcmService = {
  id: string;
  churchId: string;
  ministryId: string;
  serviceName: string;
  serviceDate: string;      // YYYY-MM-DD
  startedAt: string;
  endedAt: string | null;
  status: CcmServiceStatus;
  checkinSessionStatus: CcmCheckinSessionLifecycleStatus;
  checkinSessionStartsAt: string | null;
  checkinSessionEndsAt: string | null;
  checkinSessionToken: string;
  checkinSessionEnabledAt: string | null;
  checkinSessionClosedAt: string | null;
  checkinSessionOverrideReason: string | null;
  checkinSessionOverrideBy: string | null;
  checkinSessionOverrideAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

// ── Allergies ─────────────────────────────────────────────────────────────────

export type AllergySeverity = "anaphylactic" | "moderate" | "mild";

export type Allergy = {
  name: string;
  severity: AllergySeverity;
};

// ── Check-in sessions ─────────────────────────────────────────────────────────

export type CcmSessionStatus =
  | "checked_in"
  | "checked_out"
  | "late_pickup"
  | "emergency"
  | "transferred";

export type CcmCheckinSession = {
  id: string;
  serviceId: string;
  roomId: string;
  roomName: string;
  childProfileId: string | null;
  childName: string;
  guardianName: string | null;
  // pin_hash is NEVER included — PIN is never returned from reads
  qrToken: string;
  status: CcmSessionStatus;
  currentRoomId: string | null;
  currentRoomName: string | null;
  isFirstVisit: boolean;
  checkedInAt: string;
  checkedOutAt: string | null;
  releasedToName: string | null;
  silentPageSentAt: string | null;
  latePickupNotifiedAt: string | null;
  // Joined from children_sensitive_data
  criticalAllergies: string[];       // names of anaphylactic + moderate allergies for badge/UI
  allAllergies: Allergy[];
  noPhotoFlag: boolean;
};

// Returned ONCE when a new check-in is created. pin is the plaintext PIN
// for badge printing only — it is not stored anywhere after this response.
export type CcmCheckinResult = {
  session: CcmCheckinSession;
  pin: string;            // plaintext PIN for badge printing; discard after use
  pinForGuardian: string; // same value — show on guardian claim screen
};

// ── Authorized pickups ────────────────────────────────────────────────────────

export type PickupRelationship =
  | "parent"
  | "grandparent"
  | "sibling"
  | "aunt_uncle"
  | "family_friend"
  | "caregiver"
  | "other";

export type CcmAuthorizedPickup = {
  id: string;
  childProfileId: string;
  authorizedName: string;
  relationship: PickupRelationship;
  phone: string | null;
  photoUrl: string | null;
  idVerified: boolean;
  isPrimary: boolean;
  notes: string | null;
};

// ── Custody restrictions ──────────────────────────────────────────────────────
// ADMIN-ONLY: never exposed in list views or non-admin UI paths.

export type CcmCustodyRestriction = {
  id: string;
  childProfileId: string;
  restrictedName: string;
  relationship: string | null;
  courtOrderOnFile: boolean;
  notes: string | null;  // encrypted in prod
};

// ── Volunteer assignments ─────────────────────────────────────────────────────

export type VolunteerRole =
  | "lead_teacher"
  | "assistant"
  | "floater"
  | "security"
  | "greeter";

export type CcmVolunteerAssignment = {
  id: string;
  serviceId: string;
  roomId: string;
  roomName: string;
  profileId: string;
  volunteerName: string;
  role: VolunteerRole;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  backgroundCheckVerified: boolean;
  // Joined from profiles
  clearanceDate: string | null;
  clearanceExpiringSoon: boolean;
};

// ── Incidents ─────────────────────────────────────────────────────────────────

export type IncidentType =
  | "medical"
  | "behavioral"
  | "security"
  | "property"
  | "near_miss"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type CcmIncident = {
  id: string;
  serviceId: string | null;
  sessionId: string | null;
  childName: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  description: string;
  actionsTaken: string | null;
  guardianNotified: boolean;
  guardianNotifiedAt: string | null;
  followUpRequired: boolean;
  reportedBy: string | null;
  createdAt: string;
};

// ── Room status (dashboard aggregate) ────────────────────────────────────────

export type RatioStatus = "safe" | "warning" | "alert";

export type CcmRoomStatus = {
  room: ChildrenRoom;
  activeSessions: CcmCheckinSession[];
  confirmedVolunteers: CcmVolunteerAssignment[];
  childCount: number;
  volunteerCount: number;
  actualRatio: number;
  ratioStatus: RatioStatus;
  twoAdultRuleMet: boolean;          // >= 2 confirmed (checked_in_at set) volunteers
  hasExpiredBackgroundChecks: boolean;
};

// ── Dashboard aggregate ───────────────────────────────────────────────────────

export type CcmDashboardData = {
  service: CcmService | null;
  roomStatuses: CcmRoomStatus[];
  totalCheckedIn: number;
  totalCheckedOut: number;
  latePickups: CcmCheckinSession[];
  openIncidents: CcmIncident[];
};

// ── Child profile (PII) ───────────────────────────────────────────────────────

export type CcmChildProfile = {
  profileId: string;
  churchId: string;
  childName: string;
  dob: string | null;             // YYYY-MM-DD
  photoUrl: string | null;
  noPhotoFlag: boolean;
  allergies: Allergy[];
  specialNeedsNotes: string | null;
  custodyNotes: string | null;
  authorizedPickups: CcmAuthorizedPickup[];
  custodyRestrictions: CcmCustodyRestriction[];  // admin-only
  memberNumber: string | null;
  clearanceDate: string | null;
};

// ── Emergency roster (stripped for print/offline) ────────────────────────────

export type EmergencyRosterEntry = {
  childName: string;
  roomName: string;
  criticalAllergies: string[];  // anaphylactic + moderate only
  guardianName: string | null;
  guardianPhone: string | null;
  checkedInAt: string;
};

export type EmergencyRosterData = {
  service: CcmService | null;
  entries: EmergencyRosterEntry[];
  generatedAt: string;
};

// ── Service roster (full, for reports) ───────────────────────────────────────

export type CcmRosterData = {
  service: CcmService;
  sessions: CcmCheckinSession[];
  volunteerAssignments: CcmVolunteerAssignment[];
  incidents: CcmIncident[];
  totalChildren: number;
  totalVolunteers: number;
};

// ── Action input types ────────────────────────────────────────────────────────

export type OpenServiceInput = {
  ministryId: string;
  serviceName: string;
  serviceDate: string;
};

export type CheckinChildInput = {
  serviceId: string;
  roomId: string;
  childName: string;
  childProfileId?: string;
  guardianName?: string;
  guardianPhone?: string;
  isFirstVisit?: boolean;
};

export type CheckoutChildInput = {
  sessionId: string;
  providedPin: string;
  releasedToName: string;
};

export type FileIncidentInput = {
  serviceId?: string;
  sessionId?: string;
  childName: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  description: string;
  actionsTaken?: string;
  guardianNotified?: boolean;
  followUpRequired?: boolean;
};

export type UpsertPickupInput = {
  id?: string;
  childProfileId: string;
  authorizedName: string;
  relationship: PickupRelationship;
  phone?: string;
  photoUrl?: string;
  idVerified?: boolean;
  isPrimary?: boolean;
  notes?: string;
};

export type AddCustodyRestrictionInput = {
  childProfileId: string;
  restrictedName: string;
  relationship?: string;
  courtOrderOnFile?: boolean;
  notes?: string;
};

export type AssignVolunteerInput = {
  serviceId: string;
  roomId: string;
  profileId: string;
  role?: VolunteerRole;
  backgroundCheckVerified?: boolean;
};

export type UpdateChildProfileInput = {
  childProfileId: string;
  dob?: string;
  photoUrl?: string;
  noPhotoFlag?: boolean;
  allergies?: Allergy[];
  specialNeedsNotes?: string;
  custodyNotes?: string;
};
