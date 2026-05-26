import { describe, expect, it } from "vitest";

import {
  buildAccountRequestsReadinessSummary,
  buildChildrenReadinessSummary,
  buildChurchSetupReadinessSummary,
  buildCommunicationsReadinessSummary,
  buildEventReadinessSummary,
  buildGivingFinanceReadinessSummary,
  buildPeopleReadinessSummary,
  buildVolunteerReadinessSummary,
  buildWorkflowReadinessSummary,
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

  it("builds event readiness for missing events and roster gaps", () => {
    expect(buildEventReadinessSummary({
      upcomingEvents: 0,
      eventsWithoutRoster: 0,
    })).toMatchObject({
      id: "weekend-events",
      module: "events",
      status: "blocked",
      severity: "critical",
      issueCount: 1,
      completionState: "blocked",
      recommendedAction: "Create or review upcoming event records for the next two weeks.",
      href: "/app/church-admin/events?view=needs-roster",
    });

    expect(buildEventReadinessSummary({
      upcomingEvents: 4,
      eventsWithoutRoster: 1,
    })).toMatchObject({
      status: "attention",
      severity: "warning",
      issueCount: 1,
      recommendedAction: "Open event readiness filtered to events without roster coverage.",
    });
  });

  it("builds volunteer readiness with schedule targeting", () => {
    expect(buildVolunteerReadinessSummary({
      openVolunteerShifts: 5,
      unassignedVolunteerShifts: 4,
    })).toMatchObject({
      id: "volunteer-schedule",
      module: "volunteers",
      status: "blocked",
      severity: "critical",
      issueCount: 4,
      target: { route: "/app/church-admin/volunteers/schedules", query: { view: "unassigned" } },
      href: "/app/church-admin/volunteers/schedules?view=unassigned",
    });
  });

  it("builds children readiness when no open service is available", () => {
    expect(buildChildrenReadinessSummary({
      openCcmServices: 0,
      ccmVolunteers: 0,
      ccmFollowups: 0,
    })).toMatchObject({
      id: "children-ministry",
      module: "children",
      status: "attention",
      severity: "warning",
      issueCount: 1,
      completionState: "needs_review",
      recommendedAction: "Open the children's ministry readiness dashboard and resolve service, volunteer, or incident gaps.",
      href: "/app/church-admin/children/dashboard?view=readiness",
      detail: "No open children's ministry service is ready for check-in.",
    });
  });

  it("blocks children readiness when an open service has no volunteer assignments", () => {
    expect(buildChildrenReadinessSummary({
      openCcmServices: 1,
      ccmVolunteers: 0,
      ccmFollowups: 0,
    })).toMatchObject({
      status: "blocked",
      severity: "critical",
      issueCount: 1,
      completionState: "blocked",
      detail: "1 open service · 0 volunteer assignments · 0 follow-up incidents.",
    });
  });

  it("flags children readiness when follow-up incidents are open", () => {
    expect(buildChildrenReadinessSummary({
      openCcmServices: 2,
      ccmVolunteers: 6,
      ccmFollowups: 2,
    })).toMatchObject({
      status: "attention",
      severity: "warning",
      issueCount: 2,
      completionState: "needs_review",
      detail: "2 open services · 6 volunteer assignments · 2 follow-up incidents.",
    });
  });

  it("builds ready children readiness when service, volunteer, and incident checks are clear", () => {
    expect(buildChildrenReadinessSummary({
      openCcmServices: 1,
      ccmVolunteers: 4,
      ccmFollowups: 0,
    })).toMatchObject({
      status: "ready",
      severity: "none",
      issueCount: 0,
      completionState: "complete",
      recommendedAction: "No action needed.",
    });
  });

  it("blocks giving and finance readiness when no live giving page exists", () => {
    expect(buildGivingFinanceReadinessSummary({
      failedDonations: 0,
      unpostedDonations: 0,
      draftJournals: 0,
      liveGivingPages: 0,
    })).toMatchObject({
      id: "giving-finance",
      module: "money",
      status: "blocked",
      severity: "critical",
      issueCount: 1,
      completionState: "blocked",
      recommendedAction: "Open giving and finance exceptions to resolve failed gifts, GL posting gaps, draft journals, or giving page setup.",
      href: "/app/church-admin/giving?view=exceptions",
      detail: "0 failed gifts · 0 unposted gifts · 0 draft journals · 0 live giving pages.",
    });
  });

  it("blocks giving and finance readiness when failed donations need review", () => {
    expect(buildGivingFinanceReadinessSummary({
      failedDonations: 2,
      unpostedDonations: 0,
      draftJournals: 0,
      liveGivingPages: 1,
    })).toMatchObject({
      status: "blocked",
      severity: "critical",
      issueCount: 2,
      completionState: "blocked",
      detail: "2 failed gifts · 0 unposted gifts · 0 draft journals · 1 live giving page.",
    });
  });

  it("flags giving and finance readiness when GL posting or draft journals need attention", () => {
    expect(buildGivingFinanceReadinessSummary({
      failedDonations: 0,
      unpostedDonations: 3,
      draftJournals: 2,
      liveGivingPages: 1,
    })).toMatchObject({
      status: "attention",
      severity: "warning",
      issueCount: 5,
      completionState: "needs_review",
      detail: "0 failed gifts · 3 unposted gifts · 2 draft journals · 1 live giving page.",
    });
  });

  it("builds ready giving and finance readiness when money checks are clear", () => {
    expect(buildGivingFinanceReadinessSummary({
      failedDonations: 0,
      unpostedDonations: 0,
      draftJournals: 0,
      liveGivingPages: 1,
    })).toMatchObject({
      status: "ready",
      severity: "none",
      issueCount: 0,
      completionState: "complete",
      recommendedAction: "No action needed.",
    });
  });

  it("blocks communications readiness when delivery failures exist", () => {
    expect(buildCommunicationsReadinessSummary({
      pendingCommunications: 1,
      failedCommunications: 2,
      bouncedCommunications: 1,
      contactGaps: 0,
      consentGaps: 0,
    })).toMatchObject({
      id: "communications",
      module: "communications",
      status: "blocked",
      severity: "critical",
      issueCount: 4,
      completionState: "blocked",
      href: "/app/communications?view=readiness",
      recommendedAction: "Open communications and resolve pending sends, delivery failures, consent limits, or contact gaps.",
      detail: "1 pending send · 2 failed · 1 bounced · 0 contact gaps · 0 consent gaps.",
    });
  });

  it("flags communications readiness when pending sends or reach gaps need review", () => {
    expect(buildCommunicationsReadinessSummary({
      pendingCommunications: 3,
      failedCommunications: 0,
      bouncedCommunications: 0,
      contactGaps: 2,
      consentGaps: 4,
    })).toMatchObject({
      status: "attention",
      severity: "warning",
      issueCount: 9,
      completionState: "needs_review",
      detail: "3 pending sends · 0 failed · 0 bounced · 2 contact gaps · 4 consent gaps.",
    });
  });

  it("builds ready communications readiness when delivery and reach checks are clear", () => {
    expect(buildCommunicationsReadinessSummary({
      pendingCommunications: 0,
      failedCommunications: 0,
      bouncedCommunications: 0,
      contactGaps: 0,
      consentGaps: 0,
    })).toMatchObject({
      status: "ready",
      severity: "none",
      issueCount: 0,
      completionState: "complete",
      recommendedAction: "No action needed.",
    });
  });

  it("builds ready workflow readiness when no suggested workflows are open", () => {
    expect(buildWorkflowReadinessSummary({ openWorkflows: 0 })).toMatchObject({
      id: "suggested-workflows",
      module: "workflows",
      status: "ready",
      severity: "none",
      issueCount: 0,
      completionState: "complete",
      recommendedAction: "No action needed.",
      href: "/app/church-admin/workflows?status=open",
      detail: "No open suggested workflows.",
    });
  });

  it("flags workflow readiness when suggested workflows need triage", () => {
    expect(buildWorkflowReadinessSummary({ openWorkflows: 4 })).toMatchObject({
      status: "attention",
      severity: "warning",
      issueCount: 4,
      completionState: "needs_review",
      recommendedAction: "Open suggested workflows and triage open or assigned ministry actions.",
      detail: "4 open suggested workflows.",
    });
  });

  it("blocks workflow readiness when too many suggested workflows are open", () => {
    expect(buildWorkflowReadinessSummary({ openWorkflows: 11 })).toMatchObject({
      status: "blocked",
      severity: "critical",
      issueCount: 11,
      completionState: "blocked",
      detail: "11 open suggested workflows.",
    });
  });
});
