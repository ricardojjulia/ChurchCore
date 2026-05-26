import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { ReadinessTargetState } from "@/components/application/readiness-target-state";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderState(element: React.ReactNode) {
  return render(<MantineProvider>{element}</MantineProvider>);
}

describe("ReadinessTargetState", () => {
  it("renders completed state with actions", () => {
    renderState(
      <ReadinessTargetState
        state="completed"
        title="Target complete"
        description="Everything is resolved."
        primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
      />,
    );

    expect(screen.getByTestId("readiness-target-state-completed")).toBeInTheDocument();
    expect(screen.getByText("Target complete")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to readiness" })).toHaveAttribute(
      "href",
      "/app/church-admin/readiness",
    );
  });

  it("renders unavailable backend and validation states distinctly", () => {
    const { rerender } = renderState(
      <ReadinessTargetState
        state="no-backend"
        title="Target unavailable"
        description="Tenant data is required."
      />,
    );

    expect(screen.getByTestId("readiness-target-state-no-backend")).toBeInTheDocument();
    expect(screen.getByText("Tenant data is required.")).toBeInTheDocument();

    rerender(
      <MantineProvider>
        <ReadinessTargetState
          state="validation-error"
          title="Needs attention"
          description="Resolve the records below."
          detail="3 items need review."
        />
      </MantineProvider>,
    );

    expect(screen.getByTestId("readiness-target-state-validation-error")).toBeInTheDocument();
    expect(screen.getByText("3 items need review.")).toBeInTheDocument();
  });
});
