import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { previewMock, sendMock } = vi.hoisted(() => ({ previewMock: vi.fn(), sendMock: vi.fn() }));

vi.mock("@/app/app/church-admin/giving/statements-actions", () => ({
  previewStatementsAction: previewMock,
  sendStatementsAction: sendMock,
}));

import { GivingStatementsPanel } from "@/components/application/giving-statements-panel";

const range = { start: "2025-01-01", end: "2025-12-31" };

function row(over: Record<string, unknown> = {}) {
  return {
    donorRef: "ref-1",
    name: "Ada Lovelace",
    giftCount: 3,
    totalCents: 15000,
    fundSubtotals: [],
    grandTotals: [{ currency: "usd", cents: 15000 }],
    willEmail: true,
    reason: null,
    reasonDetail: null,
    ...over,
  };
}

function preview(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    preview: {
      range,
      donorCount: 3,
      emailCount: 1,
      skipCount: 2,
      totalCents: 40000,
      totalsByCurrency: [{ currency: "usd", cents: 40000 }],
      rows: [
        row(),
        row({ donorRef: "ref-2", name: "Carol Named", willEmail: false, reason: "no_email", reasonDetail: "No email on file", giftCount: 1, totalCents: 10000 }),
        row({ donorRef: "ref-3", name: "Bob Smith", willEmail: false, reason: "suppressed", reasonDetail: "bounced", giftCount: 2, totalCents: 15000 }),
      ],
      anonymous: { giftCount: 2, totalCents: 3000, totalsByCurrency: [{ currency: "usd", cents: 3000 }], onlyDonors: 1, onlyWillEmail: 1, onlySkipped: 0 },
      unstatementable: [
        { giftId: "g1", date: "2025-03-01", amountCents: 2500, currency: "usd", fund: "General", donor: "No donor information" },
      ],
      ...over,
    },
  };
}

function renderPanel() {
  return render(
    <MantineProvider>
      <GivingStatementsPanel />
    </MantineProvider>,
  );
}

async function runPreview() {
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByText(/will be emailed ·/);
}

const summary = {
  donors: 3,
  sent: 1,
  skipped: { no_email: 1, opted_out: 0, suppressed: 1, already_sent: 0 },
  skippedTotal: 2,
  failed: 0,
  unstatementable: 1,
  remaining: 0,
  complete: true,
};

describe("GivingStatementsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.mockResolvedValue(preview());
  });

  it("previews with blank dates, fills the resolved range, and renders rows and reasons", async () => {
    renderPanel();
    await runPreview();

    expect(previewMock).toHaveBeenCalledWith({ start: undefined, end: undefined });
    expect(screen.getByLabelText("Start date")).toHaveValue("2025-01-01");
    expect(screen.getByLabelText("End date")).toHaveValue("2025-12-31");
    expect(screen.getByText(/3 donors/)).toBeInTheDocument();
    expect(screen.getByText("Named gifts total $400.00; anonymous gifts $30.00 (2)")).toBeInTheDocument();
    expect(screen.getByText(/1 donor of anonymous-only gifts: 1 will be emailed, 0 skipped/)).toBeInTheDocument();
    expect(screen.getByText(/1 will be emailed · 2 skipped/)).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Will email")).toBeInTheDocument();
    expect(screen.getByText("Carol Named")).toBeInTheDocument();
    expect(screen.getByText("No email on file (No email on file)")).toBeInTheDocument();
    expect(screen.getByText("Email suppressed (bounced)")).toBeInTheDocument();
    expect(screen.getByText("Un-statementable gifts")).toBeInTheDocument();
    expect(screen.getByText("No donor information")).toBeInTheDocument();
  });

  it("links each row to the admin PDF route with donor and range", async () => {
    renderPanel();
    await runPreview();
    const link = screen.getByRole("link", { name: "Download PDF for Ada Lovelace" });
    expect(link).toHaveAttribute("href", "/api/giving/statements/pdf?donor=ref-1&start=2025-01-01&end=2025-12-31");
  });

  it("shows an error for an invalid range and no results", async () => {
    previewMock.mockResolvedValue({ ok: false, error: "End date must be on or after the start date." });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("End date must be on or after the start date.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send statements" })).not.toBeInTheDocument();
  });

  it("shows the empty state and disables send when nothing qualifies", async () => {
    previewMock.mockResolvedValue(
      preview({ donorCount: 0, emailCount: 0, skipCount: 0, totalCents: 0, totalsByCurrency: [], rows: [], anonymous: { giftCount: 0, totalCents: 0, totalsByCurrency: [], onlyDonors: 0, onlyWillEmail: 0, onlySkipped: 0 }, unstatementable: [] }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("No statements for this range")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send statements" })).toBeDisabled();
  });

  it("gates the send behind a confirmation that states the counts", async () => {
    renderPanel();
    await runPreview();
    fireEvent.click(screen.getByRole("button", { name: "Send statements" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/1 donor will be emailed/)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 will be skipped/)).toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends once on a double click and shows the summary in the live region", async () => {
    let resolve: (v: unknown) => void = () => {};
    sendMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPanel();
    await runPreview();
    fireEvent.click(screen.getByRole("button", { name: "Send statements" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /Confirm and send/ });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({ start: "2025-01-01", end: "2025-12-31", confirm: true });

    resolve({ ok: true, range, summary });
    const done = await screen.findByText(/Sent 1\. Skipped 2/);
    expect(done.closest("[aria-live='polite']")).not.toBeNull();
    expect(done).toHaveTextContent("no email 1");
    expect(done).toHaveTextContent("suppressed 1");
    expect(done).toHaveTextContent("Failed 0");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("tells the admin to run Send again when the batch was cut short by the time budget", async () => {
    sendMock.mockResolvedValue({ ok: true, range, summary: { ...summary, complete: false, remaining: 7 } });
    renderPanel();
    await runPreview();
    fireEvent.click(screen.getByRole("button", { name: "Send statements" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm and send/ }));
    expect(await screen.findByText(/Partly sent — run Send again to continue \(7 donors left\)/)).toBeInTheDocument();
  });

  it("does not show the partly-sent notice for a complete run", async () => {
    sendMock.mockResolvedValue({ ok: true, range, summary });
    renderPanel();
    await runPreview();
    fireEvent.click(screen.getByRole("button", { name: "Send statements" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm and send/ }));
    await screen.findByText(/Sent 1\./);
    expect(screen.queryByText(/Partly sent/)).not.toBeInTheDocument();
  });

  it("shows a send error", async () => {
    sendMock.mockResolvedValue({ ok: false, error: "Could not send statements." });
    renderPanel();
    await runPreview();
    fireEvent.click(screen.getByRole("button", { name: "Send statements" }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm and send/ }));
    expect(await screen.findByText("Could not send statements.")).toBeInTheDocument();
  });
});
