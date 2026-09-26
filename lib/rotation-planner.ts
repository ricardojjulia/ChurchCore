/**
 * Rotation planner (Service Planning Story 3): ranks volunteers for an open
 * position and proposes a fill for a whole plan. Pure functions over the
 * pool that get_volunteer_pool() returns, so the rules are unit-testable and
 * the server actions stay thin.
 *
 * Eligibility (a volunteer is shown but not suggested when any applies):
 *  - not a known volunteer (no volunteer profile and never scheduled), so
 *    auto-fill never drafts a church member who hasn't volunteered
 *  - blocked on the service date (volunteer_blocked_dates)
 *  - already serving on that date (no double-booking)
 *  - at their monthly limit (volunteer_profiles.max_services_per_month)
 *  - at the burnout threshold: BURNOUT_SHIFT_THRESHOLD non-declined shifts in
 *    the 30 days before the service (the same rule assignVolunteerAction
 *    enforces via lib/burnout-calculator.ts)
 *
 * Ranking among eligible volunteers: more required skills matched, then the
 * lightest recent load, then the longest since they last served (never
 * served counts as most rested), then name.
 */
import type { VolunteerPoolEntry } from "@/lib/volunteer-types";

export const BURNOUT_SHIFT_THRESHOLD = 3;

export type IneligibleReason = "not_volunteer" | "blocked" | "serving_on_date" | "monthly_limit" | "high_load";

export type RankedVolunteer = {
  profileId: string;
  fullName: string;
  eligible: boolean;
  ineligibleReasons: IneligibleReason[];
  matchedSkills: number;
  requiredSkills: number;
  recentShiftCount: number;
  lastServedAt: string | null;
  roleServedCount: number;
  /** Short, human-readable explanations shown as chips in the UI. */
  reasons: string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function countMatchedSkills(volunteerSkills: string[], requiredSkills: string[]): number {
  const have = new Set(volunteerSkills.map((skill) => skill.trim().toLowerCase()));
  return requiredSkills.filter((skill) => have.has(skill.trim().toLowerCase())).length;
}

function ineligibleReasonsFor(entry: VolunteerPoolEntry): IneligibleReason[] {
  const reasons: IneligibleReason[] = [];
  if (!entry.isVolunteer) reasons.push("not_volunteer");
  if (entry.isBlocked) reasons.push("blocked");
  if (entry.servingOnDate) reasons.push("serving_on_date");
  if (entry.maxServicesPerMonth != null && entry.monthShiftCount >= entry.maxServicesPerMonth) {
    reasons.push("monthly_limit");
  }
  if (entry.recentShiftCount >= BURNOUT_SHIFT_THRESHOLD) reasons.push("high_load");
  return reasons;
}

export const INELIGIBLE_LABEL: Record<IneligibleReason, string> = {
  not_volunteer: "Not a volunteer yet",
  blocked: "Unavailable that day",
  serving_on_date: "Already serving that day",
  monthly_limit: "At monthly limit",
  high_load: `${BURNOUT_SHIFT_THRESHOLD}+ shifts in 30 days`,
};

/** "N shift(s) in 30 days" — the one wording for recent load across the UI. */
export function recentShiftsLabel(count: number): string {
  return `${count} shift${count === 1 ? "" : "s"} in 30 days`;
}

function lastServedLabel(lastServedAt: string | null, serviceDate: string): string {
  if (!lastServedAt) return "Hasn't served yet";
  const days = Math.max(0, Math.round((Date.parse(serviceDate) - Date.parse(lastServedAt)) / MS_PER_DAY));
  if (days < 7) return `Served ${days} day${days === 1 ? "" : "s"} before this service`;
  const weeks = Math.round(days / 7);
  return `Last served ${weeks} week${weeks === 1 ? "" : "s"} before this service`;
}

export function rankVolunteersForPosition(
  pool: VolunteerPoolEntry[],
  requiredSkills: string[],
  serviceDate: string,
): RankedVolunteer[] {
  const ranked = pool.map((entry): RankedVolunteer => {
    const ineligibleReasons = ineligibleReasonsFor(entry);
    const matchedSkills = countMatchedSkills(entry.skills, requiredSkills);
    const reasons: string[] = [];
    if (requiredSkills.length > 0) reasons.push(`${matchedSkills}/${requiredSkills.length} skills`);
    reasons.push(lastServedLabel(entry.lastServedAt, serviceDate));
    reasons.push(recentShiftsLabel(entry.recentShiftCount));
    if (entry.roleServedCount > 0) {
      reasons.push(`Served this role ${entry.roleServedCount}×`);
    }
    for (const reason of ineligibleReasons) reasons.push(INELIGIBLE_LABEL[reason]);

    return {
      profileId: entry.profileId,
      fullName: entry.fullName,
      eligible: ineligibleReasons.length === 0,
      ineligibleReasons,
      matchedSkills,
      requiredSkills: requiredSkills.length,
      recentShiftCount: entry.recentShiftCount,
      lastServedAt: entry.lastServedAt,
      roleServedCount: entry.roleServedCount,
      reasons,
    };
  });

  return ranked.sort(compareRanked);
}

function compareRanked(a: RankedVolunteer, b: RankedVolunteer): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.matchedSkills !== b.matchedSkills) return b.matchedSkills - a.matchedSkills;
  if (a.recentShiftCount !== b.recentShiftCount) return a.recentShiftCount - b.recentShiftCount;
  const aLast = a.lastServedAt ? Date.parse(a.lastServedAt) : Number.NEGATIVE_INFINITY;
  const bLast = b.lastServedAt ? Date.parse(b.lastServedAt) : Number.NEGATIVE_INFINITY;
  if (aLast !== bLast) return aLast - bLast;
  return a.fullName.localeCompare(b.fullName);
}

