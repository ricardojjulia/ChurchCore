import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { PageLoadingSkeleton } from "@/components/application/page-loading-skeleton";

describe("PageLoadingSkeleton", () => {
  it("renders a busy, polite live region for assistive tech", () => {
    const { container } = render(
      <MantineProvider>
        <PageLoadingSkeleton />
      </MantineProvider>,
    );

    const region = container.querySelector("[aria-busy='true']");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});
