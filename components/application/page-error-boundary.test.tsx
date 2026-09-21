import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { PageErrorBoundary } from "@/components/application/page-error-boundary";

describe("PageErrorBoundary", () => {
  beforeEach(() => {
    captureExceptionMock.mockReset();
  });

  it("reports the error to Sentry on mount", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    render(
      <MantineProvider>
        <PageErrorBoundary error={error} reset={vi.fn()} />
      </MantineProvider>,
    );

    expect(captureExceptionMock).toHaveBeenCalledWith(error);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("calls reset when Try again is clicked", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(
      <MantineProvider>
        <PageErrorBoundary error={new Error("boom")} reset={reset} />
      </MantineProvider>,
    );

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
