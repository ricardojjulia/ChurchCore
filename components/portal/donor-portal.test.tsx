import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/donations-actions", () => ({
  initiateDonationAction: vi.fn(),
  confirmDonationAction: vi.fn(),
  cancelRecurringDonationAction: vi.fn(),
}));

import { DonorPortal } from "@/components/portal/donor-portal";

function renderPortal(givingNotice: string | null) {
  return render(
    <MantineProvider>
      <DonorPortal data={{ donations: [], totalGiven: 0 }} givingNotice={givingNotice} />
    </MantineProvider>,
  );
}

describe("DonorPortal", () => {
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
});
