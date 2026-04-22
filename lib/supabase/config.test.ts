import { afterEach, describe, expect, it } from "vitest";

import {
  getPreferredSupabaseSurfaceForRedirect,
  getControlPlaneDbUrl,
  getSupabaseRefreshSurfacesForPath,
  getSupabaseSurfaceFallbackOrder,
  getSupabaseEnvForSurface,
  getTenantDbUrl,
  hasSupabaseEnvForSurface,
  shouldUseLocalControlPlaneDbFallback,
  shouldUseLocalTenantDbFallback,
} from "@/lib/supabase/config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("supabase config surface routing", () => {
  it("maps redirect targets to the correct preferred surface", () => {
    expect(getPreferredSupabaseSurfaceForRedirect("/control")).toBe(
      "control-plane",
    );
    expect(getPreferredSupabaseSurfaceForRedirect("/app/member")).toBe(
      "tenant",
    );
    expect(getPreferredSupabaseSurfaceForRedirect("/workspace")).toBe("tenant");
  });

  it("returns the correct refresh surfaces per route family", () => {
    expect(getSupabaseRefreshSurfacesForPath("/control")).toEqual([
      "control-plane",
    ]);
    expect(getSupabaseRefreshSurfacesForPath("/app/member")).toEqual([
      "tenant",
    ]);
    expect(getSupabaseRefreshSurfacesForPath("/sign-in")).toEqual([
      "tenant",
      "control-plane",
    ]);
    expect(getSupabaseRefreshSurfacesForPath("/")).toEqual([]);
  });

  it("orders fallback surfaces with the preferred surface first", () => {
    expect(getSupabaseSurfaceFallbackOrder("control-plane")).toEqual([
      "control-plane",
      "tenant",
    ]);
    expect(getSupabaseSurfaceFallbackOrder("tenant")).toEqual([
      "tenant",
      "control-plane",
    ]);
  });

  it("resolves split envs per surface", () => {
    process.env.CONTROL_PLANE_SUPABASE_URL = "https://control.example.com";
    process.env.CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY = "control-key";
    process.env.TENANT_SUPABASE_URL = "https://tenant.example.com";
    process.env.TENANT_SUPABASE_PUBLISHABLE_KEY = "tenant-key";

    expect(hasSupabaseEnvForSurface("control-plane")).toBe(true);
    expect(hasSupabaseEnvForSurface("tenant")).toBe(true);
    expect(getSupabaseEnvForSurface("control-plane")).toEqual({
      url: "https://control.example.com",
      publishableKey: "control-key",
    });
    expect(getSupabaseEnvForSurface("tenant")).toEqual({
      url: "https://tenant.example.com",
      publishableKey: "tenant-key",
    });
  });

  it("falls back to the shared env when split envs are absent", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://shared.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "shared-key";

    expect(getSupabaseEnvForSurface("control-plane")).toEqual({
      url: "https://shared.example.com",
      publishableKey: "shared-key",
    });
    expect(getSupabaseEnvForSurface("tenant")).toEqual({
      url: "https://shared.example.com",
      publishableKey: "shared-key",
    });
  });

  it("resolves split db urls per surface", () => {
    process.env.CONTROL_PLANE_DB_URL = "postgres://control";
    process.env.TENANT_DB_URL = "postgres://tenant";

    expect(getControlPlaneDbUrl()).toBe("postgres://control");
    expect(getTenantDbUrl()).toBe("postgres://tenant");
  });

  it("falls back to the shared db url when split urls are absent", () => {
    process.env.SUPABASE_DB_URL = "postgres://shared";

    expect(getControlPlaneDbUrl()).toBe("postgres://shared");
    expect(getTenantDbUrl()).toBe("postgres://shared");
  });

  it("keeps local db fallback decisions surface-specific", () => {
    process.env.CONTROL_PLANE_DB_URL = "postgres://control";
    process.env.TENANT_DB_URL = "postgres://tenant";
    process.env.CONTROL_PLANE_SUPABASE_URL = "https://control.example.com";
    process.env.CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY = "control-key";

    expect(shouldUseLocalControlPlaneDbFallback()).toBe(false);
    expect(shouldUseLocalTenantDbFallback()).toBe(true);

    process.env.TENANT_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.TENANT_SUPABASE_PUBLISHABLE_KEY = "tenant-key";

    expect(shouldUseLocalTenantDbFallback()).toBe(true);
  });
});
