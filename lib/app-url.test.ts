import { afterEach, describe, expect, it, vi } from "vitest";

import { appBaseUrl } from "@/lib/app-url";

describe("appBaseUrl (Council Review 23)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_APP_URL, without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", " https://app.example.org/ ");
    expect(appBaseUrl()).toBe("https://app.example.org");
  });

  it("falls back to the local dev server outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(appBaseUrl()).toBe("http://localhost:4200");
  });

  it("is null in production without it, so no dead localhost link is sent", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(appBaseUrl()).toBeNull();
  });
});
