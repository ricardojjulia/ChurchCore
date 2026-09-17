import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/lib/auth";
import { ApplicationShell } from "./app-shell";
import type { ShellNavItem } from "./app-shell";

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const mockUsePathname = vi.fn();
const mockUseRouter = vi.fn(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockSession = {
  source: "supabase",
  userId: "user-1",
  canAccessControl: false,
  memberships: [],
  tenantViews: [],
  profile: {
    id: "profile-1",
    name: "John Doe",
    email: "john@example.com",
    title: "Member",
    roleId: "member",
    defaultPath: "/app/member",
    focus: "General",
    isPastoral: false,
  },
  appContext: {
    kind: "church",
    source: "membership",
    church: { id: "church-1", name: "Grace Church", slug: "grace", timezone: "UTC" },
    roleId: "member",
    homePath: "/app/member",
  },
  homePath: "/app/member",
} as unknown as AuthSession;

describe("ApplicationShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  function renderShell(navItems: ShellNavItem[] = [], calendarHref: string | null = "/app/calendar") {
    return render(
      <MantineProvider>
        <ApplicationShell
          session={mockSession}
          workspaceHref="/app/member"
          calendarHref={calendarHref}
          sectionLabel="Member Portal"
          title="Grace Church"
          description="Main dashboard"
          sidebarTitle="Grace Church"
          sidebarDescription="Sidebar details"
          navItems={navItems}
        >
          <div>Main Content</div>
        </ApplicationShell>
      </MantineProvider>,
    );
  }

  it("renders main content and branding", () => {
    mockUsePathname.mockReturnValue("/app/member");
    renderShell();

    expect(screen.getByText("Main Content")).toBeInTheDocument();
    expect(screen.getAllByText("Grace Church").length).toBeGreaterThan(0);
    expect(screen.getByText("Member Portal")).toBeInTheDocument();
  });

  it("renders dynamic highlights correctly when active", () => {
    mockUsePathname.mockReturnValue("/app/member/custom");

    const navItems = [
      {
        href: "/app/member/custom",
        label: "Custom Page",
        description: "A custom test page",
        icon: "Building2",
      },
    ];

    renderShell(navItems);

    const link = screen.getByRole("link", { name: /custom page/i });
    expect(link).toHaveAttribute("href", "/app/member/custom");
  });
});
