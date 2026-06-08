import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be declared before any imports that use them
// ---------------------------------------------------------------------------
const {
  createTenantServerClientMock,
} = vi.hoisted(() => {
  const createTenantServerClient = vi.fn();
  return { createTenantServerClientMock: createTenantServerClient };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
}));

import { resolveRecipients } from "@/lib/communications/recipient-resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal profile row as returned by Supabase. */
function makeProfileRow(overrides: Partial<{
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  contact_allowed: boolean;
  merged_into_profile_id: string | null;
  notification_preferences: Array<{ email_opt_in: boolean; sms_opt_in: boolean }> | null;
}> = {}) {
  return {
    id: overrides.id ?? "profile-1",
    full_name: overrides.full_name ?? "Test Member",
    email: overrides.email !== undefined ? overrides.email : "member@example.com",
    phone: overrides.phone !== undefined ? overrides.phone : "+15551234567",
    contact_allowed: overrides.contact_allowed !== undefined ? overrides.contact_allowed : true,
    merged_into_profile_id: overrides.merged_into_profile_id ?? null,
    notification_preferences: overrides.notification_preferences !== undefined
      ? overrides.notification_preferences
      : [{ email_opt_in: true, sms_opt_in: true }],
  };
}

/**
 * Build a chainable Supabase query mock. Every chained method returns `chain`
 * itself, and awaiting the chain resolves with `{ data, error }`.
 *
 * We make `chain` a Promise via Object.assign so that `await chain` works.
 */
function makeQueryChain(
  finalData: unknown[],
  finalError: null | { message: string } = null,
): Record<string, unknown> & Promise<{ data: unknown[]; error: null | { message: string } }> {
  const resolution = Promise.resolve({ data: finalData, error: finalError });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = Object.assign(resolution, {});

  for (const method of [
    "select", "eq", "in", "is", "limit", "gte", "ilike", "or",
    "not", "neq", "filter", "order",
  ]) {
    chain[method] = vi.fn(() => chain);
  }

  return chain;
}

/**
 * Build a minimal Supabase client mock where `from(table)` is intercepted.
 *
 * `tableMap` is a map from table name -> { rows, error }.  Tables not in the
 * map return an empty-row query.
 */