export type OpenSlot = {
  positionId: string;
  roleTypeId: string | null;
  roleName: string;
  requiredSkills: string[];
};

export type ProposedAssignment = {
  positionId: string;
  roleName: string;
  profileId: string | null;
  fullName: string | null;
  reasons: string[];
};

/**
 * Proposes one volunteer per open slot, in slot order. A volunteer is proposed
 * at most once per plan (and a plan is one service date). Only volunteers with
 * at least one required skill are proposed for a slot that requires skills; a
 * slot with no eligible match is left empty for a human to decide.
 */
export function proposePlanFill(
  slots: OpenSlot[],
  poolForRole: (roleTypeId: string | null) => VolunteerPoolEntry[],
  serviceDate: string,
): ProposedAssignment[] {
  const used = new Set<string>();

  return slots.map((slot) => {
    const pool = poolForRole(slot.roleTypeId).filter((entry) => !used.has(entry.profileId));

    const pick = rankVolunteersForPosition(pool, slot.requiredSkills, serviceDate).find(
      (candidate) =>
        candidate.eligible && (slot.requiredSkills.length === 0 || candidate.matchedSkills > 0),
    );

    if (!pick) {
      return { positionId: slot.positionId, roleName: slot.roleName, profileId: null, fullName: null, reasons: [] };
    }

    used.add(pick.profileId);
    return {
      positionId: slot.positionId,
      roleName: slot.roleName,
      profileId: pick.profileId,
      fullName: pick.fullName,
      reasons: pick.reasons,
    };
  });
}

/**
 * The shift window for an assignment on a plan: from the service time (or
 * 09:00 when the plan has none), for SHIFT_LENGTH_HOURS. volunteer_shifts
 * requires ends_at > starts_at, which the old inline computation violated
 * whenever a plan had a service time (it used the same value for both).
 */
export const SHIFT_LENGTH_HOURS = 2;

export function shiftWindowForPlan(serviceDate: string, serviceTime: string | null): { startsAt: string; endsAt: string } {
  const [hours, minutes] = (serviceTime ?? "09:00").split(":").map((part) => Number.parseInt(part, 10));
  const start = new Date(Date.UTC(1970, 0, 1, hours || 0, minutes || 0));
  const end = new Date(start.getTime() + SHIFT_LENGTH_HOURS * 60 * 60 * 1000);
  const clock = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
  const endDate = new Date(`${serviceDate}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + (end.getUTCDate() - 1));
  return {
    startsAt: `${serviceDate}T${clock(start)}`,
    endsAt: `${endDate.toISOString().slice(0, 10)}T${clock(end)}`,
  };
}
