import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryTenantLocalDbMock,
  createTenantServerClientMock,
  shouldUseLocalTenantFallbackMock,
  supabaseFromMock,
  supabaseSelectMock,
  supabaseLteMock,
} = vi.hoisted(() => {
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  const supabaseLte = vi.fn();
  const supabaseGte = vi.fn();
  const supabaseNeq = vi.fn();
  const supabaseEq = vi.fn();
  const supabaseSelect = vi.fn();
  const supabaseFrom = vi.fn();

  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  const builder = {
    select: supabaseSelect,
    eq: supabaseEq,
    neq: supabaseNeq,
    gte: supabaseGte,
    lte: supabaseLte,
  };

  supabaseSelect.mockReturnValue(builder);
  supabaseEq.mockReturnValue(builder);
  supabaseNeq.mockReturnValue(builder);
  supabaseGte.mockReturnValue(builder);
  supabaseLte.mockReturnValue(builder);

  return {
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    createTenantServerClientMock: createTenantServerClient,
    supabaseFromMock: supabaseFrom,
    supabaseSelectMock: supabaseSelect,
    supabaseEqMock: supabaseEq,
    supabaseNeqMock: supabaseNeq,
    supabaseGteMock: supabaseGte,
    supabaseLteMock: supabaseLte,
  };
});

vi.mock("@/lib/supabase/tenant", () => ({
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantServerClient: createTenantServerClientMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import { checkVolunteerBurnout } from "@/lib/burnout-calculator";

describe("checkVolunteerBurnout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return false if params are missing", async () => {
    const result = await checkVolunteerBurnout("", "", "");
    expect(result.isBurnedOut).toBe(false);
  });

  it("should return false if shift count is below threshold (local fallback)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [{ count: 1 }] });

    const result = await checkVolunteerBurnout("church-1", "profile-1", "2026-06-07T12:00:00Z");
    expect(result.isBurnedOut).toBe(false);
    expect(queryTenantLocalDbMock).toHaveBeenCalled();
  });

  it("should return true if shift count is 3 or more (local fallback)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [{ count: 3 }] });

    const result = await checkVolunteerBurnout("church-1", "profile-1", "2026-06-07T12:00:00Z");
    expect(result.isBurnedOut).toBe(true);
    expect(result.reason).toContain("scheduled 3 shifts");
  });

  it("should return false if shift count is below threshold (Supabase path)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseLteMock.mockResolvedValue({ count: 2, error: null });
    supabaseFromMock.mockReturnValue({ select: supabaseSelectMock });

    const result = await checkVolunteerBurnout("church-1", "profile-1", "2026-06-07T12:00:00Z");
    expect(result.isBurnedOut).toBe(false);
    expect(createTenantServerClientMock).toHaveBeenCalled();
  });

  it("should return true if shift count is 3 or more (Supabase path)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseLteMock.mockResolvedValue({ count: 4, error: null });
    supabaseFromMock.mockReturnValue({ select: supabaseSelectMock });

    const result = await checkVolunteerBurnout("church-1", "profile-1", "2026-06-07T12:00:00Z");
    expect(result.isBurnedOut).toBe(true);
    expect(result.reason).toContain("scheduled 4 shifts");
  });
});
