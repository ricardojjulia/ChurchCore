import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ReportTimeRange = "30d" | "90d" | "365d";

export type ReportTrendPoint = {
  label: string;
  value: number;
};

export type ReportBreakdownRow = {
  label: string;
  value: number;
  tone: string;
  detail?: string;
};

export type ReportAlertRow = {
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export type MemberReportsData = {
  range: ReportTimeRange;
  summary: {
    totalPeople: number;
    activePeople: number;
    visitorCount: number;
    atRiskCount: number;
    contactableCount: number;
  };
  attendanceTrend: ReportTrendPoint[];
  statusBreakdown: ReportBreakdownRow[];
  recencyBreakdown: ReportBreakdownRow[];
  engagementBreakdown: ReportBreakdownRow[];
  driftAlerts: ReportAlertRow[];
};

export type EventPerformanceRow = {
  id: string;
  title: string;
  category: string;
  startsAt: string;
  attendanceCount: number;
  rosterCount: number;
  visitorCount: number;
  pressureRatio: number;
};

export type EventReportsData = {
  range: ReportTimeRange;
  summary: {
    totalEvents: number;
    attendanceTotal: number;
    averageAttendance: number;
    visitorTouches: number;
    pressuredEvents: number;
  };
  attendanceTrend: ReportTrendPoint[];
  categoryBreakdown: ReportBreakdownRow[];
  weekdayBreakdown: ReportBreakdownRow[];
  checkInMethodBreakdown: ReportBreakdownRow[];
  topEvents: EventPerformanceRow[];
};

export type FundBreakdownRow = {
  label: string;
  amountCents: number;
  giftCount: number;
  donorCount: number;
  tone: string;
};

export type GivingReportsData = {
  range: ReportTimeRange;
  summary: {
    totalAmountCents: number;
    giftCount: number;
    recurringDonorCount: number;
    firstTimeGiverCount: number;
    anonymousGiftShare: number;
  };
  givingTrend: ReportTrendPoint[];
  fundBreakdown: FundBreakdownRow[];
  donorJourneyBreakdown: ReportBreakdownRow[];
  giftMixBreakdown: ReportBreakdownRow[];
};

type BaseProfileRow = {
  id: string;
  full_name: string;
  membership_status: string | null;
  last_attendance: string | null;
  email: string | null;
  phone: string | null;
  contact_allowed: boolean | null;
  family_id: string | null;
};

type BaseAttendanceRow = {
  profile_id: string;
  checked_in_at: string;
};

type BaseMinistryAssignmentRow = {
  profile_id: string;
};

type BaseEventRow = {
  id: string;
  title: string;
  category: string;
  starts_at: string;
};

type BaseEventAttendanceRow = {
  event_id: string | null;
  profile_id: string;
  checked_in_at: string;
  check_in_method: string | null;
};

type BaseRosterRow = {
  event_id: string;
  profile_id: string;
};

type BaseDonationRow = {
  profile_id: string | null;
  amount_cents: number;
  fund_designation: string | null;
  is_recurring: boolean;
  is_anonymous: boolean;
  created_at: string;
  stripe_subscription_id: string | null;
};

const REPORT_TONES = [
  "churchBlue",
  "teal",
  "grape",
  "orange",
  "indigo",
  "lime",
  "cyan",
  "pink",
] as const;

export function normalizeReportTimeRange(value: string | undefined): ReportTimeRange {
  if (value === "90d" || value === "365d") {
    return value;
  }

  return "30d";
}

function getRangeDays(range: ReportTimeRange) {
  switch (range) {
    case "90d":
      return 90;
    case "365d":
      return 365;
    case "30d":
    default:
      return 30;
  }
}

function getRangeStart(range: ReportTimeRange) {
  return new Date(Date.now() - getRangeDays(range) * 24 * 60 * 60 * 1000);
}

function formatBucketLabel(date: Date, range: ReportTimeRange) {
  if (range === "365d") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildTrendBuckets(range: ReportTimeRange) {
  const end = new Date();
  const bucketCount = range === "365d" ? 12 : range === "90d" ? 8 : 6;
  const stepDays = range === "365d" ? 30 : 7;
  const buckets: Array<{ key: string; label: string; start: Date; end: Date }> = [];

  for (let index = bucketCount - 1; index >= 0; index -= 1) {
    const raw = new Date(end.getTime() - index * stepDays * 24 * 60 * 60 * 1000);
    const start = range === "365d" ? startOfMonth(raw) : startOfWeek(raw);
    const next = new Date(start);

    if (range === "365d") {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }

    buckets.push({
      key: start.toISOString(),
      label: formatBucketLabel(start, range),
      start,
      end: next,
    });
  }

  return buckets;
}

function buildTrendSeries(
  timestamps: string[],
  range: ReportTimeRange,
): ReportTrendPoint[] {
  const buckets = buildTrendBuckets(range);

  return buckets.map((bucket) => ({
    label: bucket.label,
    value: timestamps.filter((value) => {
      const time = new Date(value).getTime();
      return time >= bucket.start.getTime() && time < bucket.end.getTime();
    }).length,
  }));
}

function toneForIndex(index: number) {
  return REPORT_TONES[index % REPORT_TONES.length];
}

function toDisplayLabel(value: string | null | undefined, fallback = "Unknown") {
  if (!value) {
    return fallback;
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildBreakdownRows(
  counts: Map<string, number>,
  details?: Map<string, string>,
) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, value], index) => ({
      label,
      value,
      tone: toneForIndex(index),
      detail: details?.get(label),
    }));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function buildPreviewMemberReports(range: ReportTimeRange): MemberReportsData {
  return {
    range,
    summary: {
      totalPeople: 286,
      activePeople: 198,
      visitorCount: 22,
      atRiskCount: 17,
      contactableCount: 249,
    },
    attendanceTrend: [
      { label: "Feb 9", value: 118 },
      { label: "Feb 16", value: 124 },
      { label: "Feb 23", value: 136 },
      { label: "Mar 2", value: 141 },
      { label: "Mar 9", value: 152 },
      { label: "Mar 16", value: 159 },
    ],
    statusBreakdown: [
      { label: "Active", value: 221, tone: "churchBlue" },
      { label: "Visitor", value: 22, tone: "teal" },
      { label: "Pending", value: 17, tone: "orange" },
      { label: "Inactive", value: 26, tone: "gray" },
    ],
    recencyBreakdown: [
      { label: "Last 7 days", value: 91, tone: "churchBlue" },
      { label: "8–30 days", value: 88, tone: "teal" },
      { label: "31–60 days", value: 41, tone: "grape" },
      { label: "61–90 days", value: 24, tone: "orange" },
      { label: "90+ days", value: 27, tone: "red" },
      { label: "Never recorded", value: 15, tone: "gray" },
    ],
    engagementBreakdown: [
      { label: "Attending + serving", value: 96, tone: "churchBlue" },
      { label: "Attending only", value: 102, tone: "teal" },
      { label: "Serving only", value: 34, tone: "grape" },
      { label: "Not currently connected", value: 54, tone: "orange" },
    ],
    driftAlerts: [
      {
        title: "17 people are drifting quietly",
        detail:
          "No attendance in 60+ days and no current ministry assignment. Ideal for pastoral follow-up.",
        severity: "high",
      },
      {
        title: "Contactability is weaker than it looks",
        detail:
          "37 profiles are active or pending but lack a reachable email or phone with permission to contact.",
        severity: "medium",
      },
      {
        title: "Visitors are not converting evenly",
        detail:
          "Recent growth is concentrated in two event types. Assimilation follow-up may be too event-dependent.",
        severity: "low",
      },
    ],
  };
}

function buildPreviewEventReports(range: ReportTimeRange): EventReportsData {
  return {
    range,
    summary: {
      totalEvents: 34,
      attendanceTotal: 512,
      averageAttendance: 15,
      visitorTouches: 29,
      pressuredEvents: 6,
    },
    attendanceTrend: [
      { label: "Feb 9", value: 64 },
      { label: "Feb 16", value: 71 },
      { label: "Feb 23", value: 79 },
      { label: "Mar 2", value: 83 },
      { label: "Mar 9", value: 101 },
      { label: "Mar 16", value: 114 },
    ],
    categoryBreakdown: [
      { label: "Worship", value: 184, tone: "churchBlue", detail: "8 events" },
      { label: "Outreach", value: 112, tone: "teal", detail: "6 events" },
      { label: "Youth", value: 93, tone: "grape", detail: "7 events" },
      { label: "Prayer", value: 66, tone: "orange", detail: "5 events" },
      { label: "Administrative", value: 57, tone: "gray", detail: "8 events" },
    ],
    weekdayBreakdown: [
      { label: "Sun", value: 8, tone: "churchBlue" },
      { label: "Mon", value: 3, tone: "gray" },
      { label: "Tue", value: 5, tone: "teal" },
      { label: "Wed", value: 7, tone: "grape" },
      { label: "Thu", value: 4, tone: "orange" },
      { label: "Fri", value: 2, tone: "lime" },
      { label: "Sat", value: 5, tone: "cyan" },
    ],
    checkInMethodBreakdown: [
      { label: "Manual admin", value: 404, tone: "churchBlue" },
      { label: "Self check-in", value: 78, tone: "teal" },
      { label: "NFC / QR", value: 30, tone: "grape" },
    ],
    topEvents: [
      {
        id: "preview-sunday",
        title: "Sunday Gathering",
        category: "worship",
        startsAt: new Date().toISOString(),
        attendanceCount: 134,
        rosterCount: 14,
        visitorCount: 8,
        pressureRatio: 9.6,
      },
      {
        id: "preview-youth",
        title: "Youth Night",
        category: "youth",
        startsAt: new Date().toISOString(),
        attendanceCount: 61,
        rosterCount: 4,
        visitorCount: 7,
        pressureRatio: 15.3,
      },
      {
        id: "preview-outreach",
        title: "Community Outreach",
        category: "outreach",
        startsAt: new Date().toISOString(),
        attendanceCount: 48,
        rosterCount: 5,
        visitorCount: 9,
        pressureRatio: 9.6,
      },
    ],
  };
}

function buildPreviewGivingReports(range: ReportTimeRange): GivingReportsData {
  return {
    range,
    summary: {
      totalAmountCents: 2456000,
      giftCount: 86,
      recurringDonorCount: 31,
      firstTimeGiverCount: 9,
      anonymousGiftShare: 0.18,
    },
    givingTrend: [
      { label: "Feb", value: 242000 },
      { label: "Mar", value: 281000 },
      { label: "Apr", value: 338000 },
      { label: "May", value: 361000 },
      { label: "Jun", value: 403000 },
      { label: "Jul", value: 431000 },
    ],
    fundBreakdown: [
      {
        label: "General Fund",
        amountCents: 1382000,
        giftCount: 46,
        donorCount: 33,
        tone: "churchBlue",
      },
      {
        label: "Missions",
        amountCents: 491000,
        giftCount: 15,
        donorCount: 12,
        tone: "teal",
      },
      {
        label: "Youth Ministry",
        amountCents: 326000,
        giftCount: 13,
        donorCount: 10,
        tone: "grape",
      },
      {
        label: "Community Outreach",
        amountCents: 257000,
        giftCount: 12,
        donorCount: 9,
        tone: "orange",
      },
    ],
    donorJourneyBreakdown: [
      { label: "New givers", value: 9, tone: "churchBlue" },
      { label: "Returning givers", value: 28, tone: "teal" },
      { label: "Recurring donors", value: 31, tone: "grape" },
      { label: "Anonymous gifts", value: 15, tone: "orange" },
    ],
    giftMixBreakdown: [
      { label: "Recurring gifts", value: 39, tone: "churchBlue", detail: "$11.4k" },
      { label: "One-time gifts", value: 47, tone: "teal", detail: "$13.2k" },
      { label: "Anonymous gifts", value: 15, tone: "grape", detail: "18% share" },
    ],
  };
}

function buildMemberReportsFromRaw(
  range: ReportTimeRange,
  profiles: BaseProfileRow[],
  attendanceRows: BaseAttendanceRow[],
  ministryRows: BaseMinistryAssignmentRow[],
): MemberReportsData {
  const now = Date.now();
  const ministryCountByProfileId = new Map<string, number>();
  const attendanceCountByProfileId = new Map<string, number>();

  for (const row of ministryRows) {
    ministryCountByProfileId.set(
      row.profile_id,
      (ministryCountByProfileId.get(row.profile_id) ?? 0) + 1,
    );
  }

  for (const row of attendanceRows) {
    attendanceCountByProfileId.set(
      row.profile_id,
      (attendanceCountByProfileId.get(row.profile_id) ?? 0) + 1,
    );
  }

  const statusCounts = new Map<string, number>();
  const recencyCounts = new Map<string, number>();
  const engagementCounts = new Map<string, number>();
  const driftAlerts: ReportAlertRow[] = [];

  let activePeople = 0;
  let visitorCount = 0;
  let atRiskCount = 0;
  let contactableCount = 0;

  for (const profile of profiles) {
    const membershipStatus = profile.membership_status ?? "unknown";
    const ministryCount = ministryCountByProfileId.get(profile.id) ?? 0;
    const attendanceCount = attendanceCountByProfileId.get(profile.id) ?? 0;
    const lastAttendanceMs = profile.last_attendance
      ? new Date(profile.last_attendance).getTime()
      : null;
    const reachable =
      profile.contact_allowed !== false && Boolean(profile.email || profile.phone);

    statusCounts.set(
      toDisplayLabel(membershipStatus),
      (statusCounts.get(toDisplayLabel(membershipStatus)) ?? 0) + 1,
    );

    if (membershipStatus === "visitor") {
      visitorCount += 1;
    }

    if (attendanceCount > 0 || ministryCount > 0) {
      activePeople += 1;
    }

    if (reachable) {
      contactableCount += 1;
    }

    let recencyLabel = "Never recorded";
    if (lastAttendanceMs) {
      const days = Math.floor((now - lastAttendanceMs) / (24 * 60 * 60 * 1000));
      if (days <= 7) recencyLabel = "Last 7 days";
      else if (days <= 30) recencyLabel = "8–30 days";
      else if (days <= 60) recencyLabel = "31–60 days";
      else if (days <= 90) recencyLabel = "61–90 days";
      else recencyLabel = "90+ days";
    }
    recencyCounts.set(recencyLabel, (recencyCounts.get(recencyLabel) ?? 0) + 1);

    let engagementLabel = "Not currently connected";
    if (attendanceCount > 0 && ministryCount > 0) {
      engagementLabel = "Attending + serving";
    } else if (attendanceCount > 0) {
      engagementLabel = "Attending only";
    } else if (ministryCount > 0) {
      engagementLabel = "Serving only";
    }
    engagementCounts.set(
      engagementLabel,
      (engagementCounts.get(engagementLabel) ?? 0) + 1,
    );

    const isAtRisk =
      membershipStatus !== "inactive" &&
      (lastAttendanceMs === null ||
        now - lastAttendanceMs > 60 * 24 * 60 * 60 * 1000) &&
      ministryCount === 0;

    if (isAtRisk) {
      atRiskCount += 1;
      if (driftAlerts.length < 6) {
        driftAlerts.push({
          title: profile.full_name,
          detail: lastAttendanceMs
            ? `No attendance in ${Math.floor(
                (now - lastAttendanceMs) / (24 * 60 * 60 * 1000),
              )} days and no active ministry assignment.`
            : "No attendance recorded yet and no current ministry assignment.",
          severity: lastAttendanceMs && now - lastAttendanceMs > 90 * 24 * 60 * 60 * 1000
            ? "high"
            : "medium",
        });
      }
    }
  }

  return {
    range,
    summary: {
      totalPeople: profiles.length,
      activePeople,
      visitorCount,
      atRiskCount,
      contactableCount,
    },
    attendanceTrend: buildTrendSeries(
      attendanceRows.map((row) => row.checked_in_at),
      range,
    ),
    statusBreakdown: buildBreakdownRows(statusCounts),
    recencyBreakdown: buildBreakdownRows(recencyCounts),
    engagementBreakdown: buildBreakdownRows(engagementCounts),
    driftAlerts:
      driftAlerts.length > 0
        ? driftAlerts
        : [
            {
              title: "No quiet-drift flags in this window",
              detail:
                "Everyone either attended recently or still has an active serving connection.",
              severity: "low",
            },
          ],
  };
}

function buildEventReportsFromRaw(
  range: ReportTimeRange,
  events: BaseEventRow[],
  attendanceRows: BaseEventAttendanceRow[],
  rosterRows: BaseRosterRow[],
  profileMembershipById: Map<string, string>,
): EventReportsData {
  const attendanceByEventId = new Map<string, BaseEventAttendanceRow[]>();
  const rosterCountByEventId = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const categoryEventCounts = new Map<string, number>();
  const weekdayCounts = new Map<string, number>();
  const checkInCounts = new Map<string, number>();

  for (const row of attendanceRows) {
    if (!row.event_id) continue;
    attendanceByEventId.set(row.event_id, [
      ...(attendanceByEventId.get(row.event_id) ?? []),
      row,
    ]);
    const methodLabel =
      row.check_in_method === "nfc_qr"
        ? "NFC / QR"
        : row.check_in_method === "mobile_member"
          ? "Mobile member"
          : row.check_in_method === "kiosk"
            ? "Kiosk"
            : row.check_in_method === "staff"
              ? "Staff"
              : row.check_in_method === "import"
                ? "Import"
        : row.check_in_method === "self_checkin"
          ? "Self check-in"
          : "Manual admin";
    checkInCounts.set(methodLabel, (checkInCounts.get(methodLabel) ?? 0) + 1);
  }

  for (const row of rosterRows) {
    rosterCountByEventId.set(
      row.event_id,
      (rosterCountByEventId.get(row.event_id) ?? 0) + 1,
    );
  }

  const topEvents = events
    .map((event) => {
      const attendances = attendanceByEventId.get(event.id) ?? [];
      const attendanceCount = attendances.length;
      const rosterCount = rosterCountByEventId.get(event.id) ?? 0;
      const visitorCount = attendances.filter(
        (entry) => profileMembershipById.get(entry.profile_id) === "visitor",
      ).length;
      const weekdayLabel = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
      }).format(new Date(event.starts_at));

      categoryCounts.set(
        toDisplayLabel(event.category),
        (categoryCounts.get(toDisplayLabel(event.category)) ?? 0) + attendanceCount,
      );
      categoryEventCounts.set(
        toDisplayLabel(event.category),
        (categoryEventCounts.get(toDisplayLabel(event.category)) ?? 0) + 1,
      );
      weekdayCounts.set(weekdayLabel, (weekdayCounts.get(weekdayLabel) ?? 0) + 1);

      return {
        id: event.id,
        title: event.title,
        category: event.category,
        startsAt: event.starts_at,
        attendanceCount,
        rosterCount,
        visitorCount,
        pressureRatio:
          rosterCount > 0 ? Number((attendanceCount / rosterCount).toFixed(1)) : attendanceCount,
      };
    })
    .sort((left, right) => right.attendanceCount - left.attendanceCount)
    .slice(0, 8);

  const attendanceTotal = attendanceRows.length;
  const pressuredEvents = topEvents.filter(
    (event) => event.attendanceCount >= 20 && (event.rosterCount === 0 || event.pressureRatio >= 10),
  ).length;

  const categoryRows = [...categoryCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, value], index) => ({
      label,
      value,
      tone: toneForIndex(index),
      detail: `${categoryEventCounts.get(label) ?? 0} events`,
    }));

  const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayRows = weekdayOrder.map((label, index) => ({
    label,
    value: weekdayCounts.get(label) ?? 0,
    tone: toneForIndex(index),
  }));

  return {
    range,
    summary: {
      totalEvents: events.length,
      attendanceTotal,
      averageAttendance:
        events.length > 0 ? Math.round(attendanceTotal / Math.max(events.length, 1)) : 0,
      visitorTouches: attendanceRows.filter(
        (entry) => profileMembershipById.get(entry.profile_id) === "visitor",
      ).length,
      pressuredEvents,
    },
    attendanceTrend: buildTrendSeries(
      attendanceRows.map((row) => row.checked_in_at),
      range,
    ),
    categoryBreakdown: categoryRows,
    weekdayBreakdown: weekdayRows,
    checkInMethodBreakdown: buildBreakdownRows(checkInCounts),
    topEvents,
  };
}

