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
  | "missions";

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
