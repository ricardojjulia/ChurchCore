export type ChurchAdminSpotlight = {
  label: string;
  value: string;
  detail: string;
};

export type CareQueueItem = {
  household: string;
  request: string;
  owner: string;
  age: string;
  urgency: "critical" | "warning" | "healthy";
};

export type WeekendChecklistItem = {
  title: string;
  detail: string;
  status: "done" | "in-progress" | "blocked";
};

export type CommunicationsItem = {
  channel: string;
  audience: string;
  message: string;
  due: string;
};

export type GivingLineItem = {
  label: string;
  amount: string;
  detail: string;
};

export const churchAdminSpotlights: ChurchAdminSpotlight[] = [
  {
    label: "Weekend readiness",
    value: "82%",
    detail: "Coverage and room planning are close, but final follow-up is still needed.",
  },
  {
    label: "Pastoral care queue",
    value: "4 overdue",
    detail: "Requests older than 48 hours should not stay unassigned.",
  },
  {
    label: "Household updates",
    value: "13",
    detail: "Address, family, and emergency-contact changes still need review.",
  },
  {
    label: "Giving pace",
    value: "+6.4%",
    detail: "Month-to-date giving is ahead of the same week last month.",
  },
];

export const careQueue: CareQueueItem[] = [
  {
    household: "Martinez family",
    request: "Hospital visit and meal coordination after surgery.",
    owner: "Unassigned",
    age: "51h open",
    urgency: "critical",
  },
  {
    household: "Jordan household",
    request: "Prayer follow-up after job loss and benevolence review.",
    owner: "Pastor Miriam",
    age: "29h open",
    urgency: "warning",
  },
  {
    household: "Henderson family",
    request: "New family follow-up after first-time Sunday visit.",
    owner: "Assimilation team",
    age: "18h open",
    urgency: "healthy",
  },
];

export const weekendChecklist: WeekendChecklistItem[] = [
  {
    title: "Finalize lobby staffing",
    detail: "Two second-service welcome spots are still open.",
    status: "blocked",
  },
  {
    title: "Confirm childcare room assignments",
    detail: "Infant and preschool room capacities are locked in and staffed.",
    status: "done",
  },
  {
    title: "Publish Sunday operations brief",
    detail: "Draft is ready, waiting on final livestream notes.",
    status: "in-progress",
  },
  {
    title: "Approve donor export request",
    detail: "Requires logged justification before release.",
    status: "blocked",
  },
];

export const communicationsQueue: CommunicationsItem[] = [
  {
    channel: "Email",
    audience: "18 households",
    message: "Weekend RSVP reminder for families still undecided.",
    due: "Today by 2:00 PM",
  },
  {
    channel: "SMS",
    audience: "Welcome team",
    message: "Coverage request for the open second-service lobby shift.",
    due: "Today by 11:30 AM",
  },
  {
    channel: "In-app",
    audience: "Ministry leaders",
    message: "Publish the final weekend checklist and room plan.",
    due: "Friday at 9:00 AM",
  },
];

export const givingSummary: GivingLineItem[] = [
  {
    label: "Online giving",
    amount: "$18.1k",
    detail: "Recurring and one-time gifts reconciled through Wednesday night.",
  },
  {
    label: "In-person giving",
    amount: "$6.5k",
    detail: "Deposits prepared, one batch still waiting on dual verification.",
  },
  {
    label: "Benevolence fund",
    amount: "$2.3k",
    detail: "Current requests may require an elder review before distribution.",
  },
];
