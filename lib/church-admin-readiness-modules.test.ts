import { describe, expect, it } from "vitest";

import {
  buildAccountRequestsReadinessSummary,
  buildChurchSetupReadinessSummary,
  buildPeopleReadinessSummary,
} from "@/lib/church-admin-readiness-modules";

describe("church admin readiness module summaries", () => {
  it("builds setup readiness with route target and completion state", () => {
    expect(buildChurchSetupReadinessSummary({ missingSettings: 0 })).toMatchObject({
      id: "church-setup",
      module: "setup",
      status: "ready",
      severity: "none",
      issueCount: 0,
      completionState: "complete",
      href: "/app/church-admin/settings",
      recommendedAction: "No action needed.",
    });

    expect(buildChurchSetupReadinessSummary({ missingSettings: 3 })).toMatchObject({
      status: "blocked",
      severity: "critical",
      issueCount: 3,
      completionState: "blocked",
    });
  });

  it("builds account request readiness with pending queue targeting", () => {
    expect(buildAccountRequestsReadinessSummary({ pendingAccountRequests: 2 })).toMatchObject({
      id: "portal-requests",
      module: "accounts",
      status: "attention",
      severity: "warning",
      issueCount: 2,
      target: { route: "/app/church-admin/accounts", query: { status: "pending" } },
      href: "/app/church-admin/accounts?status=pending",
    });
  });

  it("builds people readiness with the highest-priority filtered target", () => {
    expect(buildPeopleReadinessSummary({
      incompleteProfiles: 4,
      unassignedHouseholds: 1,
    })).toMatchObject({
      id: "people-households",
      module: "people",
      status: "attention",
      issueCount: 5,
      target: {
        route: "/app/church-admin/people",
        query: { view: "unassigned-households", household: "unassigned" },
      },
      href: "/app/church-admin/people?view=unassigned-households&household=unassigned",
    });
  });
});
