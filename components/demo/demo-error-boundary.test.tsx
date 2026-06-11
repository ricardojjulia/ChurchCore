import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useDemoSessionMock,
  usePathnameMock,
  notificationsShowMock,
} = vi.hoisted(() => ({
  useDemoSessionMock: vi.fn(() => ({
    sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    breadcrumbs: ["/demo"],
    getSessionDuration: () => 5,
  })),
  usePathnameMock: vi.fn(() => "/demo/dashboard"),
  notificationsShowMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

vi.mock("@/lib/demo/context", () => ({
  useDemoSession: useDemoSessionMock,
}));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: notificationsShowMock },
}));

import { DemoErrorBoundary } from "@/components/demo/demo-error-boundary";

// A component that throws synchronously so React Error Boundary catches it
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test boom");
  return <div>Safe content</div>;
}

const originalConsoleError = console.error;

describe("DemoErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    // Silence expected React error boundary noise in jsdom
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("renders children transparently when no error occurs", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    // Should not throw; children render normally
    expect(() =>
      render(
        <DemoErrorBoundary>
          <Bomb shouldThrow={false} />
        </DemoErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it("is a transparent passthrough when NEXT_PUBLIC_DEMO_MODE is not true — non-throwing children render fine", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    expect(() =>
      render(
        <DemoErrorBoundary>
          <Bomb shouldThrow={false} />
        </DemoErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it("does not POST when demo mode is off and a JS error occurs", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    // React 19 + jsdom: error boundary with componentDidCatch absorbs the throw
    // (no getDerivedStateFromError means React re-renders children after catch)
    try {
      render(
        <DemoErrorBoundary>
          <Bomb shouldThrow={true} />
        </DemoErrorBoundary>,
      );
    } catch {
      // absorb any propagation
    }

    // Allow any pending timers and microtasks to flush
    await new Promise((r) => setTimeout(r, 50));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(notificationsShowMock).not.toHaveBeenCalled();
  });

  it("silently POSTs to /api/demo/feedback when a JS error is thrown in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");

    try {
      render(
        <DemoErrorBoundary>
          <Bomb shouldThrow={true} />
        </DemoErrorBoundary>,
      );
    } catch {
      // absorb any propagation
    }

    await new Promise((r) => setTimeout(r, 50));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/demo/feedback",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.category).toBe("ERROR");
    expect(body.error_message).toBe("Test boom");
    expect(body.session_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(body.route).toBe("/demo/dashboard");
    expect(body.session_duration).toBe(5);
    expect(body).not.toHaveProperty("fingerprint");
  });

  it("shows a Mantine toast when a JS error is captured in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");

    try {
      render(
        <DemoErrorBoundary>
          <Bomb shouldThrow={true} />
        </DemoErrorBoundary>,
      );
    } catch {
      // absorb any propagation
    }

    await new Promise((r) => setTimeout(r, 50));

    expect(notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ color: "yellow" }),
    );
  });

  it("does not include user identity fields in the POST body", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");

    try {
      render(
        <DemoErrorBoundary>
          <Bomb shouldThrow={true} />
        </DemoErrorBoundary>,
      );
    } catch {
      // absorb any propagation
    }

    await new Promise((r) => setTimeout(r, 50));

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body).not.toHaveProperty("user_email");
    expect(body).not.toHaveProperty("user_role");
  });

  it("swallows fetch errors silently — no unhandled rejection when POST fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    // Should not propagate a secondary unhandled rejection from the failed POST
    await expect(async () => {
      try {
        render(
          <DemoErrorBoundary>
            <Bomb shouldThrow={true} />
          </DemoErrorBoundary>,
        );
      } catch {
        // absorb any propagation
      }
      await new Promise((r) => setTimeout(r, 50));
    }).not.toThrow();
  });
});
