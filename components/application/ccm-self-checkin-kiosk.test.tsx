import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookupByPhoneAction: vi.fn(),
  lookupByCodeAction: vi.fn(),
  getKioskOptionsAction: vi.fn(),
  kioskCheckinAction: vi.fn(),
  exitKioskAction: vi.fn(),
  releaseStuckKioskAction: vi.fn(),
  scannerMode: { current: "unavailable" as "unavailable" | "code" },
  scannerMounts: 0,
  scannerUnmounts: 0,
}));

vi.mock("@/app/kiosk/children/actions", () => ({
  lookupByPhoneAction: mocks.lookupByPhoneAction,
  lookupByCodeAction: mocks.lookupByCodeAction,
  getKioskOptionsAction: mocks.getKioskOptionsAction,
  kioskCheckinAction: mocks.kioskCheckinAction,
  exitKioskAction: mocks.exitKioskAction,
  releaseStuckKioskAction: mocks.releaseStuckKioskAction,
}));

// next/dynamic(() => import(scanner)) resolves to this stand-in.
vi.mock("@/components/application/ccm-qr-scanner", async () => {
  const { useEffect } = await import("react");
  return {
    default: function FakeScanner({
      onCode,
      onUnavailable,
    }: {
      onCode: (value: string) => void;
      onUnavailable: () => void;
    }) {
      useEffect(() => {
        mocks.scannerMounts += 1;
        if (mocks.scannerMode.current === "unavailable") onUnavailable();
        else onCode("hk7m-2qx9");
        return () => {
          mocks.scannerUnmounts += 1;
        };
      }, [onCode, onUnavailable]);
      return <div data-testid="scanner" />;
    },
  };
});

import { CcmSelfCheckinKiosk } from "@/components/application/ccm-self-checkin-kiosk";
import { I18nProvider } from "@/components/i18n-provider";
import type { Locale } from "@/lib/i18n";

function renderKiosk(props: { idleMs?: number; locked?: boolean; locale?: Locale } = {}) {
  return render(
    <I18nProvider locale={props.locale ?? "en"}>
      <MantineProvider>
        <CcmSelfCheckinKiosk idleMs={props.idleMs ?? 60_000} locked={props.locked} />
      </MantineProvider>
    </I18nProvider>,
  );
}

const found = {
  status: "found",
  householdToken: "tok",
  children: [
    { id: "11111111-1111-4111-8111-111111111111", displayName: "Ana R.", alreadyCheckedIn: false, needsGreeter: false },
    { id: "22222222-2222-4222-8222-222222222222", displayName: "Mateo R.", alreadyCheckedIn: false, needsGreeter: true },
    { id: "33333333-3333-4333-8333-333333333333", displayName: "Lia R.", alreadyCheckedIn: true, needsGreeter: false },
  ],
};
const ROOM = "44444444-4444-4444-8444-444444444444";
const SERVICE = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scannerMode.current = "unavailable";
  mocks.scannerMounts = 0;
  mocks.scannerUnmounts = 0;
  mocks.getKioskOptionsAction.mockResolvedValue({
    status: "ok",
    service: { id: SERVICE, name: "Sunday" },
    rooms: [{ id: ROOM, name: "Nursery" }],
  });
});

async function reachChoose(user: ReturnType<typeof userEvent.setup>) {
  mocks.lookupByPhoneAction.mockResolvedValue(found);
  await user.click(screen.getByRole("button", { name: /phone number/i }));
  await user.type(screen.getByLabelText("Phone number"), "(555) 019-9");
  await user.click(screen.getByRole("button", { name: "Find my children" }));
  await screen.findByRole("heading", { name: "Who is checking in?" });
}

