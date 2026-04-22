// Shared types and pure helpers for Ministry Forge.
// This file has no server-only imports — safe for use in client components.

export type MinistryType =
  | "outreach"
  | "discipleship"
  | "worship"
  | "care"
  | "administration"
  | "youth"
  | "children"
  | "missions"
  | "men"
  | "women"
  | "marriage"
  | "young_adult"
  | "education";

// Ministry types that have dedicated track management panels
export const TRACK_PANEL_TYPES = new Set<MinistryType>([
  "worship",
  "men",
  "women",
  "marriage",
  "missions",
  "children",
  "youth",
  "young_adult",
  "education",
  "outreach",
]);

export function hasTrackPanel(type: MinistryType | null): type is MinistryType {
  return type !== null && TRACK_PANEL_TYPES.has(type);
}

export type MinistryHealthBand = "green" | "yellow" | "red";

export function healthBand(score: number): MinistryHealthBand {
  if (score >= 7.5) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

export type MinistryForgeEntry = {
  id: string;
  name: string;
  ministryType: MinistryType | null;
  visionStatement: string | null;
  scripturalAnchor: string[];
  healthScore: number;
  lastHealthAssessment: string | null;
  memberCount: number;
  leaderProfileId: string | null;
  leaderName: string | null;
};

export type MinistryMember = {
  profileId: string;
  fullName: string;
  role: string;
  displayTitle: string | null;
  spiritualGifts: string[] | null;
  ministryCount: number;
};

export type HealthHistoryEntry = {
  id: string;
  healthScore: number;
  assessmentDate: string;
  notes: string | null;
};

export type KingdomImpactEntry = {
  id: string;
  impactType: string;
  description: string | null;
  occurredAt: string;
  createdByName: string | null;
};

export type MinistryForgeDetail = {
  ministry: MinistryForgeEntry;
  members: MinistryMember[];
  healthHistory: HealthHistoryEntry[];
  recentImpacts: KingdomImpactEntry[];
  burnoutWarnings: string[];
};

export type MinistryForgeListData = {
  ministries: MinistryForgeEntry[];
};

export type MemberMinistryEntry = {
  id: string;
  name: string;
  ministryType: MinistryType | null;
  visionStatement: string | null;
  role: string;
  memberCount: number;
};

export type MemberMinistriesData = {
  ministries: MemberMinistryEntry[];
  allChurchMinistries: Array<{ id: string; name: string; ministryType: MinistryType | null }>;
};

// ── Phase 3: AI Volunteer Matcher + Burnout Guardian ─────────

export type MatchSuggestionStatus = "pending" | "approved" | "rejected";

export type VolunteerMatchSuggestion = {
  id: string;
  ministryId: string;
  profileId: string;
  profileName: string;
  spiritualGifts: string[] | null;
  currentLoad: number;
  matchScore: number; // 0–100
  reasonText: string | null;
  aiGenerated: boolean;
  status: MatchSuggestionStatus;
  createdAt: string;
  reviewedAt: string | null;
};

export type BurnoutAlertSeverity = "low" | "medium" | "high";
export type BurnoutAlertType = "high_load" | "overlapping_events" | "rest_needed";

export type BurnoutAlert = {
  id: string;
  profileId: string;
  profileName: string;
  ministryId: string | null;
  alertType: BurnoutAlertType;
  message: string;
  severity: BurnoutAlertSeverity;
  acknowledged: boolean;
  createdAt: string;
};

export type VolunteerMatcherData = {
  suggestions: VolunteerMatchSuggestion[];
  burnoutAlerts: BurnoutAlert[];
};

export const BURNOUT_THRESHOLD_MEDIUM = 3; // > 3 ministries → medium
export const BURNOUT_THRESHOLD_HIGH = 5;   // > 5 ministries → high

export function burnoutSeverity(load: number): BurnoutAlertSeverity | null {
  if (load > BURNOUT_THRESHOLD_HIGH) return "high";
  if (load > BURNOUT_THRESHOLD_MEDIUM) return "medium";
  return null;
}

/** Canonical AI disclaimer — must appear on every AI-generated surface */
export const AI_ASSISTIVE_DISCLAIMER =
  "This is an assistive tool only. It does not replace prayer, pastoral discernment, or human calling. All suggestions require human review and approval before any assignment is made.";

// ── Phase 4: Ministry Track Panel Types ──────────────────────────────────────

export type WorshipSong = {
  id: string;
  title: string;
  artist: string | null;
  songKey: string | null;
  tempo: string | null;
  tags: string[];
  lastUsedAt: string | null;
};

export type WorshipRehearsal = {
  id: string;
  scheduledAt: string;
  notes: string | null;
  rsvpCount: number;
  songIds: string[];
};

export type WorshipTrackData = {
  songs: WorshipSong[];
  rehearsals: WorshipRehearsal[];
};

export type MentorshipPair = {
  id: string;
  mentorId: string;
  mentorName: string;
  menteeId: string;
  menteeName: string;
  status: string;
  startedAt: string | null;
  notes: string | null;
};

export type DiscipleshipGroup = {
  id: string;
  name: string;
  leaderId: string | null;
  leaderName: string | null;
  cadence: string | null;
  isOpen: boolean;
  memberCount: number;
};

export type MensTrackData = {
  mentorshipPairs: MentorshipPair[];
  discipleshipGroups: DiscipleshipGroup[];
};

export type LifeStageCircle = {
  id: string;
  name: string;
  lifeStage: string;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
  meetingCadence: string | null;
};

export type SupportPairing = {
  id: string;
  supporterId: string;
  supporterName: string;
  supportedId: string;
  supportedName: string;
  pairingReason: string | null;
  status: string;
};

export type WomensTrackData = {
  lifeStageCircles: LifeStageCircle[];
  supportPairings: SupportPairing[];
};

export type MentorCouple = {
  id: string;
  partner1Id: string;
  partner1Name: string;
  partner2Id: string | null;
  partner2Name: string | null;
  coupleName: string | null;
  yearsMarried: number | null;
  isAvailable: boolean;
  cohortFocus: string | null;
};

export type MarriageCohort = {
  id: string;
  name: string;
  cohortStage: string;
  mentorCoupleId: string | null;
  mentorCoupleName: string | null;
  coupleCount: number;
};

export type MarriageTrackData = {
  mentorCouples: MentorCouple[];
  cohorts: MarriageCohort[];
};

export type MissionPartner = {
  id: string;
  name: string;
  region: string | null;
  focusArea: string | null;
  relationshipStatus: string;
  contactName: string | null;
  contactEmail: string | null;
};

export type MissionTrip = {
  id: string;
  name: string;
  destination: string | null;
  departsAt: string | null;
  returnsAt: string | null;
  status: string;
  participantCount: number;
  hoursServed: number;
  peopleReached: number;
  impactNotes: string | null;
  partnerId: string | null;
  partnerName: string | null;
};

export type MissionsTrackData = {
  partners: MissionPartner[];
  trips: MissionTrip[];
};

// ── Phase 5: Advanced Track Panel Types ──────────────────────────────────────

// Children's Ministry
export type ChildrenRoom = {
  id: string;
  name: string;
  ageMin: number | null;
  ageMax: number | null;
  capacity: number;
  targetRatio: number;
  isActive: boolean;
};

export type ChildrenCheckin = {
  id: string;
  roomId: string;
  roomName: string;
  childName: string;
  guardianName: string | null;
  checkedInAt: string;
  checkedOutAt: string | null;
  leaderCount: number;
  serviceDate: string;
};

export type ChildrenRoomSafety = {
  roomId: string;
  roomName: string;
  capacity: number;
  targetRatio: number;
  currentChildren: number;
  currentLeaders: number;
  actualRatio: number;      // children per leader
  ratioStatus: "safe" | "warning" | "alert";  // < target = safe, +10% = warning, exceeded = alert
};

export type ChildrenTrackData = {
  rooms: ChildrenRoom[];
  recentCheckins: ChildrenCheckin[];
  safetySnapshot: ChildrenRoomSafety[];
  backgroundChecksDue: Array<{ profileId: string; name: string; clearanceDate: string | null }>;
};

// Youth Ministry
export type YouthMilestone = {
  id: string;
  name: string;
  description: string | null;
  milestoneOrder: number;
  isRequired: boolean;
};

export type YouthStudent = {
  profileId: string;
  name: string;
  graduationYear: number | null;
  completedMilestoneIds: string[];
  completedCount: number;
  totalRequired: number;
  readinessPercent: number;     // 0–100
  alertLevel: "on_track" | "at_risk" | "critical";
};

export type YouthTrackData = {
  milestones: YouthMilestone[];
  students: YouthStudent[];
};

// Young Adults Ministry
export type CareerMentorship = {
  id: string;
  mentorId: string;
  mentorName: string;
  menteeId: string;
  menteeName: string;
  industry: string | null;
  focusArea: string | null;
  status: string;
  startedAt: string | null;
};

export type YoungAdultTrackData = {
  careerMentorships: CareerMentorship[];
  seekingMentors: Array<{ profileId: string; name: string; industry: string | null }>;
};

// Education / Discipleship Track
export type EducationCourse = {
  id: string;
  title: string;
  curriculumArea: string;
  description: string | null;
  durationWeeks: number | null;
  isActive: boolean;
  courseOrder: number;
  enrolledCount: number;
  completedCount: number;
};

export type MemberDoctrinalProgress = {
  profileId: string;
  name: string;
  completedCourseIds: string[];
  completedAreas: string[];     // curriculum_area values completed at least once
  totalCourses: number;
  completedCount: number;
  coveragePercent: number;      // % of curriculum areas covered
};

export type EducationTrackData = {
  courses: EducationCourse[];
  memberProgress: MemberDoctrinalProgress[];
};

// Outreach Ministry
export type OutreachEvent = {
  id: string;
  name: string;
  eventDate: string;
  location: string | null;
  zoneName: string | null;
  volunteerCount: number;
  peopleServed: number;
  status: string;
};

export type OutreachZone = {
  id: string;
  zoneName: string;
  description: string | null;
  totalEvents: number;
  totalVolunteers: number;
  totalServed: number;
  lastEventDate: string | null;
  coverageLevel: "low" | "medium" | "high";
};

export type OutreachTrackData = {
  events: OutreachEvent[];
  zones: OutreachZone[];
  totalVolunteerHours: number;
  totalPeopleServed: number;
};

// Stewardship aggregates
export type DiscipleshipVelocity = {
  leaderCount: number;
  avgDaysToLeader: number | null;
  minDays: number | null;
  maxDays: number | null;
};

export type BurnoutCandidate = {
  profileId: string;
  fullName: string;
  distinctTrackCount: number;
  activeTracks: string[];
};

export type MarriagePulseEntry = {
  theme: string;
  avgSentiment: number;
  responseCount: number;
  weekOf: string;
};
