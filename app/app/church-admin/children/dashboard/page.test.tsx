import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  requireChurchSessionMock,
  getCcmDashboardMock,
  getCcmServiceListMock,
  dashboardViewMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  requireChurchSessionMock: vi.fn(),
  getCcmDashboardMock: vi.fn(),
  getCcmServiceListMock: vi.fn(),
  dashboardViewMock: vi.fn(({ activeServiceId }: { activeServiceId: string | null }) => (
    <div>CCM Dashboard {activeServiceId ?? "none"}</div>
  )),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/ccm-data", () => ({
  getCcmDashboard: getCcmDashboardMock,
  getCcmServiceList: getCcmServiceListMock,
}));

vi.mock("@/components/application/ccm-dashboard", () => ({
  CcmDashboardView: dashboardViewMock,
}));

import CcmDashboardPage from "@/app/app/church-admin/children/dashboard/page";

describe("ccm dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin" },
      homePath: "/app/member",
    });
    getCcmServiceListMock.mockResolvedValue([
      { id: "service-open", status: "open" },
      { id: "service-closed", status: "closed" },
    ]);
    getCcmDashboardMock.mockResolvedValue({ totals: {} });
  });

  it("redirects non-admin users", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member" },
      homePath: "/app/member",
    });

    await expect(CcmDashboardPage()).rejects.toMatchObject({ url: "/app/member" });
  });

  it("loads dashboard for active open service", async () => {
    const page = await CcmDashboardPage();
    render(page);

    expect(screen.getByText("CCM Dashboard service-open")).toBeInTheDocument();
    expect(getCcmDashboardMock).toHaveBeenCalledWith(
      expect.objectContaining({ appContext: { roleId: "church-admin" } }),
      "service-open",
    );
  });

  it("renders null dashboard when no services exist", async () => {
    getCcmServiceListMock.mockResolvedValueOnce([]);

    const page = await CcmDashboardPage();
    render(page);

    expect(screen.getByText("CCM Dashboard none")).toBeInTheDocument();
    expect(getCcmDashboardMock).not.toHaveBeenCalled();
  });
});
