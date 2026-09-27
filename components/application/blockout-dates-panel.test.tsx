import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addMy: vi.fn(),
  removeMy: vi.fn(),
  addToken: vi.fn(),
  removeToken: vi.fn(),
  listAdmin: vi.fn(),
  addAdmin: vi.fn(),
  removeAdmin: vi.fn(),
}));

vi.mock("@/app/app/volunteer-actions", () => ({
  addMyBlockoutDatesAction: mocks.addMy,
  removeMyBlockoutDateAction: mocks.removeMy,
  addBlockoutDatesByTokenAction: mocks.addToken,
  removeBlockoutDateByTokenAction: mocks.removeToken,
  listVolunteerBlockoutDatesAction: mocks.listAdmin,
  addVolunteerBlockoutDatesAction: mocks.addAdmin,
  removeVolunteerBlockoutDateAction: mocks.removeAdmin,
}));

import { BlockoutDatesPanel, type BlockoutTarget } from "@/components/application/blockout-dates-panel";

function renderPanel(target: BlockoutTarget, initialDates: Array<{ date: string; reason: string | null }> | null) {
  return render(
    <MantineProvider>
      <BlockoutDatesPanel target={target} initialDates={initialDates} />
    </MantineProvider>,
  );
}

async function addRange(user: ReturnType<typeof userEvent.setup>, from: string, to?: string, reason?: string) {
  await user.type(screen.getByLabelText(/^From/), from);
  if (to) await user.type(screen.getByLabelText("To (optional)"), to);
  if (reason) await user.type(screen.getByLabelText("Reason (optional)"), reason);
  await user.click(screen.getByRole("button", { name: "Add" }));
}

describe("BlockoutDatesPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the volunteer's upcoming dates, or says there are none", () => {
    const { unmount } = renderPanel({ kind: "self" }, [{ date: "2026-10-11", reason: "Family trip" }]);
    expect(screen.getByText("Sun, Oct 11, 2026")).toBeInTheDocument();
    expect(screen.getByText("Family trip")).toBeInTheDocument();
    unmount();
    renderPanel({ kind: "self" }, []);
    expect(screen.getByText("No upcoming unavailable dates.")).toBeInTheDocument();
  });

  it("self: adds a range, clears the form, and warns about days already scheduled", async () => {
    const user = userEvent.setup();
    mocks.addMy.mockResolvedValue({
      ok: true,
      dates: [{ date: "2026-10-11", reason: "Trip" }, { date: "2026-10-12", reason: "Trip" }],
      scheduledOn: ["2026-10-11"],
    });
    renderPanel({ kind: "self" }, []);

    await addRange(user, "2026-10-11", "2026-10-12", "Trip");

    expect(mocks.addMy).toHaveBeenCalledWith({ from: "2026-10-11", to: "2026-10-12", reason: "Trip" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're already scheduled on Sun, Oct 11, 2026. Please also decline that shift",
    );
    expect(screen.getByText("Mon, Oct 12, 2026")).toBeInTheDocument();
    expect(screen.getByLabelText(/^From/)).toHaveValue("");
  });

  it("token: uses the link's actions and shows the server's error", async () => {
    const user = userEvent.setup();
    mocks.addToken.mockResolvedValue({ ok: false, error: "This link is invalid or has expired." });
    renderPanel({ kind: "token", token: "tok" }, []);

    await addRange(user, "2026-10-11");

    expect(mocks.addToken).toHaveBeenCalledWith({ token: "tok", from: "2026-10-11", to: null, reason: null });
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is invalid or has expired.");
    expect(mocks.addMy).not.toHaveBeenCalled();
  });

  it("removes a date", async () => {
    const user = userEvent.setup();
    mocks.removeMy.mockResolvedValue({ ok: true, dates: [], scheduledOn: [] });
    renderPanel({ kind: "self" }, [{ date: "2026-10-11", reason: null }]);

    await user.click(screen.getByRole("button", { name: "Remove Sun, Oct 11, 2026" }));

    expect(mocks.removeMy).toHaveBeenCalledWith({ date: "2026-10-11" });
    expect(await screen.findByText("No upcoming unavailable dates.")).toBeInTheDocument();
  });

  it("admin: loads the volunteer's dates, then adds for that volunteer", async () => {
    const user = userEvent.setup();
    mocks.listAdmin.mockResolvedValue({ ok: true, dates: [{ date: "2026-10-18", reason: null }] });
    mocks.addAdmin.mockResolvedValue({ ok: true, dates: [], scheduledOn: ["2026-10-11"] });
    renderPanel({ kind: "admin", profileId: "p-1", fullName: "Grace Adeyemi" }, null);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Sun, Oct 18, 2026")).toBeInTheDocument();
    expect(mocks.listAdmin).toHaveBeenCalledWith({ profileId: "p-1" });

    await addRange(user, "2026-10-11");
    expect(mocks.addAdmin).toHaveBeenCalledWith({ profileId: "p-1", from: "2026-10-11", to: null, reason: null });
    await waitFor(() =>
      expect(within(screen.getByTestId("blockout-dates")).getByRole("status")).toHaveTextContent(
        "Grace Adeyemi is already scheduled on Sun, Oct 11, 2026. Find a replacement",
      ),
    );
  });

  it("admin: shows an error if the list can't load", async () => {
    mocks.listAdmin.mockRejectedValue(new Error("network"));
    renderPanel({ kind: "admin", profileId: "p-1", fullName: "Grace Adeyemi" }, null);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load unavailable dates.");
  });
});