describe("CcmSelfCheckinKiosk", () => {
  it("shows the locked screen with no way into the app when locked", () => {
    renderKiosk({ locked: true });
    expect(screen.getByRole("heading", { name: "Kiosk needs a staff sign-in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exit kiosk" })).toBeNull();
    expect(screen.getByRole("link", { name: "Staff sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("releases a stuck device from the locked screen and shows the refusal when a kiosk is active", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign, reload }, writable: true });
    mocks.releaseStuckKioskAction.mockResolvedValueOnce({ status: "active" });
    renderKiosk({ locked: true });
    await user.click(screen.getByRole("button", { name: "Release this device" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(assign).not.toHaveBeenCalled();
    mocks.releaseStuckKioskAction.mockResolvedValueOnce({ status: "released" });
    await user.click(screen.getByRole("button", { name: "Release this device" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/sign-in"));
  });

  it("looks up by phone, selects a child and a room, and shows the PIN once", async () => {
    const user = userEvent.setup();
    renderKiosk();
    await reachChoose(user);

    // Custody child and already-checked-in child are not selectable and say why in text.
    const mateo = screen.getByRole("button", { name: /Mateo R\./ });
    expect(mateo).toBeDisabled();
    expect(mateo).toHaveTextContent("Please see a greeter");
    const lia = screen.getByRole("button", { name: /Lia R\./ });
    expect(lia).toBeDisabled();
    expect(lia).toHaveTextContent("Already checked in");

    const checkIn = screen.getByRole("button", { name: "Check in" });
    expect(checkIn).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Ana R\./ }));
    await user.click(screen.getByRole("button", { name: "Nursery" }));

    mocks.kioskCheckinAction.mockResolvedValue({
      status: "done",
      results: [{ childId: found.children[0].id, displayName: "Ana R.", status: "checked_in", pin: "ABC123", roomName: "Nursery" }],
    });
    await user.click(screen.getByRole("button", { name: "Check in 1" }));

    expect(await screen.findByRole("heading", { name: "You're checked in!" })).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(mocks.kioskCheckinAction).toHaveBeenCalledWith({
      householdToken: "tok",
      childIds: [found.children[0].id],
      roomId: ROOM,
      serviceId: SERVICE,
    });

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("ABC123")).toBeNull();
    expect(screen.getByRole("heading", { name: /Welcome/ })).toBeInTheDocument();
  });

  it("answers a failed lookup with the neutral message in an alert", async () => {
    const user = userEvent.setup();
    mocks.lookupByCodeAction.mockResolvedValue({ status: "none" });
    renderKiosk();
    await user.click(screen.getByRole("button", { name: "Use my family code" }));
    await user.type(screen.getByLabelText("Family code"), "zzzzzzzz");
    await user.click(screen.getByRole("button", { name: "Find my children" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't find that. Please see a greeter.");
  });

  it("shows the pause message with the seconds", async () => {
    const user = userEvent.setup();
    mocks.lookupByPhoneAction.mockResolvedValue({ status: "paused", retryAfterSeconds: 120 });
    renderKiosk();
    await user.click(screen.getByRole("button", { name: /phone number/i }));
    await user.type(screen.getByLabelText("Phone number"), "5550199");
    await user.click(screen.getByRole("button", { name: "Find my children" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait 120 seconds");
  });

  it("goes to the locked screen when an action says the kiosk is locked", async () => {
    const user = userEvent.setup();
    mocks.lookupByPhoneAction.mockResolvedValue({ status: "locked" });
    renderKiosk();
    await user.click(screen.getByRole("button", { name: /phone number/i }));
    await user.type(screen.getByLabelText("Phone number"), "5550199");
    await user.click(screen.getByRole("button", { name: "Find my children" }));
    expect(await screen.findByRole("heading", { name: "Kiosk needs a staff sign-in" })).toBeInTheDocument();
  });

  it("tells the family to see a greeter when no service is open", async () => {
    const user = userEvent.setup();
    mocks.getKioskOptionsAction.mockResolvedValue({ status: "ok", service: null, rooms: [] });
    renderKiosk();
    await reachChoose(user);
    expect(screen.getByText("Check-in isn't open right now. Please see a greeter.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ana R\./ })).toBeDisabled();
  });

  it("falls back to the typed code when the camera is unavailable", async () => {
    const user = userEvent.setup();
    renderKiosk();
    await user.click(screen.getByRole("button", { name: "Scan my family QR code" }));
    expect(await screen.findByText("We can't use the camera. Please type your family code instead.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Type my code instead" }));
    expect(screen.getByLabelText("Family code")).toBeInTheDocument();
  });

  it("sends a scanned code to the code lookup", async () => {
    const user = userEvent.setup();
    mocks.scannerMode.current = "code";
    mocks.lookupByCodeAction.mockResolvedValue(found);
    renderKiosk();
    await user.click(screen.getByRole("button", { name: "Scan my family QR code" }));
    await screen.findByRole("heading", { name: "Who is checking in?" });
    expect(mocks.lookupByCodeAction).toHaveBeenCalledWith({ code: "hk7m-2qx9" });
    expect(mocks.scannerUnmounts).toBeGreaterThan(0);
  });

  it("returns to the start screen when idle, clearing the PIN and unmounting the scanner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      mocks.lookupByCodeAction.mockResolvedValue(found);
      renderKiosk({ idleMs: 10_000 });
      fireEvent.click(screen.getByRole("button", { name: "Scan my family QR code" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(mocks.scannerMounts).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });
      // Warning (last half of a short idle time) is up.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByText(/This screen will clear in/)).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByRole("heading", { name: /Welcome/ })).toBeInTheDocument();
      expect(mocks.scannerUnmounts).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the screen when the family taps I'm still here", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      renderKiosk({ idleMs: 10_000 });
      fireEvent.click(screen.getByRole("button", { name: "Use my family code" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      fireEvent.click(screen.getByRole("button", { name: "I'm still here", hidden: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });
      expect(screen.getByLabelText("Family code")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a wrong exit password and stays in the kiosk", async () => {
    const user = userEvent.setup();
    mocks.exitKioskAction.mockResolvedValue({ status: "wrong_password" });
    renderKiosk();
    await user.click(screen.getByRole("button", { name: "Exit kiosk" }));
    await user.type(await screen.findByLabelText("Staff password"), "nope");
    await user.click(screen.getByRole("button", { name: "Leave kiosk mode" }));
    expect(await screen.findByText("That password was not right.")).toBeInTheDocument();
    expect(mocks.exitKioskAction).toHaveBeenCalledWith({ password: "nope" });
  });

  it("leaves for the admin page after the right password", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
    mocks.exitKioskAction.mockResolvedValue({ status: "exited", redirectTo: "/app/church-admin/children" });
    renderKiosk();
    await user.click(screen.getByRole("button", { name: "Exit kiosk" }));
    await user.type(await screen.findByLabelText("Staff password"), "right");
    await user.click(screen.getByRole("button", { name: "Leave kiosk mode" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/app/church-admin/children"));
  });

  it("renders Spanish copy", () => {
    renderKiosk({ locale: "es" });
    expect(screen.getByRole("button", { name: "Usar mi número de teléfono" })).toBeInTheDocument();
  });
});
