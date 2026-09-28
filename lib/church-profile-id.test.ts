import { describe, expect, it } from "vitest";

import { requireChurchProfileId } from "@/lib/church-profile-id";

describe("requireChurchProfileId", () => {
  it("returns the church profile id, and refuses a session without one", () => {
    expect(requireChurchProfileId({ churchProfileId: "profile-7" })).toBe("profile-7");
    expect(() => requireChurchProfileId({ churchProfileId: null })).toThrow("Your account has no profile in this church.");
  });
});
