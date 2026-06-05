import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/"),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

import { DemoSessionProvider, useDemoSession } from "@/lib/demo/context";

function TestConsumer() {
  const { sessionId, breadcrumbs, getSessionDuration } = useDemoSession();
  return (
    <div>
      <span data-testid="session-id">{sessionId}</span>
      <span data-testid="breadcrumbs">{JSON.stringify(breadcrumbs)}</span>
      <span data-testid="duration">{getSessionDuration()}</span>
    </div>
  );
}

describe("DemoSessionProvider / useDemoSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllEnvs();
    usePathnameMock.mockReturnValue("/");
  });

  it("generates and persists a session_id to sessionStorage when absent", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    render(
      <DemoSessionProvider>
        <TestConsumer />
      </DemoSessionProvider>,
    );
    const sessionId = screen.getByTestId("session-id").textContent;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionStorage.getItem("cc_demo_session_id")).toBe(sessionId);
  });

  it("reuses session_id from sessionStorage on re-render", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const existingId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    sessionStorage.setItem("cc_demo_session_id", existingId);

    render(
      <DemoSessionProvider>
        <TestConsumer />
      </DemoSessionProvider>,
    );
    expect(screen.getByTestId("session-id").textContent).toBe(existingId);
  });

  it("breadcrumbs are empty on initial mount before pathname effect fires", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    usePathnameMock.mockReturnValue(null as unknown as string);

    render(
      <DemoSessionProvider>
        <TestConsumer />
      </DemoSessionProvider>,
    );
    expect(screen.getByTestId("breadcrumbs").textContent).toBe("[]");
  });

  it("breadcrumbs are capped at 5 after 6 pathname changes", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    usePathnameMock.mockReturnValue("/page-1");

    const { rerender } = render(
      <DemoSessionProvider>
        <TestConsumer />
      </DemoSessionProvider>,
    );

    const paths = ["/page-2", "/page-3", "/page-4", "/page-5", "/page-6"];
    for (const path of paths) {
      usePathnameMock.mockReturnValue(path);
      act(() => {
        rerender(
          <DemoSessionProvider>
            <TestConsumer />
          </DemoSessionProvider>,
        );
      });
    }

    const breadcrumbs = JSON.parse(
      screen.getByTestId("breadcrumbs").textContent ?? "[]",
    ) as string[];
    expect(breadcrumbs.length).toBeLessThanOrEqual(5);
  });

  it("getSessionDuration returns a non-negative number", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    render(
      <DemoSessionProvider>
        <TestConsumer />
      </DemoSessionProvider>,
    );
    const duration = Number(screen.getByTestId("duration").textContent);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it("returns safe defaults when NEXT_PUBLIC_DEMO_MODE is not true", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    render(
      <DemoSessionProvider>
        <TestConsumer />
      </DemoSessionProvider>,
    );
    expect(screen.getByTestId("session-id").textContent).toBe("");
    expect(screen.getByTestId("breadcrumbs").textContent).toBe("[]");
    expect(Number(screen.getByTestId("duration").textContent)).toBe(0);
  });
});
