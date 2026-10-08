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

  describe("year-end statement (G3.3)", () => {
    function renderWithYears(statementYears: number[]) {
      return render(
        <MantineProvider>
          <DonorPortal data={{ donations: [], totalGiven: 0 }} statementYears={statementYears} today="2026-10-04" />
        </MantineProvider>,
      );
    }

    it("defaults to last calendar year and links to the member download route", () => {
      renderWithYears([2026, 2025, 2023]);
      expect(screen.getByLabelText("Statement year", { selector: "input:not([type=hidden])" })).toHaveValue("2025");
      const link = screen.getByRole("link", { name: /Download statement/ });
      expect(link).toHaveAttribute("href", "/api/member/giving-statement?year=2025");
    });

    it("falls back to the newest year when last year has no gifts", () => {
      renderWithYears([2024, 2023]);
      expect(screen.getByLabelText("Statement year", { selector: "input:not([type=hidden])" })).toHaveValue("2024");
      expect(screen.getByRole("link", { name: /Download statement/ })).toHaveAttribute(
        "href",
        "/api/member/giving-statement?year=2024",
      );
    });

    it("follows the chosen year", async () => {
      // jsdom lacks scrollIntoView, which the Select's option list calls.
      Element.prototype.scrollIntoView = vi.fn();
      renderWithYears([2025, 2024]);
      fireEvent.click(screen.getByLabelText("Statement year", { selector: "input:not([type=hidden])" }));
      fireEvent.click(await screen.findByRole("option", { name: "2024" }));
      expect(screen.getByRole("link", { name: /Download statement/ })).toHaveAttribute(
        "href",
        "/api/member/giving-statement?year=2024",
      );
    });

    it("shows an empty state and no download when there are no gifts", () => {
      renderWithYears([]);
      expect(screen.getByText("No gifts recorded for 2025")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Download statement/ })).not.toBeInTheDocument();
    });
  });
});

describe("DonorPortal payment dates (G2.1)", () => {
  const gift = {
    id: "d-1",
    amountCents: 2500,
    currency: "usd",
    fundDesignation: "General",
    isRecurring: true,
    isAnonymous: false,
    status: "succeeded" as const,
    stripeSubscriptionId: null,
    note: null,
    receiptSentAt: null,
    createdAt: "2026-10-05T01:00:00Z",
    donorName: null,
    donorEmail: null,
  };

  function renderWithGift(timeZone: string | null) {
    return render(
      <MantineProvider>
        <DonorPortal data={{ donations: [gift], totalGiven: 2500 }} timeZone={timeZone} />
      </MantineProvider>,
    );
  }

  it("dates a Sunday-evening gift on the church's Sunday, not UTC's Monday", () => {
    renderWithGift("America/Los_Angeles");
    expect(screen.getByText("Oct 4, 2026")).toBeInTheDocument();
  });

  it("falls back to UTC when the church has no usable zone", () => {
    renderWithGift(null);
    expect(screen.getByText("Oct 5, 2026")).toBeInTheDocument();
  });

  it("marks the primary action and keeps a recurring badge in the fund cell for phones", () => {
    renderWithGift("America/Los_Angeles");
    expect(screen.getByRole("button", { name: /Give now/ })).toHaveAttribute("data-primary-action");
    expect(screen.getAllByText("Recurring").length).toBeGreaterThanOrEqual(1);
  });
});
