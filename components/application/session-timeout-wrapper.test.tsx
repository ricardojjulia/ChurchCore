import { act, render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionTimeoutWrapper } from "@/components/application/session-timeout-wrapper";
import { signOutAction } from "@/app/sign-in/actions";

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("@/app/sign-in/actions", () => ({
  signOutAction: vi.fn(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>;
}

describe("SessionTimeoutWrapper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(signOutAction).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render children", () => {
    render(
      <Wrapper>
        <SessionTimeoutWrapper>
          <div>Test Content</div>
        </SessionTimeoutWrapper>
      </Wrapper>,
    );
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should show warning modal after 14 minutes, and logout after 15 minutes of inactivity", async () => {
    render(
      <Wrapper>
        <SessionTimeoutWrapper>
          <div>Test Content</div>
        </SessionTimeoutWrapper>
      </Wrapper>,
    );

    expect(signOutAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Are you still there? Your session is about to expire due to inactivity.")).toBeNull();

    // Advance 14 minutes -> Warning Modal should be visible
    await act(async () => {
      vi.advanceTimersByTime(14 * 60 * 1000);
    });
    expect(signOutAction).not.toHaveBeenCalled();
    expect(screen.getByText("Are you still there? Your session is about to expire due to inactivity.")).toBeInTheDocument();

    // Advance 1 more minute (total 15 minutes) -> Should log out
    await act(async () => {
      vi.advanceTimersByTime(1 * 60 * 1000);
    });
    expect(signOutAction).toHaveBeenCalledWith(
      expect.stringContaining("Your%20session%20has%20expired%20due%20to%20inactivity."),
    );
  });

  it("should reset inactivity timer on window activity events if warning is not showing", async () => {
    render(
      <Wrapper>
        <SessionTimeoutWrapper>
          <div>Test Content</div>
        </SessionTimeoutWrapper>
      </Wrapper>,
    );

    // Advance 10 minutes
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(screen.queryByText("Are you still there? Your session is about to expire due to inactivity.")).toBeNull();

    // User moves mouse (activity)
    await act(async () => {
      fireEvent.mouseMove(window);
    });

    // Advance another 10 minutes -> modal should still not be showing because it was reset
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(screen.queryByText("Are you still there? Your session is about to expire due to inactivity.")).toBeNull();

    // Advance 4 more minutes (total 14 minutes since mouseMove) -> Warning modal should show
    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(screen.getByText("Are you still there? Your session is about to expire due to inactivity.")).toBeInTheDocument();
  });

  it("should extend session and reset timers when clicking Extend Session", async () => {
    render(
      <Wrapper>
        <SessionTimeoutWrapper>
          <div>Test Content</div>
        </SessionTimeoutWrapper>
      </Wrapper>,
    );

    // Advance 14 minutes to show warning
    await act(async () => {
      vi.advanceTimersByTime(14 * 60 * 1000);
    });
    expect(screen.getByText("Are you still there? Your session is about to expire due to inactivity.")).toBeInTheDocument();

    // Click Extend Session
    const extendBtn = screen.getByRole("button", { name: "Extend Session" });
    await act(async () => {
      fireEvent.click(extendBtn);
    });

    // Modal should close
    expect(screen.queryByText("Are you still there? Your session is about to expire due to inactivity.")).toBeNull();

    // Advance 10 more minutes -> no logout or warning yet
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(signOutAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Are you still there? Your session is about to expire due to inactivity.")).toBeNull();

    // Advance 4 more minutes (total 14 since extension) -> warning shows again
    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(screen.getByText("Are you still there? Your session is about to expire due to inactivity.")).toBeInTheDocument();
  });

  it("should log out immediately when clicking Log Out button in warning modal", async () => {
    render(
      <Wrapper>
        <SessionTimeoutWrapper>
          <div>Test Content</div>
        </SessionTimeoutWrapper>
      </Wrapper>,
    );

    // Advance 14 minutes to show warning
    await act(async () => {
      vi.advanceTimersByTime(14 * 60 * 1000);
    });
    expect(screen.getByText("Are you still there? Your session is about to expire due to inactivity.")).toBeInTheDocument();

    // Click Log Out
    const logoutBtn = screen.getByRole("button", { name: "Log Out" });
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    expect(signOutAction).toHaveBeenCalledWith(
      expect.stringContaining("Your%20session%20has%20expired%20due%20to%20inactivity."),
    );
  });

  it("should log out immediately on event if the actual time difference exceeds timeout", async () => {
    render(
      <Wrapper>
        <SessionTimeoutWrapper>
          <div>Test Content</div>
        </SessionTimeoutWrapper>
      </Wrapper>,
    );

    expect(signOutAction).not.toHaveBeenCalled();

    // Simulate time gap (e.g. computer sleep) by advancing system time
    await act(async () => {
      vi.setSystemTime(Date.now() + 16 * 60 * 1000);
      fireEvent.mouseMove(window);
    });

    expect(signOutAction).toHaveBeenCalled();
  });
});
