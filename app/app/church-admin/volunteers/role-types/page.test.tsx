import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// This route (app/app/church-admin/volunteers/role-types/page.tsx) had zero
// test coverage before this pass — a genuine gap left by the interrupted
// build, not just an under-tested area. Mirrors the sibling
// app/app/church-admin/volunteers/schedules/page.test.tsx convention.

const {
  redirectMock,
  requireChurchSessionMock,
  getRoleTypesMock,
  getChurchSkillOptionsMock,
  applicationShellMock,
  roleTypeManagerMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw { url };
  }),
  requireChurchSessionMock: vi.fn(),
  getRoleTypesMock: vi.fn(),
  getChurchSkillOptionsMock: vi.fn(),
  applicationShellMock: vi.fn(({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  )),
  roleTypeManagerMock: vi.fn(() => <div>Role Type Manager</div>),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/volunteer-data", () => ({
  getRoleTypes: getRoleTypesMock,
  getChurchSkillOptions: getChurchSkillOptionsMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: applicationShellMock,
}));

vi.mock("@/components/application/role-type-manager", () => ({
  RoleTypeManager: roleTypeManagerMock,
}));

import RoleTypesPage from "@/app/app/church-admin/volunteers/role-types/page";

describe("role types page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { name: "Grace Church" } },
      homePath: "/app/member",
    });
    getRoleTypesMock.mockResolvedValue([{ id: "role-1", name: "Greeter", isActive: true }]);
    getChurchSkillOptionsMock.mockResolvedValue(["Hospitality", "Sound"]);
  });

  it("redirects member and volunteer roles away", async () => {
    for (const roleId of ["member", "volunteer"]) {
      requireChurchSessionMock.mockResolvedValueOnce({
        appContext: { roleId, church: { name: "Grace Church" } },
        homePath: "/app/member",
      });

      await expect(RoleTypesPage()).rejects.toMatchObject({ url: "/app/member" });
    }
  });

  it.each(["pastor", "ministry-leader"])(
    "renders (does not redirect) for %s role",
    async (roleId) => {
      requireChurchSessionMock.mockResolvedValueOnce({
        appContext: { roleId, church: { name: "Grace Church" } },
        homePath: "/app/member",
      });

      const page = await RoleTypesPage();
      render(page);

      expect(redirectMock).not.toHaveBeenCalled();
      expect(screen.getByText("Role Types")).toBeInTheDocument();
      expect(screen.getByText("Role Type Manager")).toBeInTheDocument();
    },
  );

  it("renders for church-admin and passes canManage=true, loaded role types, and skill options", async () => {
    const page = await RoleTypesPage();
    render(page);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText("Role Types")).toBeInTheDocument();
    expect(screen.getByText("Grace Church")).toBeInTheDocument();
    expect(roleTypeManagerMock).toHaveBeenCalledWith(
      {
        roleTypes: [{ id: "role-1", name: "Greeter", isActive: true }],
        skillOptions: ["Hospitality", "Sound"],
        canManage: true,
      },
      undefined,
    );
  });

  it("loads role types and skill options scoped to the session's own church (via getRoleTypes/getChurchSkillOptions)", async () => {
    const session = {
      appContext: { roleId: "church-admin", church: { id: "church-9", name: "Other Church" } },
      homePath: "/app/member",
    };
    requireChurchSessionMock.mockResolvedValueOnce(session);

    await RoleTypesPage();

    expect(getRoleTypesMock).toHaveBeenCalledWith(session);
    expect(getChurchSkillOptionsMock).toHaveBeenCalledWith(session);
  });
});
