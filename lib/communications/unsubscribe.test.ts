import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateUnsubscribeLink, verifyUnsubscribeToken } from "@/lib/communications/unsubscribe";

describe("unsubscribe utilities", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  // ── generateUnsubscribeLink ────────────────────────────────────────────────

  it("throws when UNSUBSCRIBE_SECRET is absent", () => {
    delete process.env.UNSUBSCRIBE_SECRET;

    expect(() => generateUnsubscribeLink("church-1", "member@example.com", "email")).toThrow(
      "UNSUBSCRIBE_SECRET is not configured",
    );
  });

  it("returns a URL with the expected query parameter keys", () => {
    process.env.UNSUBSCRIBE_SECRET = "testsecret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:4200";

    const link = generateUnsubscribeLink("church-1", "member@example.com", "email");
    const url = new URL(link);

    expect(url.searchParams.has("cid")).toBe(true);
    expect(url.searchParams.has("e")).toBe(true);
    expect(url.searchParams.has("ch")).toBe(true);
    expect(url.searchParams.has("t")).toBe(true);
    expect(url.searchParams.has("sig")).toBe(true);
  });

  it("round-trips: generateUnsubscribeLink → verifyUnsubscribeToken returns valid: true", () => {
    process.env.UNSUBSCRIBE_SECRET = "testsecret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:4200";

    const link = generateUnsubscribeLink("church-abc", "user@example.com", "sms");
    const url = new URL(link);

    const result = verifyUnsubscribeToken({
      t: url.searchParams.get("t") ?? "",
      cid: url.searchParams.get("cid") ?? "",
      e: url.searchParams.get("e") ?? "",
      ch: url.searchParams.get("ch") ?? "",
      sig: url.searchParams.get("sig") ?? "",
    });

    expect(result).toEqual({
      valid: true,
      churchId: "church-abc",
      contactEmail: "user@example.com",
      channel: "sms",
    });
  });

  // ── verifyUnsubscribeToken ─────────────────────────────────────────────────

  it("returns expired for a past timestamp", () => {
    process.env.UNSUBSCRIBE_SECRET = "testsecret";

    const pastExpiry = String(Date.now() - 1000);
    const result = verifyUnsubscribeToken({
      t: pastExpiry,
      cid: "church-1",
      e: "member@example.com",
      ch: "email",
      sig: "deadbeef".repeat(8),
    });

    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("returns invalid_signature for a mutated sig", () => {
    process.env.UNSUBSCRIBE_SECRET = "testsecret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:4200";

    const link = generateUnsubscribeLink("church-1", "member@example.com", "email");
    const url = new URL(link);

    // Flip the first character of the signature
    const originalSig = url.searchParams.get("sig") ?? "";
    const mutatedSig = (originalSig[0] === "a" ? "b" : "a") + originalSig.slice(1);

    const result = verifyUnsubscribeToken({
      t: url.searchParams.get("t") ?? "",
      cid: url.searchParams.get("cid") ?? "",
      e: url.searchParams.get("e") ?? "",
      ch: url.searchParams.get("ch") ?? "",
      sig: mutatedSig,
    });

    expect(result).toEqual({ valid: false, reason: "invalid_signature" });
  });

  it("returns invalid_channel for ch=fax", () => {
    process.env.UNSUBSCRIBE_SECRET = "testsecret";

    const futureExpiry = String(Date.now() + 60_000);
    const result = verifyUnsubscribeToken({
      t: futureExpiry,
      cid: "church-1",
      e: "member@example.com",
      ch: "fax",
      sig: "deadbeef".repeat(8),
    });

    expect(result).toEqual({ valid: false, reason: "invalid_channel" });
  });

  it("returns missing_params for an empty sig", () => {
    const result = verifyUnsubscribeToken({
      t: String(Date.now() + 60_000),
      cid: "church-1",
      e: "member@example.com",
      ch: "email",
      sig: "",
    });

    expect(result).toEqual({ valid: false, reason: "missing_params" });
  });
});
