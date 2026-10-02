import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { initiateDonationActionMock, confirmDonationActionMock, cancelPendingDonationActionMock, showMock } = vi.hoisted(() => ({
  showMock: vi.fn(),
  initiateDonationActionMock: vi.fn(),
  confirmDonationActionMock: vi.fn(),
  cancelPendingDonationActionMock: vi.fn(),
}));

vi.mock("@mantine/notifications", () => ({ notifications: { show: showMock } }));

vi.mock("@/app/app/donations-actions", () => ({
  initiateDonationAction: initiateDonationActionMock,
  confirmDonationAction: confirmDonationActionMock,
  cancelPendingDonationAction: cancelPendingDonationActionMock,
  cancelRecurringDonationAction: vi.fn(),
}));

// The card step itself is tested in donation-card-step.test.tsx; here it's a
// stand-in that reports a payment or a cancel.
vi.mock("@/components/portal/donation-card-step", () => ({
  DonationCardStep: ({
    onPaid,
    onBack,
    onCancel,
    amountLabel,
  }: {
    onPaid: (s: string) => void;
    onBack: () => void;
    onCancel: () => void;
    amountLabel: string;
  }) => (
    <div>
      <span>Card step for {amountLabel}</span>
      <button onClick={() => onPaid("succeeded")}>Stripe paid</button>
      <button onClick={onBack}>Back to amount</button>
      <button onClick={onCancel}>Leave card step</button>
    </div>
  ),
}));

import { DonorPortal } from "@/components/portal/donor-portal";

// The drawer's autosizing Textarea listens on document.fonts, which jsdom lacks.
if (!("fonts" in document)) {
  Object.defineProperty(document, "fonts", {
    value: { addEventListener: () => {}, removeEventListener: () => {} },
    configurable: true,
  });
}

function renderPortal(givingNotice: string | null, publishableKey: string | null = null) {
  return render(
    <MantineProvider>
      <DonorPortal
        data={{ donations: [], totalGiven: 0 }}
        givingNotice={givingNotice}
        publishableKey={publishableKey}
        stripeAccount={publishableKey ? "acct_church1" : null}
      />
    </MantineProvider>,
  );
}

describe("DonorPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a member give when online giving is on", () => {
    renderPortal(null);
    expect(screen.getByRole("button", { name: /Give now/ })).toBeEnabled();
    expect(screen.queryByText("Online giving is off")).not.toBeInTheDocument();
  });

  it("says up front why online giving is off, and disables Give (Council Review 22)", () => {
    renderPortal("Online card giving isn't available yet. Please give in person or contact the church office.");
    expect(screen.getByText("Online giving is off")).toBeInTheDocument();
    expect(screen.getByText(/Online card giving isn't available yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Give now/ })).toBeDisabled();
  });

  describe("live mode: the card step (G3.0)", () => {
    beforeEach(() => {
      initiateDonationActionMock.mockResolvedValue({
        ok: true,
        clientSecret: "pi_123_secret",
        donationId: "don-1",
        paymentIntentId: "pi_123",
        isStub: false,
      });
    });

    async function startGift() {
      renderPortal(null, "pk_test_123");
      fireEvent.click(screen.getByRole("button", { name: /Give now/ }));
      fireEvent.click(await screen.findByRole("button", { name: /^Give \$25\.00/ }));
      await screen.findByText("Card step for $25.00");
    }

    it("shows the card step instead of recording the gift, and confirms with the server once Stripe has the payment", async () => {
      confirmDonationActionMock.mockResolvedValue({ ok: true });
      await startGift();
      expect(confirmDonationActionMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Stripe paid" }));
      await waitFor(() => expect(confirmDonationActionMock).toHaveBeenCalledWith("don-1", "pi_123"));
      await waitFor(() => expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Thank you for your gift" })));
      expect(cancelPendingDonationActionMock).not.toHaveBeenCalled();
    });

    it("goes back to the amount and fund (kept), cancelling the old pending gift (Council Review 34)", async () => {
      cancelPendingDonationActionMock.mockResolvedValue({ ok: true, cancelled: true });
      await startGift();

      fireEvent.click(screen.getByRole("button", { name: "Back to amount" }));
      await waitFor(() => expect(cancelPendingDonationActionMock).toHaveBeenCalledWith("don-1", "pi_123"));
      expect(await screen.findByRole("button", { name: /^Give \$25\.00/ })).toBeInTheDocument();
    });

    it("keeps the card step open, with the error, when cancelling fails (PR #172 review)", async () => {
      cancelPendingDonationActionMock.mockResolvedValue({ ok: false, cancelled: false, error: "Couldn't cancel the gift. Please try again." });
      await startGift();

      fireEvent.click(screen.getByRole("button", { name: "Leave card step" }));
      await waitFor(() => expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't cancel your gift" })));
      expect(screen.getByText("Card step for $25.00")).toBeInTheDocument();
    });

    it("cancels the pending gift when the member leaves the card step without paying", async () => {
      cancelPendingDonationActionMock.mockResolvedValue({ ok: true, cancelled: true });
      await startGift();

      fireEvent.click(screen.getByRole("button", { name: "Leave card step" }));
      await waitFor(() => expect(cancelPendingDonationActionMock).toHaveBeenCalledWith("don-1", "pi_123"));
      expect(confirmDonationActionMock).not.toHaveBeenCalled();
    });
  });

  it("stub mode still records the gift right away (development and the demo)", async () => {
    initiateDonationActionMock.mockResolvedValue({ ok: true, clientSecret: "x", donationId: "don-2", paymentIntentId: "pi_stub", isStub: true });
    confirmDonationActionMock.mockResolvedValue({ ok: true });
    renderPortal(null, null);

    fireEvent.click(screen.getByRole("button", { name: /Give now/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Give \$25\.00/ }));
    await waitFor(() => expect(confirmDonationActionMock).toHaveBeenCalledWith("don-2", "pi_stub"));
  });
});
