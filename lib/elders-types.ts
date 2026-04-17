// Shared types for Phase 4: Elders Discernment Room + Pastor Council Forge.
// No server-only imports — safe for client components.

// ── Discernment session ──────────────────────────────────────

export type DiscernmentSessionStatus = "open" | "voting" | "closed" | "prayer";

export type DiscernmentSession = {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  status: DiscernmentSessionStatus;
  outcome: string | null;
  createdByName: string | null;
  createdAt: string;
  prayerRequestCount: number;
};

// ── Prayer wall ──────────────────────────────────────────────

export type PrayerRequest = {
  id: string;
  title: string;
  description: string | null;
  isAnonymous: boolean;
  requestedByName: string | null; // null when anonymous or when caller lacks access
  prayedCount: number;
  hasPrayed: boolean; // current user has already acknowledged this request
  createdAt: string;
};

// ── Elder notes ──────────────────────────────────────────────

export type ElderNote = {
  id: string;
  profileId: string | null;
  subjectName: string | null; // full_name of the subject profile, if any
  content: string;
  isConfidential: boolean;
  createdByName: string | null;
  createdAt: string;
};

// ── Discernment Room page data ───────────────────────────────

export type DiscernmentRoomData = {
  sessions: DiscernmentSession[];
  recentNotes: ElderNote[];
};

export type DiscernmentSessionDetail = {
  session: DiscernmentSession;
  prayerRequests: PrayerRequest[];
  elderNotes: ElderNote[];
};

// ── Council notes ────────────────────────────────────────────

export type CouncilNoteType =
  | "general"
  | "sermon_outline"
  | "series_plan"
  | "council_minutes"
  | "sabbath_reflection";

export const COUNCIL_NOTE_TYPE_LABELS: Record<CouncilNoteType, string> = {
  general: "General",
  sermon_outline: "Sermon Outline",
  series_plan: "Series Plan",
  council_minutes: "Council Minutes",
  sabbath_reflection: "Sabbath Reflection",
};

export type CouncilNote = {
  id: string;
  title: string;
  content: string | null;
  noteType: CouncilNoteType;
  version: number;
  createdByName: string | null;
  lastEditedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CouncilForgeData = {
  notes: CouncilNote[];
};

// ── Canonical AI disclaimer ──────────────────────────────────
// Must appear on every AI-generated surface per §6 of
// docs/plans/advanced-ministry-elders-pastor.md.
export const ELDER_AI_DISCLAIMER =
  "This is an assistive tool only. It never replaces prayer, Scripture study, or human pastoral discernment. AI suggestions require elder review before any decision is made or shared.";

// ── Status metadata ──────────────────────────────────────────

export const SESSION_STATUS_LABEL: Record<DiscernmentSessionStatus, string> = {
  open: "Open",
  voting: "Voting",
  closed: "Closed",
  prayer: "In Prayer",
};

export const SESSION_STATUS_COLOR: Record<DiscernmentSessionStatus, string> = {
  open: "teal",
  voting: "orange",
  closed: "gray",
  prayer: "violet",
};
