import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SermonOutlineModal } from "@/components/ai/sermon-outline-modal";

// jsdom does not implement ResizeObserver; Mantine requires it.
if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(overrides: Partial<React.ComponentProps<typeof SermonOutlineModal>> = {}) {
  const defaults: React.ComponentProps<typeof SermonOutlineModal> = {
    opened: true,
    onClose: vi.fn(),
    onAccept: vi.fn(),
    noteTitle: "Walking by Faith",
    noteType: "sermon_outline",
    outline: null,
    error: null,
    ...overrides,
  };
  return {
    ...render(
      <MantineProvider>
        <SermonOutlineModal {...defaults} />
      </MantineProvider>,
    ),
    onClose: defaults.onClose as ReturnType<typeof vi.fn>,
    onAccept: defaults.onAccept as ReturnType<typeof vi.fn>,
  };
}

// ---------------------------------------------------------------------------
// AC 11 — Modal shows title, outline, AI_RESPONSE_FOOTER
// AC 12 — "Use This Outline" calls onAccept with outline text; note not auto-saved
// AC 13 — "Dismiss" calls onClose without calling onAccept
// ---------------------------------------------------------------------------

describe("SermonOutlineModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC 11 — loading state while outline is null and no error
  it("shows a loading spinner when outline and error are both null (AC 11)", () => {
    renderModal({ outline: null, error: null });
    // The component renders two elements with this text: one aria-live (sr-only)
    // and one aria-hidden. Both are legitimate; use getAllByText.
    const loadingElements = screen.getAllByText("Generating suggestion...");
    expect(loadingElements.length).toBeGreaterThanOrEqual(1);
  });

  // AC 11 — note title appears in modal header area
  it("displays the note title in the modal (AC 11)", () => {
    renderModal({ outline: "Here is a great outline.", error: null });
    expect(screen.getByText("Walking by Faith")).toBeInTheDocument();
  });

  // AC 11 — modal title reflects note type for sermon_outline
  it("shows 'AI Sermon Suggestion' title for sermon_outline note type (AC 11)", () => {
    renderModal({ noteType: "sermon_outline", outline: "Outline text.", error: null });
    expect(screen.getByText("AI Sermon Suggestion")).toBeInTheDocument();
  });

  // AC 11 — modal title reflects note type for series_plan
  it("shows 'AI Series Suggestion' title for series_plan note type (AC 11)", () => {
    renderModal({ noteType: "series_plan", outline: "Series arc text.", error: null });
    expect(screen.getByText("AI Series Suggestion")).toBeInTheDocument();
  });

  // AC 8 / AC 11 — AI_RESPONSE_FOOTER appears in the modal when outline is present
  it("shows AI_RESPONSE_FOOTER when outline is present (AC 8, AC 11)", () => {
    renderModal({
      outline: "Main point 1. Main point 2.",
      error: null,
    });
    expect(
      screen.getByText(
        "Scripture references should be verified against a Bible before use in ministry.",
      ),
    ).toBeInTheDocument();
  });

  // AC 11 — outline text is rendered (multi-line; use a partial matcher)
  it("renders the outline text in the modal (AC 11)", () => {
    const outline = "Introduction hook.\n3 main points.\nClosing application.";
    renderModal({ outline, error: null });
    // The pre-wrap text node contains the full string; match a distinctive substring
    expect(screen.getByText(/Introduction hook/)).toBeInTheDocument();
    expect(screen.getByText(/Closing application/)).toBeInTheDocument();
  });

  // AC 12 — "Use This Outline" calls onAccept with the outline text
  it("calls onAccept with outline text when 'Use This Outline' is clicked (AC 12)", async () => {
    const user = userEvent.setup();
    const outline = "My generated outline.";
    const { onAccept } = renderModal({ outline, error: null });

    await user.click(screen.getByRole("button", { name: "Use This Outline" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(outline);
  });

  // AC 12 — onClose is also called when "Use This Outline" is clicked
  it("calls onClose after 'Use This Outline' is clicked (AC 12)", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ outline: "Outline content.", error: null });

    await user.click(screen.getByRole("button", { name: "Use This Outline" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // AC 13 — "Dismiss" calls onClose and does NOT call onAccept
  it("calls onClose but not onAccept when 'Dismiss' is clicked (AC 13)", async () => {
    const user = userEvent.setup();
    const { onClose, onAccept } = renderModal({ outline: "Some outline.", error: null });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  // AC 13 — "Dismiss" available even when outline is null (error path)
  it("shows Dismiss button in error state (AC 13)", () => {
    renderModal({
      outline: null,
      error: "AI features are not configured in this environment.",
    });
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  // AC 12 — "Use This Outline" is disabled when there is no outline (error state)
  it("disables 'Use This Outline' when outline is null (AC 12)", () => {
    renderModal({
      outline: null,
      error: "Temporarily unavailable.",
    });
    expect(screen.getByRole("button", { name: "Use This Outline" })).toBeDisabled();
  });

  // AC 5 / AC 11 — error shows plain-language message, no raw stack or object
  it("shows plain-language error message in error state (AC 5)", () => {
    const errorMsg = "The AI assistant is temporarily unavailable. Please try again.";
    renderModal({ outline: null, error: errorMsg });
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
    // Confirm raw Error-object text is absent
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });

  // AC 9 — loading state hides action buttons until outline/error resolves
  it("hides Dismiss and Use This Outline buttons while loading (AC 9)", () => {
    renderModal({ outline: null, error: null });
    // In loading state (outline=null, error=null) the action group is not rendered
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use This Outline" }),
    ).not.toBeInTheDocument();
  });
});
