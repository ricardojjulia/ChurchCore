import { describe, expect, it } from "vitest";

import {
  computeServerFeedbackFingerprint,
  normalizeFeedbackText,
  parseDemoFeedbackPayload,
} from "@/lib/demo/feedback";

const validPayload = {
  session_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  route: "/demo/dashboard",
  category: "BUG",
  error_message: null,
  note: "The save button does not work",
  breadcrumbs: ["/demo", "/demo/dashboard"],
  demo_version: "3.4.0",
  session_duration: 42,
};

describe("demo feedback payload rules", () => {
  it("normalizes repeated whitespace and case for stable deduplication", () => {
    expect(normalizeFeedbackText("  Save   BUTTON\nFailed  ")).toBe("save button failed");
  });

  it("deduplicates equivalent normalized manual notes", () => {
    const first = computeServerFeedbackFingerprint({
      route: "/demo/dashboard",
      category: "BUG",
      errorMessage: null,
      note: "Save button failed",
    });
    const second = computeServerFeedbackFingerprint({
      route: "/demo/dashboard",
      category: "BUG",
      errorMessage: null,
      note: "  SAVE   button\nfailed ",
    });

    expect(first).toBe(second);
  });

  it("keeps materially different manual reports separate", () => {
    const saveFailure = computeServerFeedbackFingerprint({
      route: "/demo/dashboard",
      category: "BUG",
      errorMessage: null,
      note: "Save button failed",
    });
    const calendarFailure = computeServerFeedbackFingerprint({
      route: "/demo/dashboard",
      category: "BUG",
      errorMessage: null,
      note: "Calendar is missing events",
    });

    expect(saveFailure).not.toBe(calendarFailure);
  });

  it("uses the normalized error message for automatic error deduplication", () => {
    const first = computeServerFeedbackFingerprint({
      route: "/demo/dashboard",
      category: "ERROR",
      errorMessage: "Cannot read property 'id'",
      note: null,
    });
    const second = computeServerFeedbackFingerprint({
      route: "/demo/dashboard",
      category: "ERROR",
      errorMessage: "  CANNOT read   property 'id' ",
      note: "This note does not affect automatic error grouping",
    });

    expect(first).toBe(second);
  });

  it("parses and preserves bounded session context", () => {
    expect(parseDemoFeedbackPayload(validPayload)).toEqual(validPayload);
  });

  it.each([
    [{ ...validPayload, route: "x".repeat(501) }, "Route exceeds 500 characters"],
    [{ ...validPayload, error_message: "x".repeat(4001) }, "Error message exceeds 4000 characters"],
    [{ ...validPayload, breadcrumbs: Array.from({ length: 6 }, () => "/demo") }, "Invalid breadcrumbs"],
    [{ ...validPayload, breadcrumbs: ["x".repeat(501)] }, "Invalid breadcrumbs"],
    [{ ...validPayload, demo_version: "x".repeat(101) }, "Demo version exceeds 100 characters"],
    [{ ...validPayload, session_duration: -1 }, "Invalid session_duration"],
    [{ ...validPayload, session_duration: 2_592_001 }, "Invalid session_duration"],
    [{ ...validPayload, session_duration: 1.5 }, "Invalid session_duration"],
  ])("rejects invalid bounded input", (payload, message) => {
    expect(() => parseDemoFeedbackPayload(payload)).toThrow(message);
  });
});
