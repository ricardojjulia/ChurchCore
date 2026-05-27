import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarHub } from "@/components/application/calendar-hub";

const {
  applicationShellMock,
  calendarLiveBoardMock,
  contextBannerMock,
  memberBottomNavMock,
} = vi.hoisted(() => ({
  applicationShellMock: vi.fn(
    ({ title, children, bottomNav }: { title: string; children: React.ReactNode; bottomNav?: React.ReactNode }) => (
      <div>
        <h1>{title}</h1>
        {bottomNav ? <div data-testid="bottom-nav-slot">{bottomNav}</div> : null}
        {children}
      </div>
    ),
  ),
  calendarLiveBoardMock: vi.fn(() => <div>Calendar board</div>),
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

describe("CalendarHub", () => {
  const baseData = {
    events: [],
    categoryCounts: [],
    pendingApprovals: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders member bottom navigation for member role", () => {
    render(
      <MantineProvider>
        <CalendarHub
          session={{
            homePath: "/app/member",
            appContext: {
              kind: "church",
              roleId: "member",
              church: { name: "Grace Church", timezone: "America/New_York" },
            },
          } as never}
          data={baseData as never}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-slot")).toBeInTheDocument();
    expect(memberBottomNavMock).toHaveBeenCalled();
  });

  it("does not render member bottom navigation for church-admin role", () => {
    render(
      <MantineProvider>
        <CalendarHub
          session={{
            homePath: "/app/church-admin",
            appContext: {
              kind: "church",
              roleId: "church-admin",
              church: { name: "Grace Church", timezone: "America/New_York" },
            },
          } as never}
          data={baseData as never}
        />
      </MantineProvider>,
    );

    expect(screen.queryByTestId("bottom-nav-slot")).not.toBeInTheDocument();
    expect(memberBottomNavMock).not.toHaveBeenCalled();
  });
});
