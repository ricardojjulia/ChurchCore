import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// S4 (F8): the cron routes fail closed without CRON_SECRET, except under
// `next dev`. Before, every request passed outside production when it was unset.

function cronRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/communications-scheduled", { headers });
}

describe("isAuthorizedCronRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts the secret as Vercel Cron sends it (Bearer) or as x-cron-secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorizedCronRequest(cronRequest({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(isAuthorizedCronRequest(cronRequest({ "x-cron-secret": "s3cret" }))).toBe(true);
  });

  it("rejects a missing, wrong, or differently sized secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorizedCronRequest(cronRequest())).toBe(false);
    expect(isAuthorizedCronRequest(cronRequest({ authorization: "Bearer wrong!" }))).toBe(false);
    expect(isAuthorizedCronRequest(cronRequest({ "x-cron-secret": "s3cret-and-more" }))).toBe(false);
    expect(isAuthorizedCronRequest(cronRequest({ authorization: "s3cret" }))).toBe(false);
  });

  it.each(["production", "test"])("rejects everything when CRON_SECRET is unset (NODE_ENV=%s)", (nodeEnv) => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isAuthorizedCronRequest(cronRequest({ authorization: "Bearer anything" }))).toBe(false);
  });

  it("lets `next dev` run the crons without a secret", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isAuthorizedCronRequest(cronRequest())).toBe(true);
  });
});