function buildGivingReportsFromRaw(
  range: ReportTimeRange,
  donations: BaseDonationRow[],
): GivingReportsData {
  const rangeStart = getRangeStart(range).getTime();
  const rangeDonations = donations.filter(
    (row) => new Date(row.created_at).getTime() >= rangeStart,
  );

  const fundMap = new Map<string, FundBreakdownRow>();
  const fundDonorSets = new Map<string, Set<string>>();
  const earliestByProfileId = new Map<string, number>();
  const donorsInRange = new Set<string>();
  const recurringDonors = new Set<string>();
  let anonymousCount = 0;
  let totalAmountCents = 0;

  for (const donation of donations) {
    if (!donation.profile_id) continue;
    const createdAt = new Date(donation.created_at).getTime();
    earliestByProfileId.set(
      donation.profile_id,
      Math.min(earliestByProfileId.get(donation.profile_id) ?? createdAt, createdAt),
    );
  }

  for (const donation of rangeDonations) {
    totalAmountCents += donation.amount_cents;

    if (donation.is_anonymous) {
      anonymousCount += 1;
    }

    if (donation.profile_id) {
      donorsInRange.add(donation.profile_id);
    }

    if (donation.is_recurring && donation.profile_id && donation.stripe_subscription_id) {
      recurringDonors.add(donation.profile_id);
    }

    const key = donation.fund_designation ?? "General Fund";
    const current = fundMap.get(key) ?? {
      label: key,
      amountCents: 0,
      giftCount: 0,
      donorCount: 0,
      tone: toneForIndex(fundMap.size),
    };
    current.amountCents += donation.amount_cents;
    current.giftCount += 1;

    if (donation.profile_id) {
      const donorSet = fundDonorSets.get(key) ?? new Set<string>();
      donorSet.add(donation.profile_id);
      fundDonorSets.set(key, donorSet);
      current.donorCount = donorSet.size;
    }

    fundMap.set(key, current);
  }

  let firstTimeGiverCount = 0;
  let returningGiverCount = 0;
  for (const profileId of donorsInRange) {
    const earliest = earliestByProfileId.get(profileId);
    if (earliest && earliest >= rangeStart) {
      firstTimeGiverCount += 1;
    } else {
      returningGiverCount += 1;
    }
  }

  const recurringGiftCount = rangeDonations.filter(
    (row) => row.is_recurring && row.stripe_subscription_id,
  ).length;
  const oneTimeGiftCount = rangeDonations.length - recurringGiftCount;

  return {
    range,
    summary: {
      totalAmountCents,
      giftCount: rangeDonations.length,
      recurringDonorCount: recurringDonors.size,
      firstTimeGiverCount,
      anonymousGiftShare:
        rangeDonations.length > 0 ? anonymousCount / rangeDonations.length : 0,
    },
    givingTrend: buildTrendSeries(
      rangeDonations.map((row) => row.created_at),
      range,
    ).map((point) => {
      const bucket = buildTrendBuckets(range).find((entry) => entry.label === point.label);
      if (!bucket) {
        return point;
      }

      const amount = rangeDonations
        .filter((row) => {
          const time = new Date(row.created_at).getTime();
          return time >= bucket.start.getTime() && time < bucket.end.getTime();
        })
        .reduce((sum, row) => sum + row.amount_cents, 0);

      return {
        label: point.label,
        value: amount,
      };
    }),
    fundBreakdown: [...fundMap.values()].sort(
      (left, right) => right.amountCents - left.amountCents,
    ),
    donorJourneyBreakdown: [
      { label: "New givers", value: firstTimeGiverCount, tone: "churchBlue" },
      { label: "Returning givers", value: returningGiverCount, tone: "teal" },
      { label: "Recurring donors", value: recurringDonors.size, tone: "grape" },
      { label: "Anonymous gifts", value: anonymousCount, tone: "orange" },
    ],
    giftMixBreakdown: [
      {
        label: "Recurring gifts",
        value: recurringGiftCount,
        tone: "churchBlue",
        detail: formatPercent(
          rangeDonations.length > 0 ? recurringGiftCount / rangeDonations.length : 0,
        ),
      },
      {
        label: "One-time gifts",
        value: oneTimeGiftCount,
        tone: "teal",
        detail: formatPercent(
          rangeDonations.length > 0 ? oneTimeGiftCount / rangeDonations.length : 0,
        ),
      },
      {
        label: "Anonymous gifts",
        value: anonymousCount,
        tone: "grape",
        detail: formatPercent(
          rangeDonations.length > 0 ? anonymousCount / rangeDonations.length : 0,
        ),
      },
    ],
  };
}

