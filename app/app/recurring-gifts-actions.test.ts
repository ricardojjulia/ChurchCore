import { beforeEach, describe, expect, it, vi } from "vitest";

// G3.1: the recurring-gift actions authenticate their own caller and take
// the church and profile from the session. Admin actions are church-admin
// only, and audited.

const mocks = vi.hoisted(() => ({
  requireChurchSession: vi.fn(),
  logAuditEvent: vi.fn(),
  startRecurringGift: vi.fn(),
  confirmRecurringGift: vi.fn(),
  updateRecurringGift: vi.fn(),
  setRecurringGiftPaused: vi.fn(),
  cancelRecurringGift: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: mocks.requireChurchSession }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => ({ marker: "admin" }) }));
vi.mock("@/lib/recurring-gifts", () => ({
  startRecurringGift: mocks.startRecurringGift,
  confirmRecurringGift: mocks.confirmRecurringGift,
  updateRecurringGift: mocks.updateRecurringGift,
  setRecurringGiftPaused: mocks.setRecurringGiftPaused,
  cancelRecurringGift: mocks.cancelRecurringGift,
}));

import {
  adminCancelRecurringGiftAction,
  adminSetRecurringGiftPausedAction,
  cancelRecurringGiftAction,
  confirmRecurringGiftAction,
  setRecurringGiftPausedAction,
  startRecurringGiftAction,
  updateRecurringGiftAction,
} from "@/app/app/recurring-gifts-actions";

const MEMBER = {
  userId: "login-1",
  churchProfileId: "profile-1",
  appContext: { roleId: "member", church: { id: "church-1", timezone: "America/Chicago" } },
};
const ADMIN = { ...MEMBER, userId: "login-9", churchProfileId: "profile-9", appContext: { ...MEMBER.appContext, roleId: "church-admin" } };
const GIFT = { id: "rg-1", status: "paused" };

describe("recurring gift actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireChurchSession.mockResolvedValue(MEMBER);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    for (const fn of [mocks.confirmRecurringGift, mocks.updateRecurringGift, mocks.setRecurringGiftPaused, mocks.cancelRecurringGift]) {
      fn.mockResolvedValue({ ok: true, gift: GIFT });
    }
    mocks.startRecurringGift.mockResolvedValue({ ok: true, recurringGiftId: "rg-1", checkout: null });
  });

  it("member actions pass the session's church and profile, never a caller's", async () => {
    await startRecurringGiftAction({ amountCents: 2500, frequency: "monthly" });
    expect(mocks.startRecurringGift).toHaveBeenCalledWith(
      { marker: "admin" },
      { churchId: "church-1", profileId: "profile-1", timeZone: "America/Chicago" },
      { amountCents: 2500, frequency: "monthly" },
    );
    await confirmRecurringGiftAction("rg-1");
    await updateRecurringGiftAction("rg-1", { amountCents: 100 });
    await setRecurringGiftPausedAction("rg-1", true);
    await cancelRecurringGiftAction("rg-1");
    expect(mocks.confirmRecurringGift).toHaveBeenCalledWith(expect.anything(), "church-1", "profile-1", "rg-1");
    expect(mocks.updateRecurringGift).toHaveBeenCalledWith(expect.anything(), "church-1", "profile-1", "rg-1", { amountCents: 100 });
    expect(mocks.setRecurringGiftPaused).toHaveBeenCalledWith(expect.anything(), "church-1", "profile-1", "rg-1", true);
    expect(mocks.cancelRecurringGift).toHaveBeenCalledWith(expect.anything(), "church-1", "profile-1", "rg-1");
  });

  it("member actions refuse a session with no profile in this church", async () => {
    mocks.requireChurchSession.mockResolvedValue({ ...MEMBER, churchProfileId: null });
    expect(await startRecurringGiftAction({ amountCents: 2500, frequency: "monthly" })).toMatchObject({ ok: false });
    expect(await cancelRecurringGiftAction("rg-1")).toMatchObject({ ok: false });
    expect(mocks.startRecurringGift).not.toHaveBeenCalled();
    expect(mocks.cancelRecurringGift).not.toHaveBeenCalled();
  });

  it("returns an error, not a throw, when Stripe or the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.cancelRecurringGift.mockRejectedValue(new Error("stripe down"));
    expect(await cancelRecurringGiftAction("rg-1")).toEqual({ ok: false, error: "Couldn't update your recurring gift. Please try again." });
  });

  it("admin actions are church-admin only", async () => {
    for (const roleId of ["member", "pastor", "secretary", "ministry-leader"]) {
      mocks.requireChurchSession.mockResolvedValue({ ...MEMBER, appContext: { ...MEMBER.appContext, roleId } });
      expect(await adminCancelRecurringGiftAction("rg-1")).toMatchObject({ ok: false });
      expect(await adminSetRecurringGiftPausedAction("rg-1", true)).toMatchObject({ ok: false });
    }
    expect(mocks.cancelRecurringGift).not.toHaveBeenCalled();
    expect(mocks.setRecurringGiftPaused).not.toHaveBeenCalled();
  });

  it("an admin acts church-wide (no profile filter) and is audited", async () => {
    mocks.requireChurchSession.mockResolvedValue(ADMIN);
    expect(await adminSetRecurringGiftPausedAction("rg-1", true)).toMatchObject({ ok: true });
    expect(mocks.setRecurringGiftPaused).toHaveBeenCalledWith(expect.anything(), "church-1", null, "rg-1", true);
    expect(await adminCancelRecurringGiftAction("rg-1")).toMatchObject({ ok: true });
    expect(mocks.cancelRecurringGift).toHaveBeenCalledWith(expect.anything(), "church-1", null, "rg-1");
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: "recurring_gifts", recordId: "rg-1", actorId: "login-9", churchId: "church-1" }),
    );
  });
});
