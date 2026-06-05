import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  createTenantAdminClientMock,
  createTenantServerClientMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => ({
  queryTenantLocalDbMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  createTenantAdminClientMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
  hasTenantBackendEnvMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  createTenantAdminClient: createTenantAdminClientMock,
  createTenantServerClient: createTenantServerClientMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
}));

import { POST } from "@/app/api/push/subscribe/route";

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: { p256dh: "BNcR...", auth: "tBHI..." },
};

function makeSupabaseClient(userId: string | null, profileOwned = true) {
  const maybeSingleMock = vi.fn().mockResolvedValue({
    data: profileOwned ? { id: "profile-1" } : null,
    error: null,
  });
  const proxy: Record<string, unknown> = {};
  const chainFn = vi.fn().mockReturnValue(proxy);
  proxy.from = chainFn;
  proxy.select = chainFn;
  proxy.eq = chainFn;
  proxy.maybeSingle = maybeSingleMock;
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
    ...proxy,
  };
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("push subscribe route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    hasTenantBackendEnvMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
    createTenantServerClientMock.mockResolvedValue(makeSupabaseClient("user-1"));
  });

  it("returns 401 when no authenticated user", async () => {
    createTenantServerClientMock.mockResolvedValue(makeSupabaseClient(null));

    const response = await POST(
      makeRequest({ subscription: validSubscription, churchId: "church-1", profileId: "profile-1" }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 200 with skipped when VAPID keys missing", async () => {
    const origPublic = process.env.VAPID_PUBLIC_KEY;
    const origPrivate = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const response = await POST(
      makeRequest({ subscription: validSubscription, churchId: "church-1", profileId: "profile-1" }),
    );
    const body = await response.json() as { received: boolean; skipped: boolean };

    expect(response.status).toBe(200);
    expect(body.skipped).toBe(true);

    process.env.VAPID_PUBLIC_KEY = origPublic;
    process.env.VAPID_PRIVATE_KEY = origPrivate;
  });

  it("upserts subscription to local DB when VAPID keys present", async () => {
    process.env.VAPID_PUBLIC_KEY = "BTest...";
    process.env.VAPID_PRIVATE_KEY = "PrivTest...";

    const response = await POST(
      makeRequest({ subscription: validSubscription, churchId: "church-1", profileId: "profile-1" }),
    );

    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.push_subscriptions"),
      expect.arrayContaining(["church-1", "profile-1", validSubscription.endpoint]),
    );

    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("returns 400 when subscription is missing required fields", async () => {
    process.env.VAPID_PUBLIC_KEY = "BTest...";
    process.env.VAPID_PRIVATE_KEY = "PrivTest...";

    const response = await POST(
      makeRequest({ subscription: { endpoint: "" }, churchId: "church-1", profileId: "profile-1" }),
    );

    expect(response.status).toBe(400);

    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("returns 403 when profileId does not belong to authenticated user", async () => {
    process.env.VAPID_PUBLIC_KEY = "BTest...";
    process.env.VAPID_PRIVATE_KEY = "PrivTest...";
    // Profile ownership check returns null — profile not owned by this user
    createTenantServerClientMock.mockResolvedValue(makeSupabaseClient("user-1", false));

    const response = await POST(
      makeRequest({ subscription: validSubscription, churchId: "church-1", profileId: "profile-other" }),
    );

    expect(response.status).toBe(403);

    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("upserts via Supabase when shouldUseLocalTenantFallback is false", async () => {
    process.env.VAPID_PUBLIC_KEY = "BTest...";
    process.env.VAPID_PRIVATE_KEY = "PrivTest...";
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);

    const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const adminFromMock = vi.fn().mockReturnValue({
      upsert: upsertMock,
    });
    createTenantAdminClientMock.mockReturnValue({ from: adminFromMock });

    const response = await POST(
      makeRequest({ subscription: validSubscription, churchId: "church-1", profileId: "profile-1" }),
    );

    expect(response.status).toBe(200);
    expect(adminFromMock).toHaveBeenCalledWith("push_subscriptions");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: validSubscription.endpoint }),
      expect.any(Object),
    );

    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });
});
