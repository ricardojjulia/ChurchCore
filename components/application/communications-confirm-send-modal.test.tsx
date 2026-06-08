/**
 * CC-COMM-001 — AC13: Confirm modal shown with recipient count, channel, schedule
 * time before commit; confirm calls onConfirm; loading disables confirm.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommunicationsConfirmSendModal } from "@/components/application/communications-confirm-send-modal";

function renderModal(props: Partial<Parameters<typeof CommunicationsConfirmSendModal>[0]> = {}) {
  const defaults = {
    opened: true,
    recipientCount: 42,
    channel: "email" as const,
    scheduledFor: null,
    churchTimezone: "America/Chicago",
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    loading: false,
  };
  return render(
    <MantineProvider>
      <CommunicationsConfirmSendModal {...defaults} {...props} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommunicationsConfirmSendModal — AC13", () => {
  it("shows recipient count in the modal body", () => {
    renderModal({ recipientCount: 42 });
    expect(screen.getByText(/42 recipient/i)).toBeInTheDocument();
  });

  it("shows singular 'recipient' when count is 1", () => {
    renderModal({ recipientCount: 1 });
    // The sentence spans multiple React elements so we use getAllByText with a
    // function matcher and confirm at least one element carries the full text.
    const matches = screen.getAllByText((_, element) => {
      const text = element?.textContent ?? "";
      return text.includes("1 recipient") && !text.includes("recipients");
    });
    expect(matches.length).toBeGreaterThan(0);
  });

  it("displays EMAIL channel badge", () => {
    renderModal({ channel: "email" });
    expect(screen.getByText("EMAIL")).toBeInTheDocument();
  });

  it("displays SMS channel badge", () => {
    renderModal({ channel: "sms" });
    expect(screen.getByText("SMS")).toBeInTheDocument();
  });

  it("shows 'Sending now' for immediate send (scheduledFor=null)", () => {
    renderModal({ scheduledFor: null });
    expect(screen.getByText(/Sending now/i)).toBeInTheDocument();
  });

  it("shows scheduled time string when scheduledFor is provided", () => {
    renderModal({ scheduledFor: "2030-01-15T14:00:00" });
    // The modal displays "Scheduled for: ..." — we check the prefix
    expect(screen.getByText(/Scheduled for:/i)).toBeInTheDocument();
  });

  it("confirm button label is 'Send now' for immediate send", () => {
    renderModal({ scheduledFor: null });
    expect(screen.getByRole("button", { name: /send now/i })).toBeInTheDocument();
  });

  it("confirm button label is 'Schedule' when scheduledFor is set", () => {
    renderModal({ scheduledFor: "2030-01-15T14:00:00" });
    expect(screen.getByRole("button", { name: /^schedule$/i })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: /send now/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel button is clicked", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onConfirm when Cancel is clicked", () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm button and Cancel button when loading=true", () => {
    renderModal({ loading: true });
    const confirmBtn = screen.getByRole("button", { name: /send now/i });
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  it("does not render modal content when opened=false", () => {
    renderModal({ opened: false });
    expect(screen.queryByText(/recipient/i)).not.toBeInTheDocument();
  });

  it("shows the body-not-stored disclaimer", () => {
    renderModal();
    expect(
      screen.getByText(/full message body is not stored/i),
    ).toBeInTheDocument();
  });
});
