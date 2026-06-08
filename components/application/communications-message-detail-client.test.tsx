/**
 * CC-COMM-001
 * AC17: Per-message analytics: sent, delivered, bounced, open rate (null for SMS),
 *       suppressed — aggregates only.
 * AC20: Analytics never show individual member open/click status.
 *       "Individual recipient data is not tracked" note must be present.
 */

import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import { CommunicationsMessageDetailClient } from "@/components/application/communications-message-detail-client";
import type { ChurchAppSession } from "@/lib/auth";
import type { MessageAnalytics, CommunicationLogSummary } from "@/lib/communications-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSession(): ChurchAppSession {
  return {
    source: "supabase",
    userId: "user-1",
    homePath: "/app",
    canAccessControl: false,
    memberships: [],
    tenantViews: [],
    profile: {
      id: "profile-1",
      name: "Pastor John",
      email: "john@church.example",
      title: "Pastor",
      roleId: "pastor",
      defaultPath: "/app",
      focus: "",
      isPastoral: true,
    },
    appContext: {
      kind: "church",
      source: "membership",
      church: {
        id: "church-1",
        name: "Grace Church",
        slug: "grace-church",
        timezone: "America/Chicago",
      },
      roleId: "pastor",
      homePath: "/app",
    },
  };
}

function buildLog(overrides: Partial<CommunicationLogSummary> = {}): CommunicationLogSummary {
  return {
    id: "log-1",
    channel: "email",
    subject: "Sunday Bulletin",
    bodyPreview: "Hello congregation",
    status: "sent",
    scheduledFor: null,
    sentAt: "2026-01-01T10:00:00.000Z",
    createdAt: "2026-01-01T09:00:00.000Z",
    retryCount: 0,
    segmentCriteria: null,
    sentByName: "Pastor John",
    ...overrides,
  };
}

function buildAnalytics(overrides: Partial<MessageAnalytics> = {}): MessageAnalytics {
  return {
    logId: "log-1",
    sentCount: 10,
    deliveredCount: 8,
    bouncedCount: 1,
    failedCount: 1,
    openRate: 0.5,
    suppressedCount: 2,
    ...overrides,
  };
}