export async function getMemberReportsData(
  session: ChurchAppSession,
  range: ReportTimeRange,
): Promise<MemberReportsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewMemberReports(range);
  }

  const churchId = session.appContext.church.id;
  const rangeStart = getRangeStart(range).toISOString();

  if (shouldUseLocalTenantFallback()) {
    const [profilesResult, attendanceResult, ministryResult] = await Promise.all([
      queryTenantLocalDb<BaseProfileRow>(
        `
          select id, full_name, membership_status, last_attendance, email, phone, contact_allowed, family_id
          from public.profiles
          where church_id = $1
            and merged_at is null
        `,
        [churchId],
      ),
      queryTenantLocalDb<BaseAttendanceRow>(
        `
          select profile_id, checked_in_at
          from public.attendance
          where church_id = $1
            and checked_in_at >= $2::timestamptz
        `,
        [churchId, rangeStart],
      ),
      queryTenantLocalDb<BaseMinistryAssignmentRow>(
        `
          select profile_id
          from public.profile_ministries
          where church_id = $1
        `,
        [churchId],
      ),
    ]);

    return buildMemberReportsFromRaw(
      range,
      profilesResult.rows,
      attendanceResult.rows,
      ministryResult.rows,
    );
  }

  const supabase = await createTenantServerClient();
  const [{ data: profiles }, { data: attendance }, { data: ministryAssignments }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, membership_status, last_attendance, email, phone, contact_allowed, family_id",
        )
        .eq("church_id", churchId)
        .is("merged_at", null),
      supabase
        .from("attendance")
        .select("profile_id, checked_in_at")
        .eq("church_id", churchId)
        .gte("checked_in_at", rangeStart),
      supabase
        .from("profile_ministries")
        .select("profile_id")
        .eq("church_id", churchId),
    ]);

  return buildMemberReportsFromRaw(
    range,
    (profiles ?? []) as BaseProfileRow[],
    (attendance ?? []) as BaseAttendanceRow[],
    (ministryAssignments ?? []) as BaseMinistryAssignmentRow[],
  );
}

