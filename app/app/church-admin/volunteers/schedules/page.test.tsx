import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  requireChurchSessionMock,
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

  it("renders workspace with loaded plans and templates", async () => {
    const page = await ServicePlansPage();
    render(page);

    expect(screen.getByText("Service Plans")).toBeInTheDocument();
    expect(screen.getByText("Grace Church")).toBeInTheDocument();
    expect(screen.getByText("Service Plans Workspace")).toBeInTheDocument();
    expect(workspaceMock).toHaveBeenCalledWith(
      {
        plans: [{ id: "plan-1" }],
        templates: [{ id: "template-1" }],
        source: "live",
      },
      undefined,
    );
  });

  it("passes preview source when the tenant backend is unavailable", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const page = await ServicePlansPage();
    render(page);

    expect(workspaceMock).toHaveBeenCalledWith(
      {
        plans: [{ id: "plan-1" }],
        templates: [{ id: "template-1" }],
        source: "preview",
      },
      undefined,
    );
  });
});
