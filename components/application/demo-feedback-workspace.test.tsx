import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { notificationsShowMock } = vi.hoisted(() => ({ notificationsShowMock: vi.fn() }));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: notificationsShowMock },
}));

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/control/demo-feedback"),
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
  ApplicationShell: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import { DemoFeedbackWorkspace } from "@/components/application/demo-feedback-workspace";
import type { DemoFeedbackRow } from "@/lib/control-plane-demo-feedback";
import type { AuthSession } from "@/lib/auth";

const makeRow = (overrides: Partial<DemoFeedbackRow> = {}): DemoFeedbackRow => ({
  id: "row-1",
  fingerprint: "a".repeat(64),
  session_id: "session-1",
  route: "/demo/dashboard",
  category: "BUG",
  error_message: null,
  note: "Test note",
  breadcrumbs: [],
  user_email: "user@example.com",
  user_role: "church_admin",
  demo_version: "1.0.0",
  session_duration_seconds: 125,
  hit_count: 3,
  metadata: {},
  processed: false,
  action: null,
  created_at: "2026-07-11T10:00:00Z",
  updated_at: "2026-07-11T10:00:00Z",
  ...overrides,
});

const mockSession = {
  source: "preview",
  profile: {
    id: "sarah-platform",
    name: "Sarah Bennett",
    email: "sarah@churchcoreops.app",
    title: "Platform SuperAdmin",
    roleId: "super-admin",
    defaultPath: "/control",
    focus: "Oversight",
  },
  userId: "sarah-platform",
  appContext: { kind: "control", homePath: "/control" },
  homePath: "/control",
  canAccessControl: true,
  memberships: [],
  tenantViews: [],
} as unknown as AuthSession;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>;
}

describe("DemoFeedbackWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders all columns", () => {
    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows: [makeRow()] }} session={mockSession} />
      </Wrapper>,
    );
    expect(screen.getByText("When")).toBeDefined();
    expect(screen.getByText("User")).toBeDefined();
    expect(screen.getByText("Route")).toBeDefined();
    expect(screen.getByText("Category")).toBeDefined();
    expect(screen.getByText("Note / Error")).toBeDefined();
    expect(screen.getByText("Action")).toBeDefined();
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
  });

  it("category filter reduces rows", async () => {
    const user = userEvent.setup();
    const rows = [
      makeRow({ id: "row-1", category: "BUG", user_email: "a@test.com" }),
      makeRow({ id: "row-2", category: "IMPROVEMENT", user_email: "b@test.com" }),
    ];

    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows }} session={mockSession} />
      </Wrapper>,
    );

    expect(screen.getByText("a@test.com")).toBeDefined();
    expect(screen.getByText("b@test.com")).toBeDefined();

    const select = screen.getByRole("combobox");
    await user.click(select);
    const improvementOption = await screen.findByText("Improvement");
    await user.click(improvementOption);

    expect(screen.queryByText("a@test.com")).toBeNull();
    expect(screen.getByText("b@test.com")).toBeDefined();
  });

  it("email filter (substring) reduces rows", async () => {
    const user = userEvent.setup();
    const rows = [
      makeRow({ id: "row-1", user_email: "alice@example.com" }),
      makeRow({ id: "row-2", user_email: "bob@example.com" }),
    ];

    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows }} session={mockSession} />
      </Wrapper>,
    );

    const emailInput = screen.getByPlaceholderText("Filter by email or role");
    await user.type(emailInput, "alice");

    expect(screen.getByText("alice@example.com")).toBeDefined();
    expect(screen.queryByText("bob@example.com")).toBeNull();
  });

  it("date filter reduces rows", async () => {
    const user = userEvent.setup();
    const rows = [
      makeRow({ id: "row-1", created_at: "2026-01-01T10:00:00Z", user_email: "jan@test.com" }),
      makeRow({ id: "row-2", created_at: "2026-06-01T10:00:00Z", user_email: "jun@test.com" }),
    ];

    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows }} session={mockSession} />
      </Wrapper>,
    );

    const fromInput = screen.getByLabelText("From");
    await user.type(fromInput, "2026-03-01");

    expect(screen.queryByText("jan@test.com")).toBeNull();
    expect(screen.getByText("jun@test.com")).toBeDefined();
  });

  it("expand button opens drawer", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows: [makeRow()] }} session={mockSession} />
      </Wrapper>,
    );

    const expandBtn = screen.getByRole("button", { name: /expand row/i });
    await user.click(expandBtn);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("2m 5s")).toBeDefined();
  });

  it("shows empty state when no rows", () => {
    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows: [] }} session={mockSession} />
      </Wrapper>,
    );
    expect(screen.getByText("All caught up — no open items.")).toBeDefined();
  });

  it("shows an unavailable warning instead of an empty success state", () => {
    render(
      <Wrapper>
        <DemoFeedbackWorkspace
          feedbackResult={{ status: "unavailable", rows: [], message: "Storage is not configured." }}
          session={mockSession}
        />
      </Wrapper>,
    );

    expect(screen.getByText("Feedback unavailable")).toBeDefined();
    expect(screen.getByText("Storage is not configured.")).toBeDefined();
    expect(screen.queryByText("All caught up — no open items.")).toBeNull();
  });

  it("optimistically marks an item done and sends the mutation", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows: [makeRow()] }} session={mockSession} />
      </Wrapper>,
    );

    await user.click(screen.getByRole("switch", { name: "Mark as processed" }));

    expect(screen.getByText("All caught up — no open items.")).toBeDefined();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/control/demo-feedback/row-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ processed: true }),
        }),
      ),
    );
  });

  it("rolls back an optimistic processed update when the server rejects it", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network unavailable"));
    render(
      <Wrapper>
        <DemoFeedbackWorkspace feedbackResult={{ status: "ready", rows: [makeRow()] }} session={mockSession} />
      </Wrapper>,
    );

    await user.click(screen.getByRole("switch", { name: "Mark as processed" }));

    await waitFor(() => expect(screen.getByText("user@example.com")).toBeDefined());
    expect(screen.getByRole("switch", { name: "Mark as processed" })).not.toBeChecked();
    expect(notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Update failed", color: "red" }),
    );
  });
});
