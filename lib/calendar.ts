import type { PortalRoleId } from "@/lib/portal";

export type CalendarMetric = {
  label: string;
  value: string;
  detail: string;
};

export type CalendarEvent = {
  title: string;
  ministry: string;
  time: string;
  location: string;
  lead: string;
  attendance: string;
  status: "confirmed" | "coverage" | "approval" | "watch";
};

export type CalendarDay = {
  dateLabel: string;
  theme: string;
  events: CalendarEvent[];
};

export type CalendarWatchItem = {
  title: string;
  detail: string;
  level: "healthy" | "warning" | "critical";
};

export const calendarMetrics: CalendarMetric[] = [
  {
    label: "This week",
    value: "14 events",
    detail: "Across worship, children, care, outreach, and leadership rhythms.",
  },
  {
    label: "RSVP completion",
    value: "87%",
    detail: "Most households have responded for Sunday and family worship night.",
  },
  {
    label: "Volunteer openings",
    value: "4",
    detail: "Two hospitality roles, one youth check-in slot, and one prayer-team backup.",
  },
  {
    label: "Resource conflicts",
    value: "2",
    detail: "A room overlap and one audio-kit turnaround window need attention.",
  },
];

export const calendarFilters = [
  "All Events",
  "My Events",
  "Worship",
  "Kids",
  "Care",
  "Outreach",
  "Leadership",
];

export const calendarDays: CalendarDay[] = [
  {
    dateLabel: "Thursday, April 9",
    theme: "Preparation and volunteer alignment",
    events: [
      {
        title: "Sunday service production sync",
        ministry: "Worship",
        time: "9:00 AM",
        location: "Main auditorium",
        lead: "David Brooks",
        attendance: "11 team members",
        status: "confirmed",
      },
      {
        title: "Pastoral care assignment huddle",
        ministry: "Care",
        time: "12:00 PM",
        location: "Leadership room",
        lead: "Miriam Cole",
        attendance: "6 leaders",
        status: "watch",
      },
      {
        title: "Youth night setup",
        ministry: "Students",
        time: "5:30 PM",
        location: "Family wing",
        lead: "Elijah Ross",
        attendance: "8 volunteers",
        status: "coverage",
      },
    ],
  },
  {
    dateLabel: "Friday, April 10",
    theme: "Approvals and communication lock-in",
    events: [
      {
        title: "Weekend communications send",
        ministry: "Operations",
        time: "10:30 AM",
        location: "Admin desk",
        lead: "Sarah Bennett",
        attendance: "Platform-wide",
        status: "approval",
      },
      {
        title: "Family worship RSVP cutoff",
        ministry: "Families",
        time: "6:00 PM",
        location: "Community hall",
        lead: "David Brooks",
        attendance: "Projected 128",
        status: "watch",
      },
    ],
  },
  {
    dateLabel: "Sunday, April 12",
    theme: "Weekend execution and follow-up readiness",
    events: [
      {
        title: "Sunday service",
        ministry: "Worship",
        time: "9:15 AM",
        location: "Main auditorium",
        lead: "Miriam Cole",
        attendance: "Projected 410",
        status: "confirmed",
      },
      {
        title: "Welcome team first-service shift",
        ministry: "Hospitality",
        time: "8:40 AM",
        location: "Front lobby",
        lead: "Elijah Ross",
        attendance: "Needs 2 more volunteers",
        status: "coverage",
      },
      {
        title: "New family follow-up queue",
        ministry: "Assimilation",
        time: "1:15 PM",
        location: "Church office",
        lead: "David Brooks",
        attendance: "15 households",
        status: "approval",
      },
    ],
  },
];

export const volunteerLoadWatch: CalendarWatchItem[] = [
  {
    title: "Hospitality repeat load",
    detail:
      "Three volunteers are currently scheduled for every Sunday slot this month.",
    level: "warning",
  },
  {
    title: "Youth check-in coverage gap",
    detail:
      "Tonight still needs one trained volunteer for the full arrival window.",
    level: "critical",
  },
  {
    title: "Prayer team pacing healthy",
    detail:
      "Rotation spacing is currently aligned with rest expectations and availability.",
    level: "healthy",
  },
];

export const resourceAlerts: CalendarWatchItem[] = [
  {
    title: "Room overlap",
    detail:
      "Family worship rehearsal and a counseling appointment are both pointed at Room 204 on Friday.",
    level: "critical",
  },
  {
    title: "Audio kit turnaround",
    detail:
      "Student ministry teardown leaves only 25 minutes before the prayer-night setup.",
    level: "warning",
  },
  {
    title: "Childcare rooms clear",
    detail:
      "No room-capacity or staffing issues are currently flagged for Sunday.",
    level: "healthy",
  },
];

export const approvalQueue = [
  {
    title: "Weekend reminder email",
    detail:
      "AI-assisted draft needs staff approval before it goes to families with open RSVPs.",
  },
  {
    title: "Volunteer swap request",
    detail:
      "Parking team shift change is ready for leader review and final confirmation.",
  },
  {
    title: "Donor export request",
    detail:
      "Sensitive-data release is waiting on documented justification and audit logging.",
  },
];

export const roleCalendarFocus: Record<PortalRoleId, string> = {
  "super-admin":
    "Your calendar focus is cross-tenant risk, onboarding windows, and communications approval timing.",
  "church-admin":
    "Your calendar focus is weekend readiness, member response tracking, and volunteer coverage.",
  pastor:
    "Your calendar focus is pastoral care timing, sermon prep rhythm, and prayer follow-up.",
  "ministry-leader":
    "Your calendar focus is team readiness, event logistics, and volunteer load balance.",
  member:
    "Your calendar focus is personal commitments, service opportunities, and clear next steps.",
};