export async function getEventReportsData(
  session: ChurchAppSession,
  range: ReportTimeRange,
): Promise<EventReportsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewEventReports(range);
  }

  const churchId = session.appContext.church.id;
  const rangeStart = getRangeStart(range).toISOString();

  if (shouldUseLocalTenantFallback()) {
    const [eventsResult, attendanceResult, rosterResult, profileResult] =
      await Promise.all([
        queryTenantLocalDb<BaseEventRow>(
          `
            select id, title, category, starts_at
            from public.events
            where church_id = $1
              and starts_at >= $2::timestamptz
            order by starts_at desc
          `,
          [churchId, rangeStart],
        ),
        queryTenantLocalDb<BaseEventAttendanceRow>(
          `
            select event_id, profile_id, checked_in_at, check_in_method
            from public.attendance
            where church_id = $1
              and checked_in_at >= $2::timestamptz
          `,
          [churchId, rangeStart],
        ),
        queryTenantLocalDb<BaseRosterRow>(
          `
            select roster.event_id, roster.profile_id
            from public.event_rosters roster
            join public.events event
              on event.id = roster.event_id
            where roster.church_id = $1
              and event.starts_at >= $2::timestamptz
          `,
          [churchId, rangeStart],
        ),
        queryTenantLocalDb<{ id: string; membership_status: string | null }>(
          `
            select id, membership_status
            from public.profiles
            where church_id = $1
              and merged_at is null
          `,
          [churchId],
        ),
      ]);

    return buildEventReportsFromRaw(
      range,
      eventsResult.rows,
      attendanceResult.rows,
      rosterResult.rows,
      new Map(
        profileResult.rows.map((row) => [row.id, row.membership_status ?? "unknown"]),
      ),
    );
  }

  const supabase = await createTenantServerClient();
  const [{ data: events }, { data: attendance }, { data: profiles }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, category, starts_at")
      .eq("church_id", churchId)
      .gte("starts_at", rangeStart)
      .order("starts_at", { ascending: false }),
    supabase
      .from("attendance")
      .select("event_id, profile_id, checked_in_at, check_in_method")
      .eq("church_id", churchId)
      .gte("checked_in_at", rangeStart),
    supabase
      .from("profiles")
      .select("id, membership_status")
      .eq("church_id", churchId)
      .is("merged_at", null),
  ]);

  const eventIds = ((events ?? []) as BaseEventRow[]).map((event) => event.id);
  const rosterRows =
    eventIds.length > 0
      ? (
          await supabase
            .from("event_rosters")
            .select("event_id, profile_id")
            .in("event_id", eventIds)
            .eq("church_id", churchId)
        ).data ?? []
      : [];

  return buildEventReportsFromRaw(
    range,
    (events ?? []) as BaseEventRow[],
    (attendance ?? []) as BaseEventAttendanceRow[],
    rosterRows as BaseRosterRow[],
    new Map(
      ((profiles ?? []) as Array<{ id: string; membership_status: string | null }>).map(
        (row) => [row.id, row.membership_status ?? "unknown"],
      ),
    ),
  );
}

export async function getGivingReportsData(
  session: ChurchAppSession,
  range: ReportTimeRange,
): Promise<GivingReportsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewGivingReports(range);
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<BaseDonationRow>(
      `
        select
          profile_id,
          amount_cents,
          fund_designation,
          is_recurring,
          is_anonymous,
          created_at,
          stripe_subscription_id
        from public.donations
        where church_id = $1
          and status = 'succeeded'
        order by created_at desc
      `,
      [churchId],
    );

    return buildGivingReportsFromRaw(range, result.rows);
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("donations")
    .select(
      "profile_id, amount_cents, fund_designation, is_recurring, is_anonymous, created_at, stripe_subscription_id",
    )
    .eq("church_id", churchId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  return buildGivingReportsFromRaw(range, (data ?? []) as BaseDonationRow[]);
}
