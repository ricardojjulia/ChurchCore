import {
  createReadinessSummary,
  readinessCompletionStateFor,
  readinessSeverityFor,
  readinessStatusFor,
  type ReadinessSummary,
} from "@/lib/readiness-contract";

export type ChurchSetupReadinessMetrics = {
  missingSettings: number;
};

export type AccountRequestReadinessMetrics = {
  pendingAccountRequests: number;
};

export type PeopleReadinessMetrics = {
  incompleteProfiles: number;
  unassignedHouseholds: number;
};

export type EventReadinessMetrics = {
  upcomingEvents: number;
  eventsWithoutRoster: number;
};

export type VolunteerReadinessMetrics = {
  openVolunteerShifts: number;
  unassignedVolunteerShifts: number;
};

export function buildChurchSetupReadinessSummary({
  missingSettings,
}: ChurchSetupReadinessMetrics): ReadinessSummary {
  const status = readinessStatusFor(missingSettings >= 3, missingSettings > 0);

  return createReadinessSummary({
    id: "church-setup",
    module: "setup",
    title: "Church setup",
    description: "Confirm tenant profile, contact, website, address, and public summary.",
    status,
    severity: readinessSeverityFor(status, missingSettings),
    issueCount: missingSettings,
    completionState: readinessCompletionStateFor(status),
    recommendedAction:
      missingSettings === 0
        ? "No action needed."
        : "Open church settings and complete the missing setup fields.",
    target: { route: "/app/church-admin/settings" },
    detail:
      missingSettings === 0
        ? "Core church settings are complete."
        : `${missingSettings} setup field${missingSettings === 1 ? "" : "s"} still need attention.`,
  });
}

export function buildAccountRequestsReadinessSummary({
  pendingAccountRequests,
}: AccountRequestReadinessMetrics): ReadinessSummary {
  const status = readinessStatusFor(pendingAccountRequests > 5, pendingAccountRequests > 0);

  return createReadinessSummary({
    id: "portal-requests",
    module: "accounts",
    title: "Portal account requests",
    description: "Approve or reject member portal access requests.",
    status,
    severity: readinessSeverityFor(status, pendingAccountRequests),
    issueCount: pendingAccountRequests,
    completionState: readinessCompletionStateFor(status),
    recommendedAction:
      pendingAccountRequests === 0
        ? "No action needed."
        : "Open the account queue and approve or reject pending portal requests.",
    target: { route: "/app/church-admin/accounts", query: { status: "pending" } },
    detail:
      pendingAccountRequests === 0
        ? "No pending account requests."
        : `${pendingAccountRequests} pending account request${pendingAccountRequests === 1 ? "" : "s"}.`,
  });
}

export function buildPeopleReadinessSummary({
  incompleteProfiles,
  unassignedHouseholds,
}: PeopleReadinessMetrics): ReadinessSummary {
  const issueCount = incompleteProfiles + unassignedHouseholds;
  const status = readinessStatusFor(issueCount > 8, issueCount > 0);

  return createReadinessSummary({
    id: "people-households",
    module: "people",
    title: "People and households",
    description: "Resolve incomplete profiles and unassigned household records.",
    status,
    severity: readinessSeverityFor(status, issueCount),
    issueCount,
    completionState: readinessCompletionStateFor(status),
    recommendedAction:
      issueCount === 0
        ? "No action needed."
        : unassignedHouseholds > 0
          ? "Open people management filtered to unassigned households."
          : "Open people management filtered to incomplete profiles.",
    target:
      unassignedHouseholds > 0
        ? { route: "/app/church-admin/people", query: { view: "unassigned-households", household: "unassigned" } }
        : { route: "/app/church-admin/people", query: { view: "incomplete-profiles" } },
    detail: `${incompleteProfiles} incomplete profile${incompleteProfiles === 1 ? "" : "s"} · ${unassignedHouseholds} unassigned household record${unassignedHouseholds === 1 ? "" : "s"}.`,
  });
}

export function buildEventReadinessSummary({
  upcomingEvents,
  eventsWithoutRoster,
}: EventReadinessMetrics): ReadinessSummary {
  const issueCount = upcomingEvents === 0 ? 1 : eventsWithoutRoster;
  const status = readinessStatusFor(
    upcomingEvents === 0 || eventsWithoutRoster > 2,
    eventsWithoutRoster > 0,
  );

  return createReadinessSummary({
    id: "weekend-events",
    module: "events",
    title: "Weekend events",
    description: "Review upcoming events, rosters, capacity, and check-in readiness.",
    status,
    severity: readinessSeverityFor(status, issueCount),
    issueCount,
    completionState: readinessCompletionStateFor(status),
    recommendedAction:
      upcomingEvents === 0
        ? "Create or review upcoming event records for the next two weeks."
        : eventsWithoutRoster > 0
          ? "Open event readiness filtered to events without roster coverage."
          : "No action needed.",
    target: { route: "/app/church-admin/events", query: { view: "needs-roster" } },
    detail:
      upcomingEvents === 0
        ? "No upcoming event records are scheduled."
        : `${upcomingEvents} upcoming event${upcomingEvents === 1 ? "" : "s"} · ${eventsWithoutRoster} without rosters.`,
  });
}

export function buildVolunteerReadinessSummary({
  openVolunteerShifts,
  unassignedVolunteerShifts,
}: VolunteerReadinessMetrics): ReadinessSummary {
  const status = readinessStatusFor(unassignedVolunteerShifts > 3, openVolunteerShifts > 0);

  return createReadinessSummary({
    id: "volunteer-schedule",
    module: "volunteers",
    title: "Volunteer schedule",
    description: "Review open and unassigned volunteer shifts.",
    status,
    severity: readinessSeverityFor(status, unassignedVolunteerShifts),
    issueCount: unassignedVolunteerShifts,
    completionState: readinessCompletionStateFor(status),
    recommendedAction:
      unassignedVolunteerShifts === 0
        ? "No action needed."
        : "Open volunteer schedules filtered to unassigned shifts.",
    target: { route: "/app/church-admin/volunteers/schedules", query: { view: "unassigned" } },
    detail: `${openVolunteerShifts} open shift${openVolunteerShifts === 1 ? "" : "s"} · ${unassignedVolunteerShifts} unassigned.`,
  });
}
