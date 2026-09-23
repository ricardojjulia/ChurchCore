import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServicePlanRoleType } from "@/lib/volunteer-types";

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const {
  createRoleTypeActionMock,
  updateRoleTypeActionMock,
  deactivateRoleTypeActionMock,
} = vi.hoisted(() => ({
  createRoleTypeActionMock: vi.fn(),
  updateRoleTypeActionMock: vi.fn(),
  deactivateRoleTypeActionMock: vi.fn(),
}));

vi.mock("@/app/app/volunteer-actions", () => ({
  createRoleTypeAction: createRoleTypeActionMock,
  updateRoleTypeAction: updateRoleTypeActionMock,
  deactivateRoleTypeAction: deactivateRoleTypeActionMock,
}));

import { RoleTypeManager } from "@/components/application/role-type-manager";

function roleType(overrides: Partial<ServicePlanRoleType> = {}): ServicePlanRoleType {
  return {
    id: "role-1",
    churchId: "church-1",
    name: "Greeter",
    description: "Welcomes guests at the door",
    requiredSkills: ["Hospitality"],
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderManager(
  roleTypes: ServicePlanRoleType[] = [roleType()],
  options: { skillOptions?: string[]; canManage?: boolean } = {},
) {
  const { skillOptions = ["Hospitality", "Sound", "Lighting"], canManage = true } = options;
  return render(
    <MantineProvider>
      <RoleTypeManager roleTypes={roleTypes} skillOptions={skillOptions} canManage={canManage} />
    </MantineProvider>,
  );
}

describe("RoleTypeManager — list rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name, description, required-skill badges, and status", () => {
    renderManager([roleType()]);

    expect(screen.getByText("Greeter")).toBeInTheDocument();
    expect(screen.getByText("Welcomes guests at the door")).toBeInTheDocument();
    expect(screen.getByText("Hospitality")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows 'None' when a role type has no required skills", () => {
    renderManager([roleType({ requiredSkills: [] })]);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("shows an empty state when there are zero role types", () => {
    renderManager([]);
    expect(screen.getByText(/No role types yet/)).toBeInTheDocument();
  });

  it("shows Inactive status for a deactivated role type and no reactivate button", () => {
    renderManager([roleType({ isActive: false })]);

    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reactivate/i })).not.toBeInTheDocument();
    // Edit stays available; Deactivate does not (already inactive).
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });
});

describe("RoleTypeManager — create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a name before submitting", async () => {
    const user = userEvent.setup();
    renderManager([]);

    await user.click(screen.getByRole("button", { name: "New Role Type" }));
    await user.click(await screen.findByRole("button", { name: "Create" }));

    expect(await screen.findByText("Role name is required.")).toBeInTheDocument();
    expect(createRoleTypeActionMock).not.toHaveBeenCalled();
  });

  it("creates a role type and adds it to the list", async () => {
    const user = userEvent.setup();
    createRoleTypeActionMock.mockResolvedValue({ ok: true, id: "role-2" });
    renderManager([]);

    await user.click(screen.getByRole("button", { name: "New Role Type" }));
    await user.type(await screen.findByLabelText(/^Name/, { selector: "input" }), "Sound Tech");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createRoleTypeActionMock).toHaveBeenCalledWith({
        name: "Sound Tech",
        description: undefined,
        requiredSkills: [],
      });
    });
    expect(await screen.findByText("Sound Tech")).toBeInTheDocument();
  });

  it("surfaces a duplicate-name error from the server without closing the form", async () => {
    const user = userEvent.setup();
    createRoleTypeActionMock.mockResolvedValue({
      ok: false,
      error: "A role type named 'Greeter' already exists.",
    });
    renderManager([]);

    await user.click(screen.getByRole("button", { name: "New Role Type" }));
    await user.type(await screen.findByLabelText(/^Name/, { selector: "input" }), "Greeter");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(
      await screen.findByText("A role type named 'Greeter' already exists."),
    ).toBeInTheDocument();
  });
});

describe("RoleTypeManager — edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-fills the form and calls updateRoleTypeAction with the edited values", async () => {
    const user = userEvent.setup();
    updateRoleTypeActionMock.mockResolvedValue({ ok: true });
    renderManager([roleType()]);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByDisplayValue("Greeter")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/^Name/, { selector: "input" });
    await user.clear(nameInput);
    await user.type(nameInput, "Lead Greeter");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateRoleTypeActionMock).toHaveBeenCalledWith({
        roleTypeId: "role-1",
        name: "Lead Greeter",
        description: "Welcomes guests at the door",
        requiredSkills: ["Hospitality"],
      });
    });
    expect(await screen.findByText("Lead Greeter")).toBeInTheDocument();
  });
});

describe("RoleTypeManager — deactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deactivates a role type and flips its status badge (idempotent action, no reactivate control appears)", async () => {
    const user = userEvent.setup();
    deactivateRoleTypeActionMock.mockResolvedValue({ ok: true });
    renderManager([roleType()]);

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(deactivateRoleTypeActionMock).toHaveBeenCalledWith("role-1");
    });
    expect(await screen.findByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });

  it("shows an error and leaves the row unchanged when deactivation fails", async () => {
    const user = userEvent.setup();
    deactivateRoleTypeActionMock.mockResolvedValue({ ok: false, error: "Role type not found." });
    renderManager([roleType()]);

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Role type not found.")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});

describe("RoleTypeManager — RBAC (read-only for non-managing roles)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides create/edit/deactivate affordances when canManage is false", () => {
    renderManager([roleType()], { canManage: false });

    expect(screen.queryByRole("button", { name: "New Role Type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    // The read-only role can still see the role type data.
    expect(screen.getByText("Greeter")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
