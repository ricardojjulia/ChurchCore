import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  notFoundMock,
  redirectMock,
  requireChurchSessionMock,
  getChurchAdminEventsListMock,
  getChurchAdminEventWorkspaceDataMock,
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
  getChurchAdminEventWorkspaceDataMock: vi.fn(),
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
  getChurchAdminEventWorkspaceData: getChurchAdminEventWorkspaceDataMock,
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
      plan: { id: "plan-1", name: "Sunday Worship", serviceDate: "2026-04-21", eventId: "event-1" },
    });
    getVolunteerPoolMock.mockResolvedValue([{ profileId: "member-1" }]);
    getChurchAdminEventsListMock.mockResolvedValue([{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }]);
    getChurchAdminEventWorkspaceDataMock.mockResolvedValue({
      event: { id: "event-1", title: "Sunday Worship" },
      rosterEntries: [{ profileId: "member-1" }],
      attendanceEntries: [{ profileId: "member-2" }],
    });
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
        detail: { plan: { id: "plan-1", name: "Sunday Worship", serviceDate: "2026-04-21", eventId: "event-1" } },
        events: [{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }],
        linkedEventOps: {
          eventId: "event-1",
          eventTitle: "Sunday Worship",
          rosterProfileIds: ["member-1"],
          attendanceProfileIds: ["member-2"],
        },
        pool: [{ profileId: "member-1" }],
      },
      undefined,
    );
  });

  it("passes null linkedEventOps when no plan event is linked", async () => {
    getServicePlanDetailMock.mockResolvedValueOnce({
      plan: { id: "plan-1", name: "Sunday Worship", serviceDate: "2026-04-21", eventId: null },
    });

    const page = await ServicePlanDetailPage({ params: Promise.resolve({ id: "plan-1" }) });
    render(page);

    expect(builderMock).toHaveBeenCalledWith(
      {
        detail: { plan: { id: "plan-1", name: "Sunday Worship", serviceDate: "2026-04-21", eventId: null } },
        events: [{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }],
        linkedEventOps: null,
        pool: [{ profileId: "member-1" }],
      },
      undefined,
    );
  });

  it("setlist data passes through to builder", async () => {
    const songItem = {
      id: "item-1",
      planId: "plan-1",
      churchId: "church-1",
      title: "Amazing Grace",
      itemType: "song",
      songKey: "G",
      durationSeconds: 195,
      artist: "Hillsong",
      sortOrder: 0,
      startsAt: null,
      endsAt: null,
      leaderName: null,
      notes: null,
      attachmentUrl: null,
    };
    getServicePlanDetailMock.mockResolvedValueOnce({
      plan: { id: "plan-1", name: "Sunday Worship", serviceDate: "2026-04-21", eventId: "event-1" },
      runOfService: [songItem],
    });

    const page = await ServicePlanDetailPage({ params: Promise.resolve({ id: "plan-1" }) });
    render(page);

    const call = builderMock.mock.calls[0][0];
    expect(call.detail.runOfService).toHaveLength(1);
    expect(call.detail.runOfService[0].songKey).toBe("G");
    expect(call.detail.runOfService[0].durationSeconds).toBe(195);
    expect(call.detail.runOfService[0].artist).toBe("Hillsong");
  });

  it("sermon info passes through to builder", async () => {
    getServicePlanDetailMock.mockResolvedValueOnce({
      plan: {
        id: "plan-1",
        name: "Sunday Worship",
        serviceDate: "2026-04-21",
        eventId: "event-1",
        sermonTitle: "The Living Word",
        sermonSpeaker: "Pastor Nate",
        scriptureReference: "John 1:1",
      },
    });

    const page = await ServicePlanDetailPage({ params: Promise.resolve({ id: "plan-1" }) });
    render(page);

    const call = builderMock.mock.calls[0][0];
    expect(call.detail.plan.sermonTitle).toBe("The Living Word");
    expect(call.detail.plan.sermonSpeaker).toBe("Pastor Nate");
    expect(call.detail.plan.scriptureReference).toBe("John 1:1");
  });
});