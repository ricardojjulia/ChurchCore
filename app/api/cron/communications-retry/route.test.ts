import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasTenantBackendEnvMock,
  hasTenantAdminBackendEnvMock,
  shouldUseLocalTenantFallbackMock,
  retryEligibleCommunicationsMock,
} = vi.hoisted(() => ({
  hasTenantBackendEnvMock: vi.fn(),
  hasTenantAdminBackendEnvMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  retryEligibleCommunicationsMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  hasTenantAdminBackendEnv: hasTenantAdminBackendEnvMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

vi.mock("@/lib/communications/retry-eligible", () => ({
  retryEligibleCommunications: retryEligibleCommunicationsMock,
}));

import { GET } from "@/app/api/cron/communications-retry/route";

function makeRequest(opts?: { secret?: string; headerSecret?: string }): Request {
  const headers = new Headers();
  if (opts?.secret !== undefined) {
    headers.set("authorization", `Bearer ${opts.secret}`);
  }
  if (opts?.headerSecret !== undefined) {
    headers.set("x-cron-secret", opts.headerSecret);
  }
  return new Request("http://localhost/api/cron/communications-retry", { headers });
}

describe("GET /api/cron/communications-retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("NODE_ENV", "test");
    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantAdminBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  });

  it("returns 401 for missing authorization header", async () => {
    const request = makeRequest();
    const response = await GET(request as never);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 for wrong secret", async () => {
    const request = makeRequest({ secret: "wrong-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(401);
  });

  it("returns 503 when tenant backend is not configured", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const request = makeRequest({ secret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("Tenant backend is not configured");
  });

  it("returns 503 when admin env is missing and local fallback is off", async () => {
    hasTenantAdminBackendEnvMock.mockReturnValue(false);
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);

    const request = makeRequest({ secret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("SERVICE_ROLE_KEY");
  });

  it("returns 200 with counts when all retries succeed", async () => {
    retryEligibleCommunicationsMock.mockResolvedValue({
      selected: 3,
      succeeded: 3,
      failedAgain: 0,
      skipped: 0,
    });

    const request = makeRequest({ secret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ selected: 3, succeeded: 3, failedAgain: 0, skipped: 0 });
  });

  it("returns 207 when some retries still fail", async () => {
    retryEligibleCommunicationsMock.mockResolvedValue({
      selected: 4,
      succeeded: 2,
      failedAgain: 2,
      skipped: 0,
    });

    const request = makeRequest({ secret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(207);
    const body = await response.json();
    expect(body.failedAgain).toBe(2);
  });

  it("returns 200 for empty retry queue", async () => {
    retryEligibleCommunicationsMock.mockResolvedValue({
      selected: 0,
      succeeded: 0,
      failedAgain: 0,
      skipped: 0,
    });

    const request = makeRequest({ secret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(200);
  });

  it("returns 500 for unexpected errors", async () => {
    retryEligibleCommunicationsMock.mockRejectedValue(new Error("Database connection failed"));

    const request = makeRequest({ secret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Database connection failed");
  });

  it("accepts secret via x-cron-secret header", async () => {
    retryEligibleCommunicationsMock.mockResolvedValue({
      selected: 1,
      succeeded: 1,
      failedAgain: 0,
      skipped: 0,
    });

    const request = makeRequest({ headerSecret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(200);
  });

  it("passes with local fallback even when admin env is missing", async () => {
    hasTenantAdminBackendEnvMock.mockReturnValue(false);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);

    retryEligibleCommunicationsMock.mockResolvedValue({
      selected: 0,
      succeeded: 0,
      failedAgain: 0,
      skipped: 0,
    });

    const request = makeRequest({ secret: "test-cron-secret" });
    const response = await GET(request as never);
    expect(response.status).toBe(200);
  });
});
