import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock, useDemoSessionMock, computeFingerprintMock, notificationsShowMock } =
  vi.hoisted(() => ({
    usePathnameMock: vi.fn(() => "/demo"),
    useDemoSessionMock: vi.fn(() => ({
      sessionId: "test-session-id-1234-5678-90ab-cdef12345678",
      breadcrumbs: ["/demo"],
      getSessionDuration: () => 10,
    })),
    computeFingerprintMock: vi.fn(async () => "a".repeat(64)),
    notificationsShowMock: vi.fn(),
  }));

if (!document.fonts) {
  Object.defineProperty(document, "fonts", {
    value: { addEventListener: () => {}, removeEventListener: () => {} },
    writable: true,
  });
}

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

vi.mock("@/lib/demo/context", () => ({
  useDemoSession: useDemoSessionMock,
}));

vi.mock("@/lib/demo/fingerprint", () => ({
  computeFingerprint: computeFingerprintMock,
}));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: notificationsShowMock },
  Notifications: () => null,
}));

import { FeedbackButton } from "@/components/demo/feedback-button";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider>
      <Notifications />
      {children}
    </MantineProvider>
  );
}

describe("FeedbackButton", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  it("renders null when NEXT_PUBLIC_DEMO_MODE is not true", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const { container } = render(
      <Wrapper>
        <FeedbackButton />
      </Wrapper>,
    );
    expect(container.querySelector("[aria-label='Send demo feedback']")).toBeNull();
  });

  it("renders a button when NEXT_PUBLIC_DEMO_MODE is true", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    render(
      <Wrapper>
        <FeedbackButton />
      </Wrapper>,
    );
    expect(screen.getByRole("button", { name: /send demo feedback/i })).toBeDefined();
  });

  it("opens modal on click", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const user = userEvent.setup();
    render(
      <Wrapper>
        <FeedbackButton />
      </Wrapper>,
    );
    await user.click(screen.getByRole("button", { name: /send demo feedback/i }));
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("submit button is disabled when category not selected", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const user = userEvent.setup();
    render(
      <Wrapper>
        <FeedbackButton />
      </Wrapper>,
    );
    await user.click(screen.getByRole("button", { name: /send demo feedback/i }));
    const submitBtn = screen.getByRole("button", { name: /send feedback/i });
    expect(submitBtn).toHaveAttribute("disabled");
  });

  it("calls fetch with correct payload on submit", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const user = userEvent.setup();
    render(
      <Wrapper>
        <FeedbackButton />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /send demo feedback/i }));

    const select = screen.getByRole("combobox");
    await user.click(select);
    const bugOption = await screen.findByText("Bug");
    await user.click(bugOption);

    const submitBtn = screen.getByRole("button", { name: /send feedback/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/demo/feedback",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.category).toBe("BUG");
    expect(body.session_id).toBe("test-session-id-1234-5678-90ab-cdef12345678");
    expect(body.fingerprint).toBe("a".repeat(64));
  });

  it("shows success notification on 200", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const user = userEvent.setup();
    render(
      <Wrapper>
        <FeedbackButton />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /send demo feedback/i }));

    const select = screen.getByRole("combobox");
    await user.click(select);
    const bugOption = await screen.findByText("Bug");
    await user.click(bugOption);

    await user.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(notificationsShowMock).toHaveBeenCalledWith(
        expect.objectContaining({ color: "teal" }),
      );
    });
  });

  it("shows error notification on failed fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const user = userEvent.setup();
    render(
      <Wrapper>
        <FeedbackButton />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /send demo feedback/i }));

    const select = screen.getByRole("combobox");
    await user.click(select);
    const bugOption = await screen.findByText("Bug");
    await user.click(bugOption);

    await user.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(notificationsShowMock).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red" }),
      );
    });
  });
});
