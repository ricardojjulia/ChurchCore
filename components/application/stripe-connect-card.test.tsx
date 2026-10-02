import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G3.0b (ADR 0025): the church admin's Stripe account card.

const { disconnectMock } = vi.hoisted(() => ({ disconnectMock: vi.fn() }));
vi.mock("@/app/app/stripe-connect-actions", () => ({ disconnectStripeAccountAction: disconnectMock }));

import { StripeConnectCard } from "@/components/application/stripe-connect-card";
import type { ChurchPaymentConnection } from "@/lib/stripe/connect";

const NOT_CONNECTED: ChurchPaymentConnection = {
  platformReady: true,
  connected: false,
  chargesEnabled: false,
  detailsSubmitted: false,
  accountHint: null,
};
const CONNECTED: ChurchPaymentConnection = { ...NOT_CONNECTED, connected: true, chargesEnabled: true, detailsSubmitted: true, accountHint: "…abc123" };

function renderCard(connection: ChurchPaymentConnection, result: string | null = null) {
  render(
    <MantineProvider>
      <StripeConnectCard connection={connection} result={result} />
    </MantineProvider>,
  );
}

describe("StripeConnectCard", () => {
  beforeEach(() => {
    disconnectMock.mockReset();
  });

  it("offers Connect with Stripe, through the start route, when the church isn't connected", () => {
    renderCard(NOT_CONNECTED);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect with Stripe" })).toHaveAttribute("href", "/api/stripe/connect/start");
  });

  it("explains, without a button, when the platform isn't set up for Connect", () => {
    renderCard({ ...NOT_CONNECTED, platformReady: false });
    expect(screen.queryByRole("link", { name: "Connect with Stripe" })).toBeNull();
    expect(screen.getByText(/can't be turned on/)).toBeInTheDocument();
  });

  it("shows a connected account that can't take payments yet as unfinished", () => {
    renderCard({ ...CONNECTED, chargesEnabled: false });
    expect(screen.getByText("Connected · setup unfinished")).toBeInTheDocument();
  });

  it("shows the result the connect flow came back with", () => {
    renderCard(NOT_CONNECTED, "invalid");
    expect(screen.getByText(/wasn't valid for this church/)).toBeInTheDocument();
  });

  it("asks before disconnecting, and disconnects only on confirm", async () => {
    disconnectMock.mockResolvedValue({ ok: true });
    renderCard(CONNECTED);
    expect(screen.getByText("Connected · taking payments")).toBeInTheDocument();
    expect(screen.getByText(/Account …abc123/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Stripe" }));
    expect(disconnectMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep connected" }));
    expect(screen.getByRole("button", { name: "Disconnect Stripe" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Stripe" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    await waitFor(() => expect(disconnectMock).toHaveBeenCalledTimes(1));
  });

  it("shows the error when disconnecting fails", async () => {
    disconnectMock.mockResolvedValue({ ok: false, error: "Couldn't disconnect from Stripe. Please try again." });
    renderCard(CONNECTED);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Stripe" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    expect(await screen.findByText("Couldn't disconnect from Stripe. Please try again.")).toBeInTheDocument();
  });
});