function renderDetail(
  log: CommunicationLogSummary,
  analytics: MessageAnalytics,
) {
  return render(
    <MantineProvider>
      <CommunicationsMessageDetailClient
        session={buildSession()}
        log={log}
        analytics={analytics}
      />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── AC17: aggregate analytics rendered correctly ──────────────────────────────

describe("CommunicationsMessageDetailClient — AC17 (aggregate analytics)", () => {
  it("renders Sent count", () => {
    renderDetail(buildLog(), buildAnalytics({ sentCount: 10 }));
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("renders Delivered count", () => {
    renderDetail(buildLog(), buildAnalytics({ deliveredCount: 8 }));
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("renders Bounced / Failed aggregate", () => {
    // bouncedCount:1 + failedCount:1 = 2 combined in the tile.
    // The unique figure is 999 to avoid collisions with other counters.
    renderDetail(buildLog(), buildAnalytics({ bouncedCount: 499, failedCount: 500 }));
    expect(screen.getByText("Bounced / Failed")).toBeInTheDocument();
    // The component renders bouncedCount + failedCount = 999
    expect(screen.getByText("999")).toBeInTheDocument();
  });

  it("renders Suppressed count", () => {
    renderDetail(buildLog(), buildAnalytics({ suppressedCount: 77 }));
    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    expect(screen.getByText("77")).toBeInTheDocument();
  });

  it("renders Open Rate as percentage for email channel", () => {
    renderDetail(buildLog({ channel: "email" }), buildAnalytics({ openRate: 0.5 }));
    expect(screen.getByText("Open Rate")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });

  it("renders Open Rate as N/A for SMS channel", () => {
    renderDetail(
      buildLog({ channel: "sms", subject: null }),
      buildAnalytics({ openRate: null }),
    );
    expect(screen.getByText("Open Rate")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders N/A for Open Rate even when openRate value is provided for SMS (AC17)", () => {
    // If the server sends a non-null openRate for SMS, the UI must still show N/A
    renderDetail(
      buildLog({ channel: "sms", subject: null }),
      buildAnalytics({ openRate: 0.3 }),
    );
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.queryByText("30.0%")).not.toBeInTheDocument();
  });
});

// ── AC20: no individual recipient data ───────────────────────────────────────

describe("CommunicationsMessageDetailClient — AC20 (no individual data)", () => {
  it("shows the 'Individual recipient data is not tracked' note", () => {
    renderDetail(buildLog(), buildAnalytics());
    expect(
      screen.getByText(/Individual recipient data is not tracked/i),
    ).toBeInTheDocument();
  });

  it("does not render any email address or phone number in the analytics section", () => {
    renderDetail(buildLog(), buildAnalytics());
    // There must be no element with @ or typical phone patterns
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    expect(body).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  });

  it("does not render a list of individual recipients", () => {
    renderDetail(buildLog(), buildAnalytics());
    // Common mistake: rendering a <ul>/<ol> of recipients. Confirm none exist
    // in the analytics section.
    const lists = screen.queryAllByRole("list");
    // Lists may exist in nav — but no list should contain contact-style content
    for (const list of lists) {
      expect(list.textContent).not.toMatch(
        /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
      );
    }
  });
});

// ── Segment criteria rendered as human-readable tags ─────────────────────────

describe("CommunicationsMessageDetailClient — segment criteria tags", () => {
  it("shows 'All eligible members' badge when segmentCriteria is null", () => {
    renderDetail(buildLog({ segmentCriteria: null }), buildAnalytics());
    expect(screen.getByText("All eligible members")).toBeInTheDocument();
  });

  it("shows 'All eligible members' badge when segmentCriteria is empty object", () => {
    renderDetail(buildLog({ segmentCriteria: {} }), buildAnalytics());
    expect(screen.getByText("All eligible members")).toBeInTheDocument();
  });

  it("renders Role tag with human-readable label", () => {
    renderDetail(
      buildLog({ segmentCriteria: { role: "pastor" } }),
      buildAnalytics(),
    );
    expect(screen.getByText(/Role: Pastor/)).toBeInTheDocument();
  });

  it("renders church_admin role label correctly", () => {
    renderDetail(
      buildLog({ segmentCriteria: { role: "church_admin" } }),
      buildAnalytics(),
    );
    expect(screen.getByText(/Role: Church Admin/)).toBeInTheDocument();
  });

  it("renders Ministry tag showing count of selected ministries", () => {
    renderDetail(
      buildLog({ segmentCriteria: { ministryIds: ["min-1", "min-2"] } }),
      buildAnalytics(),
    );
    expect(screen.getByText(/Ministry: 2 selected/)).toBeInTheDocument();
  });

  it("renders Membership Status tag with human-readable label", () => {
    renderDetail(
      buildLog({ segmentCriteria: { membershipStatus: "active" } }),
      buildAnalytics(),
    );
    expect(screen.getByText(/Status: Active/)).toBeInTheDocument();
  });

  it("renders 'Attended within' days tag", () => {
    renderDetail(
      buildLog({ segmentCriteria: { attendedWithinDays: 30 } }),
      buildAnalytics(),
    );
    expect(screen.getByText(/Attended within: 30 days/)).toBeInTheDocument();
  });

  it("renders multiple segment criteria tags simultaneously", () => {
    renderDetail(
      buildLog({
        segmentCriteria: {
          role: "secretary",
          membershipStatus: "baptized",
          attendedWithinDays: 14,
        },
      }),
      buildAnalytics(),
    );
    expect(screen.getByText(/Role: Secretary/)).toBeInTheDocument();
    expect(screen.getByText(/Status: Baptized/)).toBeInTheDocument();
    expect(screen.getByText(/Attended within: 14 days/)).toBeInTheDocument();
  });
});
