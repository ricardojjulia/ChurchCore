import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom stubs
if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
if (typeof document.fonts === "undefined") {
  Object.defineProperty(document, "fonts", {
    value: { addEventListener: () => {}, removeEventListener: () => {} },
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { generateBibleStudyAnswerActionMock } = vi.hoisted(() => ({
  generateBibleStudyAnswerActionMock: vi.fn(),
}));

vi.mock("@/app/app/elders-actions", () => ({
  generateBibleStudyAnswerAction: generateBibleStudyAnswerActionMock,
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/components/ai/disclaimer-gate", () => ({
  DisclaimerGate: ({
    onConfirm,
  }: {
    featureKey: string;
    onConfirm: () => void;
  }) => (
    <div data-testid="disclaimer-gate">
      <button type="button" onClick={onConfirm}>
        I Understand
      </button>
    </div>
  ),
}));

import { BibleStudyClient } from "@/components/application/bible-study-client";
import type { ChurchAppSession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pastorSession(): ChurchAppSession {
  return {
    homePath: "/app/pastor",
    appContext: {
      kind: "church",
      roleId: "pastor",
      church: { id: "c1", name: "Grace Church", slug: "grace", timezone: "UTC" },
      source: "membership",
      homePath: "/app/pastor",
    },
    profile: {
      id: "p1",
      name: "Pastor Tom",
      email: "tom@grace.church",
      title: "Lead Pastor",
      roleId: "pastor",
      defaultPath: "/app/pastor",
      focus: "",
      isPastoral: true,
    },
    userId: "u1",
    source: "supabase",
    canAccessControl: false,
    memberships: [],
    tenantViews: [],
  } as unknown as ChurchAppSession;
}

function renderClient(session = pastorSession()) {
  return render(
    <MantineProvider>
      <BibleStudyClient session={session} />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BibleStudyClient", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders empty state on mount", () => {
    renderClient();
    expect(
      screen.getByText("Enter a passage or topic above to get started."),
    ).toBeInTheDocument();
  });

  it("shows character counter", () => {
    renderClient();
    expect(screen.getByText("0/500")).toBeInTheDocument();
  });

  it("disables Ask button when query is empty", () => {
    renderClient();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("enables Ask button when query is non-empty", async () => {
    const user = userEvent.setup();
    renderClient();
    const textarea = screen.getByLabelText("Passage or Topic");
    await user.type(textarea, "Romans 8");
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });

  it("shows disclaimer gate when sessionStorage not set", async () => {
    const user = userEvent.setup();
    renderClient();
    const textarea = screen.getByLabelText("Passage or Topic");
    await user.type(textarea, "Forgiveness");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByTestId("disclaimer-gate")).toBeInTheDocument();
  });

  it("calls generateBibleStudyAnswerAction on submit when disclaimer already confirmed", async () => {
    sessionStorage.setItem("ai_disclaimer_bible_study", "shown");
    generateBibleStudyAnswerActionMock.mockResolvedValue({
      ok: true,
      sections: {
        context: "Context text",
        keyThemes: ["Grace", "Redemption"],
        applicationPoints: ["Apply grace daily"],
        discussionQuestions: ["How does grace change you?"],
        footer: "Check your Bible.",
      },
    });

    const user = userEvent.setup();
    renderClient();
    const textarea = screen.getByLabelText("Passage or Topic");
    await user.type(textarea, "Romans 8:28");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => {
      expect(generateBibleStudyAnswerActionMock).toHaveBeenCalledWith({
        query: "Romans 8:28",
      });
    });
  });

  it("displays sections on success", async () => {
    sessionStorage.setItem("ai_disclaimer_bible_study", "shown");
    generateBibleStudyAnswerActionMock.mockResolvedValue({
      ok: true,
      sections: {
        context: "Paul writes about freedom from condemnation.",
        keyThemes: ["Grace", "Spirit"],
        applicationPoints: ["Walk by the Spirit"],
        discussionQuestions: ["What does no condemnation mean to you?"],
        footer: "Verify with your Bible.",
      },
    });

    const user = userEvent.setup();
    renderClient();
    const textarea = screen.getByLabelText("Passage or Topic");
    await user.type(textarea, "Romans 8:1");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => {
      expect(
        screen.getByText("Paul writes about freedom from condemnation."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(screen.getByText("1. Walk by the Spirit")).toBeInTheDocument();
    expect(
      screen.getByText("1. What does no condemnation mean to you?"),
    ).toBeInTheDocument();
  });

  it("displays error alert on failure", async () => {
    sessionStorage.setItem("ai_disclaimer_bible_study", "shown");
    generateBibleStudyAnswerActionMock.mockResolvedValue({
      ok: false,
      error: "AI features are not configured in this environment.",
    });

    const user = userEvent.setup();
    renderClient();
    const textarea = screen.getByLabelText("Passage or Topic");
    await user.type(textarea, "Philippians 4:13");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => {
      expect(
        screen.getByText("AI features are not configured in this environment."),
      ).toBeInTheDocument();
    });
  });

  it("updates character counter as user types", async () => {
    const user = userEvent.setup();
    renderClient();
    const textarea = screen.getByLabelText("Passage or Topic");
    await user.type(textarea, "Hello");
    expect(screen.getByText("5/500")).toBeInTheDocument();
  });

  it("proceeds to call action after disclaimer confirm", async () => {
    generateBibleStudyAnswerActionMock.mockResolvedValue({
      ok: true,
      sections: {
        context: "Context",
        keyThemes: [],
        applicationPoints: [],
        discussionQuestions: [],
        footer: "Check Bible.",
      },
    });

    const user = userEvent.setup();
    renderClient();
    const textarea = screen.getByLabelText("Passage or Topic");
    await user.type(textarea, "John 3:16");

    // Submit — disclaimer gate shows because sessionStorage is not set
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByTestId("disclaimer-gate")).toBeInTheDocument();

    // Click "I Understand" in the mock disclaimer gate
    await user.click(screen.getByRole("button", { name: "I Understand" }));

    await waitFor(() => {
      expect(generateBibleStudyAnswerActionMock).toHaveBeenCalledWith({
        query: "John 3:16",
      });
    });
  });
});
