import { describe, expect, it } from "vitest";

import { scrubPII } from "@/app/api/ai/route";

describe("scrubPII", () => {
  it("scrubs email addresses", () => {
    expect(scrubPII("Contact pastor.bob+leads@grace-harbor.org for help")).toBe(
      "Contact [EMAIL] for help",
    );
  });

  it("scrubs UUIDs", () => {
    expect(
      scrubPII("profile 3fa85f64-5717-4562-b3fc-2c963f66afa6 flagged"),
    ).toBe("profile [ID] flagged");
  });

  it("returns an empty string for empty input", () => {
    expect(scrubPII("")).toBe("");
  });

  it("does not hang on adversarial input with many repeated % characters", () => {
    const adversarial = "%".repeat(50_000) + "!";
    const start = performance.now();
    const result = scrubPII(adversarial);
    const durationMs = performance.now() - start;

    expect(result).toBe(adversarial);
    expect(durationMs).toBeLessThan(1000);
  });
});
