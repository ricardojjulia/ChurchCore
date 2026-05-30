import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  notFoundMock,
  redirectMock,
  requireChurchSessionMock,
  getChurchAdminEventsListMock,
  getServicePlanDetailMock,
  getVolunteerPoolMock,
  applicationShellMock,
  builderMock,
} = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  requireChurchSessionMock: vi.fn(),
  getChurchAdminEventsListMock: vi.fn(),
  getServicePlanDetailMock: vi.fn(),
  getVolunteerPoolMock: vi.fn(),
  applicationShellMock: vi.fn(({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  )),
  builderMock: vi.fn(() => <div>Service Plan Builder</div>),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/church-admin-events-data", () => ({
  getChurchAdminEventsList: getChurchAdminEventsListMock,
}));

vi.mock("@/lib/volunteer-data", () => ({
  getServicePlanDetail: getServicePlanDetailMock,
  getVolunteerPool: getVolunteerPoolMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: applicationShellMock,
}));

vi.mock("@/components/application/volunteer-schedule", () => ({
  ServicePlanBuilder: builderMock,
}));

import ServicePlanDetailPage from "@/app/app/church-admin/volunteers/schedules/[id]/page";

describe("service plan detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { name: "Grace Church" } },
      homePath: "/app/member",
    });
    getServicePlanDetailMock.mockResolvedValue({
      plan: { id: "plan-1", name: "Sunday Worship", serviceDate: "2026-04-21" },
    });
    getVolunteerPoolMock.mockResolvedValue([{ profileId: "member-1" }]);
    getChurchAdminEventsListMock.mockResolvedValue([{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }]);
  });

  it("redirects non-admin users", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { name: "Grace Church" } },
      homePath: "/app/member",
    });

    await expect(ServicePlanDetailPage({ params: Promise.resolve({ id: "plan-1" }) })).rejects.toMatchObject({ url: "/app/member" });
  });

  it("renders builder with detail, pool, and event options", async () => {
    const page = await ServicePlanDetailPage({ params: Promise.resolve({ id: "plan-1" }) });
    render(page);

    expect(screen.getByText("Sunday Worship")).toBeInTheDocument();
    expect(screen.getByText("Grace Church")).toBeInTheDocument();
    expect(screen.getByText("Service Plan Builder")).toBeInTheDocument();
    expect(builderMock).toHaveBeenCalledWith(
      {
        detail: { plan: { id: "plan-1", name: "Sunday Worship", serviceDate: "2026-04-21" } },
        events: [{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }],
        pool: [{ profileId: "member-1" }],
      },
      undefined,
    );
  });
});