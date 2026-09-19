import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  redirectMock,
  requireChurchSessionMock,
  getCommunicationsHubDataMock,
  hasTenantBackendEnvMock,
  communicationsHubMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  requireChurchSessionMock: vi.fn(),
  getCommunicationsHubDataMock: vi.fn(),
  hasTenantBackendEnvMock: vi.fn(),
  communicationsHubMock: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/communications-data", () => ({
  getCommunicationsHubData: getCommunicationsHubDataMock,
}));
vi.mock("@/lib/supabase/tenant", () => ({ hasTenantBackendEnv: hasTenantBackendEnvMock }));
vi.mock("@/components/application/communications-hub", () => ({
  CommunicationsHub: communicationsHubMock,
}));

import CommunicationsPage from "@/app/app/communications/page";

const data = { recentLogs: [], recipients: [], deliveryEvents: [], suppressions: [] };

function session(roleId: string, source: "supabase" | "preview" = "supabase") {
  return {
    source,
    homePath: `/app/${roleId}`,
    appContext: { roleId, church: { id: "church-1", name: "Grace" } },
  };
}

describe("/app/communications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    getCommunicationsHubDataMock.mockResolvedValue(data);
    hasTenantBackendEnvMock.mockReturnValue(true);
  });

  it.each(["pastor", "church-admin", "secretary"])("renders for %s", async (roleId) => {
    const activeSession = session(roleId);
    requireChurchSessionMock.mockResolvedValue(activeSession);

    const element = await CommunicationsPage({
      searchParams: Promise.resolve({ view: "readiness" }),
    });

    expect(element.props).toMatchObject({
      session: activeSession,
      data,
      readinessView: true,
      dataSource: "live",
    });
  });

  it("marks the workspace unavailable when the tenant backend is missing", async () => {
    requireChurchSessionMock.mockResolvedValue(session("church-admin"));
    hasTenantBackendEnvMock.mockReturnValue(false);

    const element = await CommunicationsPage({ searchParams: Promise.resolve({}) });

    expect(element.props.dataSource).toBe("preview");
  });

  it("redirects roles without communications access", async () => {
    requireChurchSessionMock.mockResolvedValue(session("member"));

    await expect(CommunicationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/app/member",
    );
    expect(getCommunicationsHubDataMock).not.toHaveBeenCalled();
  });
});
