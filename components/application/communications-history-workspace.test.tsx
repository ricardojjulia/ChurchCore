/**
 * CC-COMM-001
 * AC11: Scheduled message shows Cancel button; cancelled/delivered do not.
 * AC15: Failed/bounced message shows Retry button; delivered does not.
 */

import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { cancelScheduledMessageActionMock, retryCommunicationActionMock, useRouterMock } =
  vi.hoisted(() => ({
    cancelScheduledMessageActionMock: vi.fn(async () => ({ ok: true })),
    retryCommunicationActionMock: vi.fn(async () => ({ retried: true })),
    useRouterMock: { push: vi.fn(), refresh: vi.fn() },
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => useRouterMock,
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

vi.mock("@/app/app/communications-actions", () => ({
  cancelScheduledMessageAction: cancelScheduledMessageActionMock,
  retryCommunicationAction: retryCommunicationActionMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import { CommunicationsHistoryWorkspace } from "@/components/application/communications-history-workspace";
import type { ChurchAppSession } from "@/lib/auth";
import type { CommunicationLogSummary } from "@/lib/communications-types";

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
    bodyPreview: "Hello",
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

function renderWorkspace(logs: CommunicationLogSummary[]) {
  return render(
    <MantineProvider>
      <CommunicationsHistoryWorkspace session={buildSession()} logs={logs} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CommunicationsHistoryWorkspace — AC11 (Cancel for scheduled)", () => {
  it("shows Cancel button for a scheduled message", () => {
    renderWorkspace([
      buildLog({ status: "scheduled", sentAt: null, scheduledFor: "2030-06-01T09:00:00Z" }),
    ]);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("does not show Cancel for a delivered/sent message", () => {
    renderWorkspace([buildLog({ status: "sent" })]);
    // The only Cancel-like link is "New Message" — there should be no cancel action button
    const cancelButtons = screen
      .queryAllByRole("button", { name: /cancel/i })
      .filter((el) => !el.closest("a"));
    expect(cancelButtons).toHaveLength(0);
  });

  it("does not show Cancel for a cancelled message", () => {
    renderWorkspace([buildLog({ status: "cancelled" })]);
    const cancelButtons = screen
      .queryAllByRole("button", { name: /cancel/i })
      .filter((el) => !el.closest("a"));
    expect(cancelButtons).toHaveLength(0);
  });

  it("does not show Cancel for a failed message", () => {
    renderWorkspace([buildLog({ status: "failed" })]);
    const cancelButtons = screen
      .queryAllByRole("button", { name: /cancel/i })
      .filter((el) => !el.closest("a"));
    expect(cancelButtons).toHaveLength(0);
  });
});

describe("CommunicationsHistoryWorkspace — AC15 (Retry for failed)", () => {
  it("shows Retry button for a failed message with retryCount < 3", () => {
    renderWorkspace([buildLog({ status: "failed", retryCount: 0 })]);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows Retry button for a bounced message with retryCount < 3", () => {
    renderWorkspace([buildLog({ status: "bounced", retryCount: 1 })]);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("does NOT show Retry for a failed message with retryCount >= 3", () => {
    renderWorkspace([buildLog({ status: "failed", retryCount: 3 })]);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("does NOT show Retry for a delivered/sent message", () => {
    renderWorkspace([buildLog({ status: "sent" })]);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("does NOT show Retry for a scheduled message", () => {
    renderWorkspace([
      buildLog({ status: "scheduled", sentAt: null, scheduledFor: "2030-06-01T09:00:00Z" }),
    ]);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});

describe("CommunicationsHistoryWorkspace — empty state", () => {
  it("shows empty state message when there are no logs", () => {
    renderWorkspace([]);
    expect(screen.getByText(/No messages sent yet/i)).toBeInTheDocument();
  });
});

describe("CommunicationsHistoryWorkspace — multiple logs", () => {
  it("renders cancel only for the scheduled log among mixed-status rows", () => {
    renderWorkspace([
      buildLog({ id: "log-scheduled", status: "scheduled", sentAt: null, scheduledFor: "2030-06-01T09:00:00Z" }),
      buildLog({ id: "log-sent", status: "sent" }),
      buildLog({ id: "log-failed", status: "failed", retryCount: 0 }),
    ]);
    // Exactly one Cancel action (for the scheduled row)
    const cancelButtons = screen
      .queryAllByRole("button", { name: /cancel/i })
      .filter((el) => !el.closest("a"));
    expect(cancelButtons).toHaveLength(1);

    // Exactly one Retry action (for the failed row)
    expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(1);
  });
});
