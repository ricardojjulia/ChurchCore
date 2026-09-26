export type ServicePlanStatus = "draft" | "published" | "complete" | "cancelled";
export type ConfirmationStatus = "pending" | "confirmed" | "declined" | "substitute";

export type ServicePlan = {
  id: string;
  churchId: string;
  eventId: string | null;
  name: string;
  serviceDate: string;
  serviceTime: string | null;
  serviceType: "worship" | "prayer" | "youth" | "special_event" | "class" | "other";
  scriptureReference: string | null;
  sermonTitle: string | null;
  sermonSpeaker: string | null;
  status: ServicePlanStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type ServicePlanEventOption = {
  id: string;
  title: string;
  startsAt: string;
};

export type ServicePlanLinkedEventOps = {
  eventId: string;
  eventTitle: string;
  rosterProfileIds: string[];
  attendanceProfileIds: string[];
};

export type ServicePlanItem = {
  id: string;
  planId: string;
  churchId: string;
  startsAt: string | null;
  endsAt: string | null;
  title: string;
  itemType: "segment" | "song" | "reading" | "prayer" | "sermon" | "announcement" | "other";
  leaderName: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  sortOrder: number;
  songKey: string | null;
  durationSeconds: number | null;
  artist: string | null;
};

export type ServicePlanPosition = {
  id: string;
  planId: string;
  churchId: string;
  roleTypeId: string;
  // Live-joined from service_plan_role_types.name — never a stored copy, so
  // a role-type rename is reflected immediately on every plan that
  // references it. Contrast with VolunteerShift.title, which IS a
  // point-in-time snapshot (see below).
  roleName: string;
  requiredSkills: string[];
  quantityNeeded: number;
  ministryId: string | null;
  sortOrder: number;
};

// A church-wide, reusable service-plan role definition (e.g. "Sound Tech",
// "Greeter"). Positions reference a role type by id; VolunteerShift.title
// remains a separate point-in-time snapshot taken at assignment time, so
// renaming or deactivating a role type never rewrites already-assigned
// shift history.
export type ServicePlanRoleType = {
  id: string;
  churchId: string;
  name: string;
  description: string | null;
  requiredSkills: string[];
  isActive: boolean;
  createdAt: string;
};

export type VolunteerShift = {
  id: string;
  churchId: string;
  eventId: string | null;
  planId: string | null;
  positionId: string | null;
  assignedUserId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  confirmationStatus: ConfirmationStatus;
  declineReason: string | null;
  respondedAt: string | null;
  volunteerNotes: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  // joined
  volunteerName: string | null;
  volunteerEmail: string | null;
  volunteerPhone: string | null;
};

export type ServicePlanDetail = {
  plan: ServicePlan;
  runOfService: ServicePlanItem[];
  positions: Array<ServicePlanPosition & {
    shifts: VolunteerShift[];
    filled: number;
    pending: number;
  }>;
  unfilledCount: number;
  confirmedCount: number;
  pendingCount: number;
};

export type ServicePlanListEntry = ServicePlan & {
  positionCount: number;
  filledCount: number;
  confirmedCount: number;
};

export type VolunteerPoolEntry = {
  profileId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  skills: string[];
  /** Admin-set cap on services per month; null = no cap. */
  maxServicesPerMonth: number | null;
  /** Blocked (volunteer_blocked_dates) on the service date. */
  isBlocked: boolean;
  /** Already holds a non-declined shift on the service date. */
  servingOnDate: boolean;
  /** Non-declined shifts in the 30 days up to the service date. */
  recentShiftCount: number;
  /** Non-declined shifts in the service date's calendar month. */
  monthShiftCount: number;
  /** Start of the most recent non-declined shift before the service date. */
  lastServedAt: string | null;
  /** Non-declined shifts in positions of the requested role type. */
  roleServedCount: number;
  totalHours: number;
};

export type VolunteerDirectoryEntry = {
  profileId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  skills: string[];
  /** Admin-set cap on services per month; null = no cap. */
  maxServicesPerMonth: number | null;
  totalHours: number;
  shiftsThisYear: number;
  lastServedDate: string | null;
  backgroundCheckDate: string | null;
};

export type ServicePlanTemplate = {
  id: string;
  name: string;
  positions: Array<{ roleName: string; quantity: number }>;
  isActive: boolean;
};

export type MemberScheduleEntry = {
  shiftId: string;
  planName: string;
  serviceDate: string;
  roleName: string;
  startsAt: string;
  endsAt: string;
  confirmationStatus: ConfirmationStatus;
};
