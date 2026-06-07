import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarHub } from "@/components/application/calendar-hub";

// jsdom does not implement ResizeObserver; Mantine's ScrollArea.Autosize requires it.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// ---------------------------------------------------------------------------
// Hoisted mocks — these must be declared before any imports that trigger them
// ---------------------------------------------------------------------------
const {
  applicationShellMock,
  calendarLiveBoardMock,
  contextBannerMock,
  memberBottomNavMock,
} = vi.hoisted(() => ({
  applicationShellMock: vi.fn(
    ({
      title,
      children,
      bottomNav,
    }: {
      title: string;
      children: React.ReactNode;
      bottomNav?: React.ReactNode;
    }) => (
      <div>
        <h1>{title}</h1>
        {bottomNav ? <div data-testid="bottom-nav-slot">{bottomNav}</div> : null}
        {children}
      </div>
    ),
  ),
  // Expose the props passed to CalendarLiveBoard so tests can inspect them
  calendarLiveBoardMock: vi.fn(
    ({
      viewMode,
      onViewModeChange,
    }: {
      viewMode: string;
      onViewModeChange: (mode: "month" | "week" | "day") => void;
    }) => (
      <div data-testid="calendar-live-board" data-view-mode={viewMode}>
        <button type="button" onClick={() => onViewModeChange("week")}>Switch to Week</button>
        <button type="button" onClick={() => onViewModeChange("day")}>Switch to Day</button>
        <button type="button" onClick={() => onViewModeChange("month")}>Switch to Month</button>
        <span>Calendar board</span>
      </div>
    ),
  ),
  contextBannerMock: vi.fn(() => <div>Context banner</div>),
  memberBottomNavMock: vi.fn(() => <div>Member nav</div>),
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: applicationShellMock,
}));

vi.mock("@/components/application/calendar-live-board", () => ({
  CalendarLiveBoard: calendarLiveBoardMock,
}));

vi.mock("@/components/application/church-app-context-banner", () => ({
  ChurchAppContextBanner: contextBannerMock,
}));

