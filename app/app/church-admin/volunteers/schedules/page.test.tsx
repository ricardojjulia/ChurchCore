import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  requireChurchSessionMock,
  getChurchAdminEventsListMock,
  getServicePlanListMock,
  getServicePlanTemplatesMock,
  hasTenantBackendEnvMock,
  applicationShellMock,
  workspaceMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  requireChurchSessionMock: vi.fn(),
  getChurchAdminEventsListMock: vi.fn(),
  getServicePlanListMock: vi.fn(),
  getServicePlanTemplatesMock: vi.fn(),
  hasTenantBackendEnvMock: vi.fn(),
  applicationShellMock: vi.fn(({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  )),
  workspaceMock: vi.fn(() => <div>Service Plans Workspace</div>),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/volunteer-data", () => ({
  getServicePlanList: getServicePlanListMock,
  getServicePlanTemplates: getServicePlanTemplatesMock,
}));

vi.mock("@/lib/church-admin-events-data", () => ({
  getChurchAdminEventsList: getChurchAdminEventsListMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: applicationShellMock,
}));

vi.mock("@/components/application/volunteer-schedule", () => ({
  ServicePlansWorkspace: workspaceMock,
}));

import ServicePlansPage from "@/app/app/church-admin/volunteers/schedules/page";

describe("service plans page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { name: "Grace Church" } },
      homePath: "/app/member",
      source: "supabase",
    });
    getChurchAdminEventsListMock.mockResolvedValue([{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }]);
    getServicePlanListMock.mockResolvedValue([{ id: "plan-1" }]);
    getServicePlanTemplatesMock.mockResolvedValue([{ id: "template-1" }]);
    hasTenantBackendEnvMock.mockReturnValue(true);
  });

  it("redirects non-admin users", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { name: "Grace Church" } },
      homePath: "/app/member",
    });

    await expect(ServicePlansPage()).rejects.toMatchObject({ url: "/app/member" });
  });

  it.each(["pastor", "ministry-leader"])(
    "renders (does not redirect) for %s role",
    async (roleId) => {
      requireChurchSessionMock.mockResolvedValueOnce({
        appContext: { roleId, church: { name: "Grace Church" } },
        homePath: "/app/member",
        source: "supabase",
      });

      const page = await ServicePlansPage();
      render(page);

      expect(redirectMock).not.toHaveBeenCalled();
      expect(screen.getByText("Service Plans")).toBeInTheDocument();
      expect(screen.getByText("Service Plans Workspace")).toBeInTheDocument();
    },
  );

  it("renders workspace with loaded plans and templates", async () => {
    const page = await ServicePlansPage();
    render(page);

    expect(screen.getByText("Service Plans")).toBeInTheDocument();
    expect(screen.getByText("Grace Church")).toBeInTheDocument();
    expect(screen.getByText("Service Plans Workspace")).toBeInTheDocument();
    expect(workspaceMock).toHaveBeenCalledWith(
      {
        plans: [{ id: "plan-1" }],
        events: [{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }],
        templates: [{ id: "template-1" }],
        source: "live",
        churchToday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
      undefined,
    );
  });

  it("passes the church's today, so tonight's service isn't split into Past after 8 pm (Council Review 24)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 8:30 pm on Oct 5 in New York; UTC is already Oct 6.
    vi.setSystemTime(new Date("2026-10-06T00:30:00Z"));
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { name: "Grace Church", timezone: "America/New_York" } },
    });

    render(await ServicePlansPage());
    vi.useRealTimers();

    expect(workspaceMock).toHaveBeenCalledWith(expect.objectContaining({ churchToday: "2026-10-05" }), undefined);
  });

  it("passes preview source when the tenant backend is unavailable", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const page = await ServicePlansPage();
    render(page);

    expect(workspaceMock).toHaveBeenCalledWith(
      {
        plans: [{ id: "plan-1" }],
        events: [{ id: "event-1", title: "Sunday Worship", startsAt: "2026-04-21T09:00:00Z" }],
        templates: [{ id: "template-1" }],
        source: "preview",
        churchToday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
      undefined,
    );
  });
});
