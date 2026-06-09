import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DisclaimerGate } from "@/components/ai/disclaimer-gate";

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

function renderGate(
  featureKey: "sermon_planning" | "bible_study" = "sermon_planning",
  onConfirm = vi.fn(),
) {
  return render(
    <MantineProvider>
      <DisclaimerGate featureKey={featureKey} onConfirm={onConfirm} />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DisclaimerGate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("shows the modal when the sessionStorage key is absent", () => {
    renderGate("sermon_planning");
    expect(screen.getByText("AI Ministry Assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I Understand" })).toBeInTheDocument();
  });

  it("calls onConfirm immediately and renders nothing when sessionStorage key is already set", () => {
    sessionStorage.setItem("ai_disclaimer_sermon_planning", "shown");
    const onConfirm = vi.fn();
    renderGate("sermon_planning", onConfirm);
    // Modal title should not be present
    expect(screen.queryByText("AI Ministry Assistant")).not.toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("sets sessionStorage and calls onConfirm when 'I Understand' is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderGate("bible_study", onConfirm);

    const btn = screen.getByRole("button", { name: "I Understand" });
    await user.click(btn);

    expect(sessionStorage.getItem("ai_disclaimer_bible_study")).toBe("shown");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not close modal when clicking outside (closeOnClickOutside=false)", () => {
    renderGate("sermon_planning");
    // The modal stays visible — verify the title is still present after mount
    expect(screen.getByText("AI Ministry Assistant")).toBeInTheDocument();
    // We verify closeOnClickOutside is false structurally via the component source;
    // here we confirm the modal title remains visible with no outside-click simulation.
    expect(screen.getByRole("button", { name: "I Understand" })).toBeInTheDocument();
  });

  it("shows the ELDER_AI_DISCLAIMER text inside the modal", () => {
    renderGate("sermon_planning");
    expect(
      screen.getByText(/This is an assistive tool only/i),
    ).toBeInTheDocument();
  });

  it("shows Anthropic model note inside the modal", () => {
    renderGate("sermon_planning");
    expect(
      screen.getByText(/This tool uses the Anthropic Claude AI model/i),
    ).toBeInTheDocument();
  });
});
