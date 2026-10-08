import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { shouldRedirectToKiosk } from "@/lib/ccm-kiosk-constants";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseEnvForSurface: () => ({ url: "u", publishableKey: "k" }),
  getSupabaseRefreshSurfacesForPath: () => [],
  hasSupabaseEnvForSurface: () => false,
}));

import { proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("shouldRedirectToKiosk", () => {
  it("never redirects a browser without the kiosk cookie", () => {
    expect(shouldRedirectToKiosk("/app/member", false)).toBe(false);
  });

  it.each(["/app/member", "/app/church-admin/people", "/", "/give", "/workspace", "/portal/children/checkin/abc"])(
    "sends %s back to the kiosk",
    (path) => expect(shouldRedirectToKiosk(path, true)).toBe(true),
  );

  it.each([
    "/kiosk/children",
    "/kiosk/children/anything",
    "/_next/static/chunks/a.js",
    "/vendor/zxing_reader.wasm",
    "/api/anything",
    "/sign-in",
    "/auth/confirm",
    "/sw.js",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/fonts/inter.woff2",
  ])("lets %s through", (path) => expect(shouldRedirectToKiosk(path, true)).toBe(false));

  it("does not treat a lookalike prefix as the kiosk", () => {
    expect(shouldRedirectToKiosk("/kiosks", true)).toBe(true);
    expect(shouldRedirectToKiosk("/app/kiosk/children", true)).toBe(true);
  });
});

describe("proxy", () => {
  it("redirects a kiosk tablet to the kiosk start screen", async () => {
    const response = await proxy(request("/app/church-admin/people", "cc_kiosk=abc"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/kiosk/children");
  });

  it("leaves a normal browser alone", async () => {
    const response = await proxy(request("/app/church-admin/people"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not loop on the kiosk page itself", async () => {
    const response = await proxy(request("/kiosk/children", "cc_kiosk=abc"));
    expect(response.headers.get("location")).toBeNull();
  });
});
