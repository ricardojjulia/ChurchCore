import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

const { shellProps } = vi.hoisted(() => ({ shellProps: [] as Array<{ navItems: Array<{ href: string; label: string }> }> }));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: (props: { navItems: Array<{ href: string; label: string }> }) => {
    shellProps.push(props);
    return null;
  },
}));
vi.mock("@/components/application/tenant-view-controls", () => ({
  ReturnToControlPlaneButton: () => null,
  TenantViewLauncher: () => null,
}));
vi.mock("@/app/control/actions", () => ({}));

import { ControlPlaneDashboard } from "./control-plane-dashboard";

describe("ControlPlaneDashboard nav", () => {
  it("links to Project HQ visibly, after the control-plane sections (Council v2)", () => {
    render(
      <MantineProvider>
        <ControlPlaneDashboard
          session={{ appContext: { kind: "control" }, tenantViews: [] } as never}
          sectionId="overview"
          dashboardData={{ metrics: [], tenantItems: [], auditItems: [] }}
        />
      </MantineProvider>,
    );
    const navItems = shellProps.at(-1)!.navItems;
    expect(navItems.map((item) => item.href)).toEqual([
      "/control",
      "/control/tenants",
      "/control/billing",
      "/control/support",
      "/control/demo-feedback",
      "/hq",
    ]);
    expect(navItems.at(-1)!.label).toBe("Project HQ");
  });
});
