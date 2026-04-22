import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemberBottomNav } from "@/components/application/member-bottom-nav";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("MemberBottomNav", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  function renderNav() {
    return render(
      <MantineProvider>
        <MemberBottomNav />
      </MantineProvider>,
    );
  }

  it("renders the expected member navigation links", () => {
    mockUsePathname.mockReturnValue("/app/member");
    renderNav();

    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/app/member");
    expect(screen.getByRole("link", { name: /calendar/i })).toHaveAttribute("href", "/app/calendar");
    expect(screen.getByRole("link", { name: /groups/i })).toHaveAttribute("href", "/app/member/groups");
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute("href", "/app/member/schedule");
  });

  it("highlights the active route", () => {
    mockUsePathname.mockReturnValue("/app/member/groups");
    renderNav();

    expect(screen.getByText("Groups")).toHaveStyle({ fontWeight: "700" });
    expect(screen.getByText("Home")).toHaveStyle({ fontWeight: "400" });
  });
});