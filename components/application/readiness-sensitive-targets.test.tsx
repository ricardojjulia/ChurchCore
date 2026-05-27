import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { applicationShellMock } = vi.hoisted(() => ({
  applicationShellMock: vi.fn(
    ({ children, title }: { children: React.ReactNode; title: string }) => (
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    ),
  ),
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: applicationShellMock,
}));

vi.mock("@/app/app/communications-actions", () => ({
  broadcastMessageAction: vi.fn(),
}));

import { CcmDashboardView } from "@/components/application/ccm-dashboard";
import { CommunicationsHub } from "@/components/application/communications-hub";
import { FinanceJournalWorkspace } from "@/components/application/finance-journal-workspace";
import { ReportsOverviewDashboard } from "@/components/application/reports-dashboards";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  CommunicationLogEntry,
  CommunicationsHubData,
} from "@/lib/communications-data";
import type { FinanceJournal } from "@/lib/finance-types";
import type {
  EventReportsData,
  GivingReportsData,
  MemberReportsData,
} from "@/lib/reports-data";
import type { ReadinessSummary } from "@/lib/readiness-contract";

const session = {
  appContext: {
    roleId: "church-admin",
    church: { id: "church-1", name: "Grace Church" },
  },
} as ChurchAppSession;

function renderWithMantine(element: React.ReactNode) {
  return render(<MantineProvider>{element}</MantineProvider>);
}

function journal(overrides: Partial<FinanceJournal> = {}): FinanceJournal {
  return {
    id: "journal-1",
    churchId: "church-1",
    journalDate: "2026-05-27",
    description: "Sunday giving deposit",
    journalType: "general",
    status: "draft",
    reference: null,
    postedBy: null,
    postedAt: null,
    createdBy: null,
    createdAt: "2026-05-27T10:00:00.000Z",
    updatedAt: "2026-05-27T10:00:00.000Z",
    ...overrides,
  };
}

function log(overrides: Partial<CommunicationLogEntry> = {}): CommunicationLogEntry {
  return {
    id: "log-1",
    sentByName: "Admin",
    recipientName: "Member",
    channel: "email",
    subject: "Sunday",
    bodyPreview: "Join us",
    status: "failed",
    scheduledFor: null,
    sentAt: null,
    createdAt: "2026-05-27T10:00:00.000Z",
    ...overrides,
  };
}

const memberReports: MemberReportsData = {
  range: "90d",
  summary: {
    totalPeople: 20,
    activePeople: 15,
    visitorCount: 2,
    atRiskCount: 1,
    contactableCount: 18,
  },
  attendanceTrend: [{ label: "May 27", value: 15 }],
  statusBreakdown: [{ label: "Members", value: 18, tone: "churchBlue" }],
  recencyBreakdown: [{ label: "Recent", value: 15, tone: "teal" }],
  engagementBreakdown: [{ label: "Serving", value: 7, tone: "grape" }],
  driftAlerts: [],
};

const eventReports: EventReportsData = {
  range: "90d",
  summary: {
    totalEvents: 4,
    attendanceTotal: 80,
    averageAttendance: 20,
    visitorTouches: 3,
    pressuredEvents: 1,
  },
  attendanceTrend: [{ label: "May 27", value: 80 }],
  categoryBreakdown: [{ label: "Worship", value: 4, tone: "churchBlue" }],
  weekdayBreakdown: [{ label: "Sunday", value: 4, tone: "teal" }],
  checkInMethodBreakdown: [{ label: "Staff", value: 80, tone: "grape" }],
  topEvents: [],
};

const givingReports: GivingReportsData = {
  range: "90d",
  summary: {
    totalAmountCents: 250000,
    giftCount: 12,
    recurringDonorCount: 4,
    firstTimeGiverCount: 1,
    anonymousGiftShare: 0.1,
  },
  givingTrend: [{ label: "May 27", value: 250000 }],
  fundBreakdown: [{ label: "General", amountCents: 250000, giftCount: 12, donorCount: 10, tone: "churchBlue" }],
  donorJourneyBreakdown: [{ label: "Returning", value: 11, tone: "teal" }],
  giftMixBreakdown: [{ label: "One-time", value: 8, tone: "grape" }],
};

const reportsReadiness: ReadinessSummary = {
  id: "reports",
  module: "reports",
  title: "Reports",
  description: "Review report coverage.",
  status: "attention",
  severity: "warning",
  issueCount: 1,
  completionState: "needs_review",
  recommendedAction: "Open reports and confirm missing finance inputs.",
  target: { route: "/app/reports", query: { range: "90d" } },
  href: "/app/reports?range=90d",
  detail: "20 report profiles · 4 recent events · 12 recent gifts · 0 posted finance journals · 1 active budget.",
};

describe("sensitive readiness target states", () => {
  it("shows no-backend state for children's readiness in preview mode", () => {
    renderWithMantine(
      <CcmDashboardView
        session={session}
        dashboard={null}
        services={[]}
        activeServiceId={null}
        readinessView
        dataSource="preview"
      />,
    );

    expect(screen.getByTestId("readiness-target-state-no-backend")).toBeInTheDocument();
    expect(screen.getByText("Children's readiness target unavailable")).toBeInTheDocument();
  });

  it("shows validation state for draft finance journals", () => {
    renderWithMantine(
      <FinanceJournalWorkspace
        session={session}
        journals={[journal()]}
        readinessView
        dataSource="live"
      />,
    );

    expect(screen.getByTestId("readiness-target-state-validation-error")).toBeInTheDocument();
    expect(screen.getByText("Draft journals need finance review")).toBeInTheDocument();
  });

  it("shows validation state for communications delivery and consent gaps", () => {
    const data: CommunicationsHubData = {
      recentLogs: [log()],
      recipients: [
        {
          profileId: "profile-1",
          name: "No Contact",
          email: null,
          phone: null,
          role: "member",
          ministries: [],
          emailOptIn: false,
          smsOptIn: false,
        },
      ],
    };

    renderWithMantine(
      <CommunicationsHub
        session={session}
        data={data}
        readinessView
        dataSource="live"
      />,
    );

    expect(screen.getByTestId("readiness-target-state-validation-error")).toBeInTheDocument();
    expect(screen.getByText("Communications readiness needs attention")).toBeInTheDocument();
  });

  it("shows validation state for missing report inputs", () => {
    renderWithMantine(
      <ReportsOverviewDashboard
        members={memberReports}
        events={eventReports}
        giving={givingReports}
        readinessView
        dataSource="live"
        readinessSummary={reportsReadiness}
      />,
    );

    expect(screen.getByTestId("readiness-target-state-validation-error")).toBeInTheDocument();
    expect(screen.getByText("Report inputs need attention")).toBeInTheDocument();
  });
});
