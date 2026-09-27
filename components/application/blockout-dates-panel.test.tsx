import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
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
  removeMyBlockoutDatesAction: mocks.removeMy,
  addBlockoutDatesByTokenAction: mocks.addToken,
  removeBlockoutDatesByTokenAction: mocks.removeToken,
  listVolunteerBlockoutDatesAction: mocks.listAdmin,
  addVolunteerBlockoutDatesAction: mocks.addAdmin,
  removeVolunteerBlockoutDatesAction: mocks.removeAdmin,
}));

import { BlockoutDatesPanel, type BlockoutTarget } from "@/components/application/blockout-dates-panel";
import { I18nProvider } from "@/components/i18n-provider";
import type { Locale } from "@/lib/i18n";

function renderPanel(
  target: BlockoutTarget,
  initialDates: Array<{ date: string; reason: string | null }> | null,
  options: { locale?: Locale; initialError?: "load_failed" } = {},
) {
  return render(
    <I18nProvider locale={options.locale ?? "en"}>
      <MantineProvider>
        <BlockoutDatesPanel target={target} initialDates={initialDates} initialError={options.initialError} />
      </MantineProvider>
    </I18nProvider>,
  );
}

async function addRange(user: ReturnType<typeof userEvent.setup>, from: string, to?: string, reason?: string) {
  await user.type(screen.getByLabelText(/^First day/), from);
  if (to) await user.type(screen.getByLabelText("Last day (leave blank for one day)"), to);
  if (reason) await user.type(screen.getByLabelText("Reason (optional)"), reason);
  await user.click(screen.getByRole("button", { name: "Add" }));
}

describe("BlockoutDatesPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups a vacation into one entry with its day count, and says when there are none", () => {
    const { unmount } = renderPanel({ kind: "self" }, [
      { date: "2026-10-11", reason: "Family trip" },
      { date: "2026-10-12", reason: "Family trip" },
      { date: "2026-10-13", reason: "Family trip" },
      { date: "2026-10-20", reason: null },
    ]);
    expect(screen.getByText("Sun, Oct 11, 2026 – Tue, Oct 13, 2026")).toBeInTheDocument();
    expect(screen.getByText(/3 days/)).toBeInTheDocument();
    expect(screen.getByText("Family trip")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    unmount();
    renderPanel({ kind: "self" }, []);
    expect(screen.getByText("No upcoming unavailable dates.")).toBeInTheDocument();
  });

  it("previews the chosen days before adding", async () => {
    const user = userEvent.setup();
    renderPanel({ kind: "self" }, []);
    await user.type(screen.getByLabelText(/^First day/), "2026-10-11");
    expect(screen.getByTestId("blockout-preview")).toHaveTextContent("Sun, Oct 11, 2026");
    await user.type(screen.getByLabelText("Last day (leave blank for one day)"), "2026-10-13");
    expect(screen.getByTestId("blockout-preview")).toHaveTextContent("Sun, Oct 11, 2026 to Tue, Oct 13, 2026 (3 days)");
  });

  it("self: adds a range, clears the form, and names the shift they're already scheduled on", async () => {
    const user = userEvent.setup();
    mocks.addMy.mockResolvedValue({
      ok: true,
      dates: [{ date: "2026-10-11", reason: "Trip" }, { date: "2026-10-12", reason: "Trip" }],
      scheduledOn: [{ date: "2026-10-11", title: "Greeter" }],
    });
    renderPanel({ kind: "self" }, []);

    await addRange(user, "2026-10-11", "2026-10-12", "Trip");

    expect(mocks.addMy).toHaveBeenCalledWith({ from: "2026-10-11", to: "2026-10-12", reason: "Trip" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      'You\'re already scheduled: Sun, Oct 11, 2026 (Greeter). Please also tap "Can\'t make it" on that shift',
    );
    expect(screen.getByText("Sun, Oct 11, 2026 – Mon, Oct 12, 2026")).toBeInTheDocument();
    expect(screen.getByLabelText(/^First day/)).toHaveValue("");
  });

  it("confirms a save with nothing scheduled", async () => {
    const user = userEvent.setup();
    mocks.addMy.mockResolvedValue({ ok: true, dates: [{ date: "2026-10-11", reason: null }], scheduledOn: [] });
    renderPanel({ kind: "self" }, []);
    await addRange(user, "2026-10-11");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("token: uses the link's actions and shows a translated, friendly error", async () => {
    const user = userEvent.setup();
    mocks.addToken.mockResolvedValue({ ok: false, code: "link_expired", error: "This link is invalid or has expired." });
    renderPanel({ kind: "token", token: "tok" }, []);

    await addRange(user, "2026-10-11");

    expect(mocks.addToken).toHaveBeenCalledWith({ token: "tok", from: "2026-10-11", to: null, reason: null });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired. Ask your team leader to send you a new one.",
    );
    expect(mocks.addMy).not.toHaveBeenCalled();
  });

  it("removes a whole range with one tap", async () => {
    const user = userEvent.setup();
    mocks.removeMy.mockResolvedValue({ ok: true, dates: [], scheduledOn: [] });
    renderPanel({ kind: "self" }, [
      { date: "2026-10-11", reason: null },
      { date: "2026-10-12", reason: null },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove Sun, Oct 11, 2026 – Mon, Oct 12, 2026" }));

    expect(mocks.removeMy).toHaveBeenCalledWith({ from: "2026-10-11", to: "2026-10-12" });
    expect(await screen.findByText("No upcoming unavailable dates.")).toBeInTheDocument();
  });

  it("admin: loads the volunteer's dates, then adds for that volunteer", async () => {
    const user = userEvent.setup();
    mocks.listAdmin.mockResolvedValue({ ok: true, dates: [{ date: "2026-10-18", reason: null }] });
    mocks.addAdmin.mockResolvedValue({ ok: true, dates: [], scheduledOn: [{ date: "2026-10-11", title: "Sound Tech" }] });
    renderPanel({ kind: "admin", profileId: "p-1", fullName: "Grace Adeyemi" }, null);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Sun, Oct 18, 2026")).toBeInTheDocument();
    expect(mocks.listAdmin).toHaveBeenCalledWith({ profileId: "p-1" });

    await addRange(user, "2026-10-11");
    expect(mocks.addAdmin).toHaveBeenCalledWith({ profileId: "p-1", from: "2026-10-11", to: null, reason: null });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Grace Adeyemi is already scheduled: Sun, Oct 11, 2026 (Sound Tech). Find a replacement",
      ),
    );
  });

  it("shows a load failure from the page, and from the admin fetch", async () => {
    const { unmount } = renderPanel({ kind: "self" }, [], { initialError: "load_failed" });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load unavailable dates.");
    unmount();

    mocks.listAdmin.mockRejectedValue(new Error("network"));
    renderPanel({ kind: "admin", profileId: "p-1", fullName: "Grace Adeyemi" }, null);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load unavailable dates."));
  });

  it("renders in Spanish with Spanish dates", () => {
    renderPanel({ kind: "self" }, [{ date: "2026-10-11", reason: null }], { locale: "es" });
    expect(screen.getByText("Fechas en que no puedo servir")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Primer día/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Quitar dom/ })).toBeInTheDocument();
  });
});