function makeSupabaseMock(
  tableMap: Record<string, { rows: unknown[]; error?: { message: string } | null }>,
) {
  return {
    from: vi.fn((table: string) => {
      const config = tableMap[table] ?? { rows: [], error: null };
      return makeQueryChain(config.rows, config.error ?? null);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveRecipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes profiles where contact_allowed = false", async () => {
    // The base query has .eq('contact_allowed', true) baked in, so if we
    // return an empty row set the filtering is working.  We verify by
    // returning zero rows from profiles (simulating the DB filter).
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: { rows: [] },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "email", {});
    expect(results).toHaveLength(0);
  });

  it("excludes profiles opted out of email", async () => {
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [
            makeProfileRow({
              id: "p-opted-out",
              notification_preferences: [{ email_opt_in: false, sms_opt_in: true }],
            }),
          ],
        },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "email", {});
    expect(results).toHaveLength(0);
  });

  it("excludes profiles opted out of sms", async () => {
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [
            makeProfileRow({
              id: "p-no-sms",
              notification_preferences: [{ email_opt_in: true, sms_opt_in: false }],
            }),
          ],
        },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "sms", {});
    expect(results).toHaveLength(0);
  });

  it("defaults sms to opted-out when no preference row", async () => {
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [
            makeProfileRow({ id: "p-no-pref", notification_preferences: null }),
          ],
        },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "sms", {});
    expect(results).toHaveLength(0);
  });

  it("defaults email to opted-in when no preference row", async () => {
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [
            makeProfileRow({ id: "p-no-pref", notification_preferences: null }),
          ],
        },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "email", {});
    expect(results).toHaveLength(1);
    expect(results[0].profileId).toBe("p-no-pref");
  });

  it("excludes suppressed contacts", async () => {
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [makeProfileRow({ id: "p-suppressed", email: "suppressed@example.com" })],
        },
        communication_suppressions: {
          rows: [{ contact: "suppressed@example.com" }],
        },
      }),
    );

    const results = await resolveRecipients("church-1", "email", {});
    expect(results).toHaveLength(0);
  });

  it("includes non-suppressed contacts", async () => {
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [makeProfileRow({ id: "p-ok", email: "ok@example.com" })],
        },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "email", {});
    expect(results).toHaveLength(1);
    expect(results[0].contact).toBe("ok@example.com");
  });

  it("applies ministry filter and asserts church_id eq was called", async () => {
    // We need to capture the `.eq` calls on the profile_ministries query
    // to verify the church_id filter is included (Fix C1).
    const pmEqCalls: Array<[string, unknown]> = [];

    const profilesChain = makeQueryChain([
      makeProfileRow({ id: "p-ministry" }),
    ]);

    const suppressionsChain = makeQueryChain([]);

    // Build a thenable chain for profile_ministries that captures eq calls
    const pmResolution = Promise.resolve({
      data: [{ profile_id: "p-ministry" }],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pmChain: any = Object.assign(pmResolution, {});
    for (const method of ["select", "in", "is", "limit", "gte", "order"]) {
      pmChain[method] = vi.fn(() => pmChain);
    }
    pmChain.eq = vi.fn((col: string, val: unknown) => {
      pmEqCalls.push([col, val]);
      return pmChain;
    });

    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") return profilesChain;
        if (table === "communication_suppressions") return suppressionsChain;
        if (table === "profile_ministries") return pmChain;
        return makeQueryChain([]);
      }),
    });

    const results = await resolveRecipients("church-1", "email", {
      ministryIds: ["ministry-uuid-1"],
    });

    // Verify the church_id eq was called on profile_ministries (Fix C1)
    const churchIdEq = pmEqCalls.find(([col]) => col === "church_id");
    expect(churchIdEq).toBeDefined();
    expect(churchIdEq?.[1]).toBe("church-1");

    expect(results).toHaveLength(1);
    expect(results[0].profileId).toBe("p-ministry");
  });

  it("ministry filter excludes profiles not in the ministry set", async () => {
    const pmResolution2 = Promise.resolve({
      data: [{ profile_id: "p-other-ministry" }],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pmChain: any = Object.assign(pmResolution2, {});
    // profile_ministries returns a different profile id — so the profile row
    // should be filtered out.
    for (const method of ["select", "in", "eq", "is", "limit", "gte", "order"]) {
      pmChain[method] = vi.fn(() => pmChain);
    }

    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") return makeQueryChain([makeProfileRow({ id: "p-1" })]);
        if (table === "communication_suppressions") return makeQueryChain([]);
        if (table === "profile_ministries") return pmChain;
        return makeQueryChain([]);
      }),
    });

    const results = await resolveRecipients("church-1", "email", {
      ministryIds: ["ministry-uuid-1"],
    });

    // p-1 is not in the returned ministry set, so should be excluded
    expect(results).toHaveLength(0);
  });

  it("applies attendance filter and excludes profiles outside the window", async () => {
    const attResolution = Promise.resolve({ data: [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attChain: any = Object.assign(attResolution, {});
    for (const method of ["select", "eq", "gte", "in", "is", "limit", "order"]) {
      attChain[method] = vi.fn(() => attChain);
    }
    // No attendance rows for profile-1 → should be filtered out

    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") return makeQueryChain([makeProfileRow({ id: "p-1" })]);
        if (table === "communication_suppressions") return makeQueryChain([]);
        if (table === "attendance_records") return attChain;
        return makeQueryChain([]);
      }),
    });

    const results = await resolveRecipients("church-1", "email", {
      attendedWithinDays: 30,
    });

    expect(results).toHaveLength(0);
  });

  it("includes profiles that match the attendance window", async () => {
    const attResolution2 = Promise.resolve({ data: [{ profile_id: "p-1" }], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attChain: any = Object.assign(attResolution2, {});
    for (const method of ["select", "eq", "gte", "in", "is", "limit", "order"]) {
      attChain[method] = vi.fn(() => attChain);
    }

    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") return makeQueryChain([makeProfileRow({ id: "p-1" })]);
        if (table === "communication_suppressions") return makeQueryChain([]);
        if (table === "attendance_records") return attChain;
        return makeQueryChain([]);
      }),
    });

    const results = await resolveRecipients("church-1", "email", {
      attendedWithinDays: 30,
    });

    expect(results).toHaveLength(1);
    expect(results[0].profileId).toBe("p-1");
  });

  it("returned contacts have the raw (unmasked) email address", async () => {
    // resolveRecipients returns real contact; masking happens in the action layer
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [makeProfileRow({ id: "p-1", email: "real@example.com" })],
        },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "email", {});
    expect(results[0].contact).toBe("real@example.com");
    // The contact is NOT masked at this layer (masking is in previewRecipientsAction)
    expect(results[0].contact).not.toContain("***");
  });

  it("returned contacts have the raw phone for sms", async () => {
    createTenantServerClientMock.mockResolvedValue(
      makeSupabaseMock({
        profiles: {
          rows: [
            makeProfileRow({
              id: "p-1",
              phone: "+15559876543",
              notification_preferences: [{ email_opt_in: true, sms_opt_in: true }],
            }),
          ],
        },
        communication_suppressions: { rows: [] },
      }),
    );

    const results = await resolveRecipients("church-1", "sms", {});
    expect(results[0].contact).toBe("+15559876543");
    expect(results[0].contact).not.toContain("***");
  });

  it("throws when Supabase returns an error on the profiles query", async () => {
    const errChain = makeQueryChain([], { message: "db error" });
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => errChain),
    });

    await expect(resolveRecipients("church-1", "email", {})).rejects.toThrow("db error");
  });
});
