export type PortalRoleId =
  | "super-admin"
  | "church-admin"
  | "secretary"
  | "pastor"
  | "ministry-leader"
  | "member";

export type PortalMetric = {
  label: string;
  value: string;
  detail: string;
};

export type PortalTimelineItem = {
  time: string;
  title: string;
  detail: string;
  status: "today" | "soon" | "watch";
};

export type PortalAlert = {
  title: string;
  detail: string;
  level: "healthy" | "warning" | "critical";
};

export type PortalAiItem = {
  title: string;
  detail: string;
  guardrail: string;
};

export type PortalActionItem = {
  title: string;
  detail: string;
};

export type PortalRole = {
  id: PortalRoleId;
  label: string;
  audience: string;
  summary: string;
  headline: string;
  description: string;
  metrics: PortalMetric[];
  timeline: PortalTimelineItem[];
  watchlist: PortalAlert[];
  aiQueue: PortalAiItem[];
  actionBoard: PortalActionItem[];
};

export function isControlPlaneRole(roleId: PortalRoleId) {
  return roleId === "super-admin";
}

export function isChurchRole(roleId: PortalRoleId) {
  return !isControlPlaneRole(roleId);
}

export const portalRoles: PortalRole[] = [
  {
    id: "super-admin",
    label: "SuperAdmin",
    audience: "Platform and tenant operations",
    summary: "Platform governance, onboarding, billing, and security oversight.",
    headline: "Protect tenant health while keeping new churches moving.",
    description:
      "The SuperAdmin portal focuses on onboarding, platform reliability, and the queues that can affect every tenant at once.",
    metrics: [
      {
        label: "Active tenants",
        value: "18",
        detail: "2 churches are still in onboarding review.",
      },
      {
        label: "Open platform risks",
        value: "3",
        detail: "One billing exception and two security follow-ups.",
      },
      {
        label: "Upcoming renewals",
        value: "6",
        detail: "All renewals land inside the next 14 days.",
      },
    ],
    timeline: [
      {
        time: "8:30 AM",
        title: "Provision Grace Harbor staging tenant",
        detail: "Confirm storage, auth defaults, and audit logging.",
        status: "today",
      },
      {
        time: "10:00 AM",
        title: "Review failed card retries",
        detail: "Two churches need billing recovery outreach before lockout.",
        status: "soon",
      },
      {
        time: "1:00 PM",
        title: "Check platform access audit",
        detail: "Pastoral-notes access patterns need manual verification.",
        status: "watch",
      },
    ],
    watchlist: [
      {
        title: "Tenant onboarding blocked",
        detail: "Grace Harbor is waiting on domain verification for invite emails.",
        level: "warning",
      },
      {
        title: "Billing exception pending",
        detail: "New City Chapel has not confirmed card replacement after the third retry.",
        level: "critical",
      },
      {
        title: "Nightly backup checks clear",
        detail: "Latest restore drill completed successfully across all tenants.",
        level: "healthy",
      },
    ],
    aiQueue: [
      {
        title: "Summarize tenant support themes",
        detail: "Cluster recurring support requests from the last 30 days.",
        guardrail: "No member-level sensitive text leaves the audit boundary.",
      },
      {
        title: "Draft renewal nudges",
        detail: "Prepare billing reminder copy for churches with expiring cards.",
        guardrail: "Every draft requires human approval before delivery.",
      },
      {
        title: "Flag risky access patterns",
        detail: "Surface anomalies in admin access and export behavior.",
        guardrail: "AI proposes risk summaries only; compliance review stays manual.",
      },
    ],
    actionBoard: [
      {
        title: "Approve staged tenant launch",
        detail: "Release Grace Harbor after email domain and roles are validated.",
      },
      {
        title: "Escalate billing recovery",
        detail: "Create a manual follow-up task for accounts with repeated failures.",
      },
      {
        title: "Open backend ADR review",
        detail: "Keep platform architecture decisions documented before integration work expands.",
      },
    ],
  },
  {
    id: "church-admin",
    label: "ChurchAdmin",
    audience: "Church administration and oversight",
    summary: "Membership, giving, communications, and weekend operations.",
    headline: "Run the church week without losing the human details.",
    description:
      "The ChurchAdmin portal brings together attendance, giving, volunteer coordination, and operational follow-up in one working surface.",
    metrics: [
      {
        label: "Weekend RSVPs",
        value: "142",
        detail: "18 households still need a response before Saturday.",
      },
      {
        label: "Volunteer coverage",
        value: "91%",
        detail: "Only two welcome-team shifts remain uncovered.",
      },
      {
        label: "Giving reconciliation",
        value: "$24.6k",
        detail: "Online and in-person batches are aligned through Wednesday.",
      },
    ],
    timeline: [
      {
        time: "9:00 AM",
        title: "Finalize Sunday service plan",
        detail: "Confirm room assignments, childcare counts, and livestream lead.",
        status: "today",
      },
      {
        time: "11:15 AM",
        title: "Approve volunteer swap",
        detail: "Parking team request needs a leader sign-off.",
        status: "soon",
      },
      {
        time: "3:30 PM",
        title: "Review donor export request",
        detail: "Sensitive-data access needs a logged justification before release.",
        status: "watch",
      },
    ],
    watchlist: [
      {
        title: "Welcome team gap",
        detail: "Second service still needs two volunteers at the front doors.",
        level: "warning",
      },
      {
        title: "Pastoral care follow-up aging",
        detail: "Four member requests have gone more than 48 hours without assignment.",
        level: "critical",
      },
      {
        title: "Giving batches healthy",
        detail: "No reconciliation drift detected between Stripe and in-app records.",
        level: "healthy",
      },
    ],
    aiQueue: [
      {
        title: "Draft member reminder",
        detail: "Create a warm RSVP reminder for families not yet registered for Sunday.",
        guardrail: "Send only after a staff member reviews the final message.",
      },
      {
        title: "Summarize volunteer pressure",
        detail: "Explain where repeat service load is creating burnout risk.",
        guardrail: "Recommendations stay advisory; leaders decide assignments.",
      },
      {
        title: "Prepare giving report narrative",
        detail: "Turn this month's trends into board-ready summary bullets.",
        guardrail: "Financial figures stay exact and human-verified before sharing.",
      },
    ],
    actionBoard: [
      {
        title: "Fill welcome-team openings",
        detail: "Route requests to members who opted into hospitality coverage.",
      },
      {
        title: "Assign pastoral care cases",
        detail: "Move overdue care requests to a pastor or elder before the end of day.",
      },
      {
        title: "Publish weekend checklist",
        detail: "Share the final operations plan with ministry leaders and volunteers.",
      },
    ],
  },
  {
    id: "secretary",
    label: "Secretary / Office Admin",
    audience: "Church office and daily operations",
    summary: "Calls, notes, visit scheduling, calendar items, and daily follow-up.",
    headline: "Keep daily church office work in one accountable lane.",
    description:
      "The Secretary / Office Admin portal focuses on the front-desk rhythm: calls, checkups, notes, visit scheduling, assignments, and the operational signals that need attention today.",
    metrics: [
      {
        label: "Open office items",
        value: "18",
        detail: "Calls, notes, visits, and follow-ups still need same-week action.",
      },
      {
        label: "Due today",
        value: "6",
        detail: "Three callbacks and two visit reminders are time-sensitive.",
      },
      {
        label: "Upcoming events",
        value: "9",
        detail: "Calendar context is visible without granting full admin settings access.",
      },
    ],
    timeline: [
      {
        time: "9:00 AM",
        title: "Open office inbox",
        detail: "Triage voicemail, walk-in notes, and new follow-up requests.",
        status: "today",
      },
      {
        time: "11:30 AM",
        title: "Schedule visit reminders",
        detail: "Put pending pastoral and member visits onto the shared calendar.",
        status: "soon",
      },
      {
        time: "3:00 PM",
        title: "Check unresolved requests",
        detail: "Escalate anything marked urgent or waiting on staff response.",
        status: "watch",
      },
    ],
    watchlist: [
      {
        title: "Urgent callbacks",
        detail: "Two member calls are marked high priority and need ownership today.",
        level: "critical",
      },
      {
        title: "Visit scheduling queue",
        detail: "Several visit requests are waiting on calendar placement.",
        level: "warning",
      },
      {
        title: "Office notes current",
        detail: "Completed items are being closed with an accountable status trail.",
        level: "healthy",
      },
    ],
    aiQueue: [
      {
        title: "Summarize office inbox",
        detail: "Group open calls and notes by urgency and owner.",
        guardrail: "Sensitive pastoral context stays human-reviewed and is never auto-sent.",
      },
      {
        title: "Draft neutral follow-up language",
        detail: "Prepare callback language for routine scheduling and checkups.",
        guardrail: "Staff approve every message before it reaches a person.",
      },
      {
        title: "Flag aging requests",
        detail: "Identify items that have waited too long without an update.",
        guardrail: "AI highlights workflow risk only; staff decide the response.",
      },
    ],
    actionBoard: [
      {
        title: "Triage today's office queue",
        detail: "Create or update Daily Desk items for calls, notes, visits, and checkups.",
      },
      {
        title: "Confirm calendar items",
        detail: "Put approved visits and meetings on the shared calendar.",
      },
      {
        title: "Escalate urgent requests",
        detail: "Move time-sensitive items to the right pastor or church admin.",
      },
    ],
  },
  {
    id: "pastor",
    label: "Pastor / Elder",
    audience: "Teaching, care, and leadership collaboration",
    summary: "Sermon prep, prayer requests, care follow-up, and leadership review.",
    headline: "Keep teaching, care, and discernment moving in the same rhythm.",
    description:
      "The Pastor portal keeps sermon planning, prayer review, and member care visible without turning discernment into automation.",
    metrics: [
      {
        label: "Care requests",
        value: "12",
        detail: "3 require same-day callbacks from a pastor or elder.",
      },
      {
        label: "Sermon series progress",
        value: "Week 4",
        detail: "Outline and supporting Scriptures are ready for review.",
      },
      {
        label: "Prayer updates",
        value: "27",
        detail: "8 have recent answers or follow-up notes to log.",
      },
    ],
    timeline: [
      {
        time: "7:30 AM",
        title: "Review sermon outline",
        detail: "Finalize the main movement and next-step application.",
        status: "today",
      },
      {
        time: "12:00 PM",
        title: "Pastoral care huddle",
        detail: "Assign hospital visits and member follow-up calls.",
        status: "soon",
      },
      {
        time: "4:00 PM",
        title: "Elder review of prayer requests",
        detail: "Confirm which updates should remain private pastoral notes.",
        status: "watch",
      },
    ],
    watchlist: [
      {
        title: "Care queue needs assignment",
        detail: "Three requests mention hospitalization and should not wait until tomorrow.",
        level: "critical",
      },
      {
        title: "Series assets nearly ready",
        detail: "Slides and discussion prompts are still waiting on final theme language.",
        level: "warning",
      },
      {
        title: "Prayer journal consent clear",
        detail: "All AI-assisted prayer entries are currently inside opted-in accounts.",
        level: "healthy",
      },
    ],
    aiQueue: [
      {
        title: "Generate sermon illustration options",
        detail: "Offer three illustration directions for the current passage.",
        guardrail: "Drafts inform preparation only; doctrine and exposition stay human-led.",
      },
      {
        title: "Summarize prayer themes",
        detail: "Detect repeated themes across opted-in prayer updates this week.",
        guardrail: "Private notes remain excluded unless consent is explicit.",
      },
      {
        title: "Draft care follow-up prompts",
        detail: "Suggest call notes and Scripture references for member check-ins.",
        guardrail: "Pastoral counsel is never auto-sent or auto-recorded.",
      },
    ],
    actionBoard: [
      {
        title: "Assign urgent care requests",
        detail: "Distribute hospitalization and grief follow-ups before lunch.",
      },
      {
        title: "Lock sermon review window",
        detail: "Share the current outline with elders for comment by Friday morning.",
      },
      {
        title: "Approve prayer-summary draft",
        detail: "Confirm the weekly prayer update before it reaches the congregation.",
      },
    ],
  },
  {
    id: "ministry-leader",
    label: "MinistryAdmin / Leader",
    audience: "Ministry execution and volunteer coordination",
    summary: "Event prep, team coverage, communications, and follow-up execution.",
    headline: "Coordinate a ministry team without letting details drift.",
    description:
      "The Ministry Leader portal is tuned for event readiness, volunteer matching, and the rhythms that keep a ministry healthy week to week.",
    metrics: [
      {
        label: "Upcoming ministry events",
        value: "7",
        detail: "3 events need room or resource confirmations this week.",
      },
      {
        label: "Volunteer response rate",
        value: "84%",
        detail: "Youth and hospitality teams are the slowest to confirm.",
      },
      {
        label: "Follow-up tasks",
        value: "16",
        detail: "Half are tied to last week's small-group and outreach events.",
      },
    ],
    timeline: [
      {
        time: "8:45 AM",
        title: "Confirm youth night setup",
        detail: "Stage, snacks, check-in table, and parent communication.",
        status: "today",
      },
      {
        time: "1:30 PM",
        title: "Reassign small-group host",
        detail: "One host cancelled and a replacement is available.",
        status: "soon",
      },
      {
        time: "6:00 PM",
        title: "Review volunteer load balance",
        detail: "Avoid placing the same core team on all weekend events.",
        status: "watch",
      },
    ],
    watchlist: [
      {
        title: "Youth check-in still understaffed",
        detail: "Only one approved volunteer is assigned for tonight's arrival window.",
        level: "critical",
      },
      {
        title: "Outreach follow-up lagging",
        detail: "Five new contacts from last weekend still need a first response.",
        level: "warning",
      },
      {
        title: "Volunteer training complete",
        detail: "Background-check and onboarding compliance are current for this ministry.",
        level: "healthy",
      },
    ],
    aiQueue: [
      {
        title: "Draft volunteer ask",
        detail: "Write a short message for the remaining youth check-in opening.",
        guardrail: "Leader reviews tone and assignment fit before sending.",
      },
      {
        title: "Summarize event feedback",
        detail: "Condense last week's comments into themes for the next team meeting.",
        guardrail: "AI organizes responses only; leadership decisions stay manual.",
      },
      {
        title: "Suggest team rotation",
        detail: "Recommend alternates to lower burnout on the hospitality roster.",
        guardrail: "Availability, gifting, and pastoral context still require human review.",
      },
    ],
    actionBoard: [
      {
        title: "Fill youth check-in role",
        detail: "Use trained backup volunteers before asking new people to serve.",
      },
      {
        title: "Close outreach loop",
        detail: "Assign first-contact owners for every new family from the outreach list.",
      },
      {
        title: "Publish team brief",
        detail: "Send tonight's final event packet to volunteers and staff.",
      },
    ],
  },
  {
    id: "member",
    label: "Volunteer / Member",
    audience: "Self-service member portal",
    summary: "Personal schedule, serving opportunities, giving, and prayer participation.",
    headline: "Show members exactly what they need, without platform clutter.",
    description:
      "The member portal keeps commitments, giving, prayer participation, and service opportunities simple and personal.",
    metrics: [
      {
        label: "My upcoming events",
        value: "4",
        detail: "Sunday service, small group, prayer night, and youth pickup.",
      },
      {
        label: "Serving commitments",
        value: "2",
        detail: "Hospitality this Sunday and prayer team next Wednesday.",
      },
      {
        label: "Open opportunities",
        value: "5",
        detail: "Three fit prior interests and current availability preferences.",
      },
    ],
    timeline: [
      {
        time: "Sunday 9:15 AM",
        title: "Serve on hospitality team",
        detail: "Arrive 20 minutes early and check in at the lobby desk.",
        status: "today",
      },
      {
        time: "Tuesday 7:00 PM",
        title: "Small group at the Parkers",
        detail: "RSVP is confirmed and childcare is requested.",
        status: "soon",
      },
      {
        time: "Wednesday 6:30 PM",
        title: "Prayer night reminder",
        detail: "Bring your current prayer updates if you want leader follow-up.",
        status: "watch",
      },
    ],
    watchlist: [
      {
        title: "Serving schedule clear",
        detail: "No overlapping commitments or approval issues are currently blocking you.",
        level: "healthy",
      },
      {
        title: "One RSVP still open",
        detail: "The family worship night needs your household response by Friday.",
        level: "warning",
      },
      {
        title: "Profile update requested",
        detail: "Emergency contact details are missing from your household record.",
        level: "critical",
      },
    ],
    aiQueue: [
      {
        title: "Prayer-journal prompt",
        detail: "Suggest a reflective prompt tied to this week's theme.",
        guardrail: "Entries stay private and AI analysis is opt-in.",
      },
      {
        title: "Service opportunity match",
        detail: "Highlight volunteer openings that fit your stated interests.",
        guardrail: "Suggestions are optional and do not auto-enroll you.",
      },
      {
        title: "Bible study recap",
        detail: "Provide a concise recap from your group's current reading plan.",
        guardrail: "Generated notes supplement, not replace, Scripture study.",
      },
    ],
    actionBoard: [
      {
        title: "Answer family worship RSVP",
        detail: "Confirm attendance and childcare needs before Friday evening.",
      },
      {
        title: "Update household profile",
        detail: "Add the missing emergency contact so volunteer check-in stays current.",
      },
      {
        title: "Browse service openings",
        detail: "Review a few ministry roles matched to your interests.",
      },
    ],
  },
];

export const churchPortalRoles = portalRoles.filter((role) =>
  isChurchRole(role.id),
);

export function getPortalRole(roleId: string) {
  return portalRoles.find((role) => role.id === roleId);
}

export function getRoleHomePath(roleId: PortalRoleId) {
  return isControlPlaneRole(roleId) ? "/control" : `/app/${roleId}`;
}

export const defaultPortalRoleId: PortalRoleId = "church-admin";
