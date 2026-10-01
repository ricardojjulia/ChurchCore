import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTenantAdminClientMock } = vi.hoisted(() => ({ createTenantAdminClientMock: vi.fn() }));

vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: createTenantAdminClientMock }));

import { POST } from "@/app/api/demo/complete-payment/route";

// S4: demo-only, and even in demo mode it completes only a still-pending
// stubbed payment, never a real (Stripe) or already-settled one.

type Update = { table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> };

function fakeAdmin(completedRows: Array<{ id: string }>) {
  const updates: Update[] = [];
  return {
    updates,
    client: {
      from(table: string) {
        const update: Update = { table, values: {}, filters: [] };
        const builder = {
          update: (values: Record<string, unknown>) => ((update.values = values), builder),
          eq: (column: string, value: unknown) => (update.filters.push([column, value]), builder),
          select: async () => (updates.push(update), { data: completedRows, error: null }),
          then: (resolve: (value: unknown) => void) => (updates.push(update), resolve({ error: null })),
        };
        return builder;
      },
    },
  };
}

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/demo/complete-payment", { method: "POST", body: JSON.stringify(body) }),
  );
}

describe("POST /api/demo/complete-payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is 403 outside demo mode, without touching the database", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const response = await post({ registrationId: "reg-1", churchId: "church-1" });
    expect(response.status).toBe(403);
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
  });

  it("is 400 without a registration or church", async () => {
    expect((await post({ churchId: "church-1" })).status).toBe(400);
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
  });

  it("completes only the registration's pending stub payment, then marks the registration paid", async () => {
    const admin = fakeAdmin([{ id: "pay-1" }]);
    createTenantAdminClientMock.mockReturnValue(admin.client);

    const response = await post({ registrationId: "reg-1", churchId: "church-1" });

    expect(response.status).toBe(200);
    expect(admin.updates[0]).toMatchObject({
      table: "event_registration_payments",
      values: { status: "succeeded" },
      filters: [
        ["registration_id", "reg-1"],
        ["church_id", "church-1"],
        ["payment_intent_id", "pi_event_registration_stub_reg-1"],
        ["status", "pending"],
      ],
    });
    expect(admin.updates[1]).toMatchObject({
      table: "event_registrations",
      values: { payment_status: "paid" },
      filters: [
        ["id", "reg-1"],
        ["church_id", "church-1"],
      ],
    });
  });

  it("is 404, and marks nothing paid, when there is no pending stub payment (a real Stripe payment, or already settled)", async () => {
    const admin = fakeAdmin([]);
    createTenantAdminClientMock.mockReturnValue(admin.client);

    const response = await post({ registrationId: "reg-real", churchId: "church-1" });

    expect(response.status).toBe(404);
    expect(admin.updates.map((u) => u.table)).toEqual(["event_registration_payments"]);
  });
});