vi.mock("@/components/application/member-bottom-nav", () => ({
  MemberBottomNav: memberBottomNavMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminSession(overrides: Record<string, unknown> = {}) {
  return {
    homePath: "/app/church-admin",
    appContext: {
      kind: "church",
      roleId: "church-admin",
      church: { name: "Grace Church", timezone: "America/New_York" },
      ...overrides,
    },
  } as never;
}

function memberSession() {
  return {
    homePath: "/app/member",
    appContext: {
      kind: "church",
      roleId: "member",
      church: { name: "Grace Church", timezone: "America/New_York" },
    },
  } as never;
}

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    events: [],
    categoryCounts: [],
    pendingApprovals: [],
    ...overrides,
  } as never;
}

function renderHub(session = adminSession(), data = baseData()) {
  return render(
    <MantineProvider>
      <CalendarHub session={session} data={data} />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CalendarHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Existing baseline tests (preserved)
  // -------------------------------------------------------------------------

  it("renders member bottom navigation for member role", () => {
    renderHub(memberSession());
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-slot")).toBeInTheDocument();
    expect(memberBottomNavMock).toHaveBeenCalled();
  });

  it("does not render member bottom navigation for church-admin role", () => {
    renderHub();
    expect(screen.queryByTestId("bottom-nav-slot")).not.toBeInTheDocument();
    expect(memberBottomNavMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC7: 4 stat tiles
  // -------------------------------------------------------------------------

  it("renders 4 stat tiles including Upcoming, Categories, Category Breakdown, Needs Approval", () => {
    renderHub();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByText("Category Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Needs Approval")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // AC7: Category Breakdown tile content from categoryCounts
  // -------------------------------------------------------------------------

  it("Category Breakdown tile renders items from categoryCounts with name and count", () => {
    const data = baseData({
      categoryCounts: [
        { category: "worship", count: 5 },
        { category: "prayer", count: 3 },
      ],
    });
    renderHub(adminSession(), data);
    expect(screen.getByText("Worship")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Prayer")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("Category Breakdown tile shows 'No upcoming events.' when categoryCounts is empty", () => {
    renderHub();
    expect(screen.getByText("No upcoming events.")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // AC8: Filter pills in toolbar outside calendar card
  // -------------------------------------------------------------------------

  it('renders at least an "All" filter pill', () => {
    renderHub();
    const allPill = screen.getByRole("button", { name: "All" });
    expect(allPill).toBeInTheDocument();
  });

  it('filter pills have aria-pressed set correctly — "All" starts pressed', () => {
    renderHub();
    const allPill = screen.getByRole("button", { name: "All" });
    // "All" is the default active category
    expect(allPill).toHaveAttribute("aria-pressed", "true");
  });

  it("renders a category pill for each event category derived from events", () => {
    const data = baseData({
      events: [
        {
          id: "1",
          title: "Sunday Service",
          category: "worship",
          startsAt: "2026-06-07T15:00:00Z",
          endsAt: "2026-06-07T17:00:00Z",
          visibility: "public",
          approvalStatus: "approved",
          rsvpEnabled: false,
          viewerRsvpStatus: null,
          description: null,
          location: null,
          ministryId: null,
          ministryName: null,
        },
      ],
      categoryCounts: [{ category: "worship", count: 1 }],
    });
    renderHub(adminSession(), data);
    const worshipPill = screen.getByRole("button", { name: "Worship" });
    expect(worshipPill).toBeInTheDocument();
    expect(worshipPill).toHaveAttribute("aria-pressed", "false");
  });

  // -------------------------------------------------------------------------
  // AC8: Clicking a category pill sets aria-pressed="true" on that pill
  // -------------------------------------------------------------------------

  it("clicking a category pill sets aria-pressed='true' on it and 'false' on All", async () => {
    const user = userEvent.setup();
    const data = baseData({
      events: [
        {
          id: "1",
          title: "Sunday Service",
          category: "worship",
          startsAt: "2026-06-07T15:00:00Z",
          endsAt: "2026-06-07T17:00:00Z",
          visibility: "public",
          approvalStatus: "approved",
          rsvpEnabled: false,
          viewerRsvpStatus: null,
          description: null,
          location: null,
          ministryId: null,
          ministryName: null,
        },
      ],
      categoryCounts: [{ category: "worship", count: 1 }],
    });
    renderHub(adminSession(), data);

    const worshipPill = screen.getByRole("button", { name: "Worship" });
    await user.click(worshipPill);

    expect(worshipPill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // -------------------------------------------------------------------------
  // AC9: Filter persists across view-mode switches
  // -------------------------------------------------------------------------

  it("active category persists when the view mode is switched via CalendarLiveBoard callback", async () => {
    const user = userEvent.setup();
    const data = baseData({
      events: [
        {
          id: "1",
          title: "Sunday Service",
          category: "worship",
          startsAt: "2026-06-07T15:00:00Z",
          endsAt: "2026-06-07T17:00:00Z",
          visibility: "public",
          approvalStatus: "approved",
          rsvpEnabled: false,
          viewerRsvpStatus: null,
          description: null,
          location: null,
          ministryId: null,
          ministryName: null,
        },
      ],
      categoryCounts: [{ category: "worship", count: 1 }],
    });
    renderHub(adminSession(), data);

    // Step 1: activate "Worship" filter
    const worshipPill = screen.getByRole("button", { name: "Worship" });
    await user.click(worshipPill);
    expect(worshipPill).toHaveAttribute("aria-pressed", "true");

    // Step 2: switch view mode via CalendarLiveBoard callback (simulates the board calling onViewModeChange)
    const switchBtn = screen.getByRole("button", { name: "Switch to Week" });
    await user.click(switchBtn);

    // Step 3: filter pill should still be active after view-mode switch
    expect(screen.getByRole("button", { name: "Worship" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // -------------------------------------------------------------------------
  // AC10: Standalone Categories section absent
  // -------------------------------------------------------------------------

  it("renders exactly one element with text 'Category Breakdown' (no duplicate standalone section)", () => {
    const data = baseData({
      categoryCounts: [{ category: "worship", count: 2 }],
    });
    renderHub(adminSession(), data);
    const matches = screen.getAllByText("Category Breakdown");
    expect(matches).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // AC7: Approval queue Paper present for management roles
  // -------------------------------------------------------------------------

  it("renders approval queue for church-admin", () => {
    renderHub();
    expect(screen.getByText("Approval queue")).toBeInTheDocument();
  });

  it("renders approval queue for pastor", () => {
    renderHub(
      {
        homePath: "/app/pastor",
        appContext: {
          kind: "church",
          roleId: "pastor",
          church: { name: "Grace Church", timezone: "America/New_York" },
        },
      } as never,
    );
    expect(screen.getByText("Approval queue")).toBeInTheDocument();
  });

  it("renders approval queue for ministry-leader", () => {
    renderHub(
      {
        homePath: "/app/ministry-leader",
        appContext: {
          kind: "church",
          roleId: "ministry-leader",
          church: { name: "Grace Church", timezone: "America/New_York" },
        },
      } as never,
    );
    expect(screen.getByText("Approval queue")).toBeInTheDocument();
  });

  it("renders approval queue for member role too (queue is always visible)", () => {
    renderHub(memberSession());
    // The approval queue section is always present in the layout
    expect(screen.getByText("Approval queue")).toBeInTheDocument();
  });

  it("renders pending approval events in the approval queue", () => {
    const data = baseData({
      pendingApprovals: [
        {
          id: "p1",
          title: "Pending Worship Event",
          category: "worship",
          startsAt: "2026-06-07T15:00:00Z",
          endsAt: "2026-06-07T17:00:00Z",
          visibility: "public",
          approvalStatus: "pending",
          rsvpEnabled: false,
          viewerRsvpStatus: null,
          description: null,
          location: null,
          ministryId: null,
          ministryName: null,
        },
      ],
    });
    renderHub(adminSession(), data);
    expect(screen.getByText("Pending Worship Event")).toBeInTheDocument();
  });

  it("shows 'Nothing waiting on approval.' when no pending approvals", () => {
    renderHub();
    expect(screen.getByText("Nothing waiting on approval.")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Category filter pills are outside the CalendarLiveBoard (AC8 boundary check)
  // -------------------------------------------------------------------------

  it("category filter pills are rendered outside CalendarLiveBoard (in hub, not board)", () => {
    const data = baseData({
      events: [
        {
          id: "1",
          title: "Sunday Service",
          category: "worship",
          startsAt: "2026-06-07T15:00:00Z",
          endsAt: "2026-06-07T17:00:00Z",
          visibility: "public",
          approvalStatus: "approved",
          rsvpEnabled: false,
          viewerRsvpStatus: null,
          description: null,
          location: null,
          ministryId: null,
          ministryName: null,
        },
      ],
    });
    renderHub(adminSession(), data);

    // The board mock renders a known testid; find it and confirm pill is not inside it
    const board = screen.getByTestId("calendar-live-board");
    const allPillInsideBoard = within(board).queryByRole("button", { name: "All" });
    expect(allPillInsideBoard).not.toBeInTheDocument();

    // But the pill is present at the hub level
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });
});
