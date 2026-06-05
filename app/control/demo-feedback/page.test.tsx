import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  requireControlPlaneSessionMock,
  loadDemoFeedbackMock,
  demoFeedbackWorkspaceMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  requireControlPlaneSessionMock: vi.fn(),
  loadDemoFeedbackMock: vi.fn(),
  demoFeedbackWorkspaceMock: vi.fn(() => <div>Demo Feedback Workspace</div>),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  requireControlPlaneSession: requireControlPlaneSessionMock,
}));

vi.mock("@/lib/control-plane-demo-feedback", () => ({
  loadDemoFeedback: loadDemoFeedbackMock,
}));

vi.mock("@/components/application/demo-feedback-workspace", () => ({
  DemoFeedbackWorkspace: demoFeedbackWorkspaceMock,
}));

import DemoFeedbackPage from "@/app/control/demo-feedback/page";

const mockControlSession = {
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
};

describe("/control/demo-feedback page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireControlPlaneSessionMock.mockResolvedValue(mockControlSession);
    loadDemoFeedbackMock.mockResolvedValue([]);
  });

  it("redirects to sign-in when requireControlPlaneSession throws (no control-plane access)", async () => {
    requireControlPlaneSessionMock.mockImplementationOnce(() => {
      // Simulate next/navigation redirect throw — same pattern as requireControlPlaneSession internals
      throw { url: "/sign-in?redirectTo=%2Fcontrol%2Fdemo-feedback&force=1" };
    });

    await expect(DemoFeedbackPage()).rejects.toMatchObject({
      url: expect.stringContaining("/sign-in"),
    });
  });

  it("calls requireControlPlaneSession with the correct redirect path", async () => {
    await DemoFeedbackPage();
    expect(requireControlPlaneSessionMock).toHaveBeenCalledWith("/control/demo-feedback");
  });

  it("uses the control-plane client to load feedback data (not a tenant client)", async () => {
    await DemoFeedbackPage();
    expect(loadDemoFeedbackMock).toHaveBeenCalledOnce();
  });

  it("renders DemoFeedbackWorkspace with session and feedback data", async () => {
    const rows = [
      {
        id: "row-1",
        fingerprint: "a".repeat(64),
        session_id: "session-1",
        route: "/demo/dashboard",
        category: "BUG",
        error_message: null,
        note: "An issue",
        breadcrumbs: [],
        user_email: null,
        user_role: null,
        demo_version: "1.0.0",
        hit_count: 1,
        metadata: {},
        created_at: "2026-07-11T00:00:00Z",
        updated_at: "2026-07-11T00:00:00Z",
      },
    ];
    loadDemoFeedbackMock.mockResolvedValueOnce(rows);

    const page = await DemoFeedbackPage();
    render(page);

    expect(screen.getByText("Demo Feedback Workspace")).toBeDefined();
    expect(demoFeedbackWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackData: rows,
        session: mockControlSession,
      }),
      undefined,
    );
  });

  it("renders with an empty feedback list when no submissions exist", async () => {
    loadDemoFeedbackMock.mockResolvedValueOnce([]);

    const page = await DemoFeedbackPage();
    render(page);

    expect(demoFeedbackWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackData: [] }),
      undefined,
    );
  });
});
