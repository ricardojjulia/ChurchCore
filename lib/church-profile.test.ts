import { describe, expect, it, vi } from "vitest";

// S9: one source of truth for "the signed-in person's church profile id".
// session.churchProfileId is resolved once when the session is built
// (churchProfileIdFor); resolveActiveChurchProfileId returns it instead of
// running its own query, so the two can't disagree.

vi.mock("server-only", () => ({}));

import { churchProfileIdFor, type AppContext, type ChurchAppSession } from "@/lib/auth";
import { resolveActiveChurchProfileId } from "@/lib/church-profile";

const church = { id: "church-1", name: "Grace Harbor", slug: "grace-harbor", timezone: "America/New_York" };
const churchContext = { kind: "church", church } as unknown as AppContext;
const controlContext = { kind: "control" } as unknown as AppContext;

describe("churchProfileIdFor (S9)", () => {
  it("is the person's profile in the church in context", () => {
    expect(churchProfileIdFor(churchContext, { id: "profile-1", churchId: "church-1", merged: false })).toBe("profile-1");
  });

  it("is null in another church, in the control plane, or without a profile", () => {
    expect(churchProfileIdFor(churchContext, { id: "profile-1", churchId: "church-2", merged: false })).toBeNull();
    expect(churchProfileIdFor(controlContext, { id: "profile-1", churchId: "church-1", merged: false })).toBeNull();
    expect(churchProfileIdFor(churchContext, null)).toBeNull();
  });

  it("is null once the profile has been merged into another", () => {
    expect(churchProfileIdFor(churchContext, { id: "profile-1", churchId: "church-1", merged: true })).toBeNull();
  });
});

describe("resolveActiveChurchProfileId (S9)", () => {
  it("returns the session's church profile id, never the login id", async () => {
    const session = { userId: "login-1", churchProfileId: "profile-1" } as unknown as ChurchAppSession;
    expect(await resolveActiveChurchProfileId(session)).toBe("profile-1");
    expect(await resolveActiveChurchProfileId({ ...session, churchProfileId: null } as ChurchAppSession)).toBeNull();
  });
});
