import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  supabaseFromMock,
  supabaseUpsertMock,
  supabaseSingleMock,
  supabaseInsertMock,
  createTenantServerClientMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const queryTenantLocalDb = vi.fn();

  const supabaseUpsert = vi.fn();
  const supabaseInsert = vi.fn();
  const supabaseSingle = vi.fn();
  const supabaseEq = vi.fn(() => ({
    eq: supabaseEq,
    single: supabaseSingle,
  }));
  const supabaseSelect = vi.fn(() => ({
    eq: supabaseEq,
    single: supabaseSingle,
  }));
  const supabaseFrom = vi.fn(() => ({
    upsert: supabaseUpsert,
    insert: supabaseInsert,
    select: supabaseSelect,
  }));

  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    queryTenantLocalDbMock: queryTenantLocalDb,
    supabaseFromMock: supabaseFrom,
    supabaseUpsertMock: supabaseUpsert,
    supabaseSelectMock: supabaseSelect,
    supabaseEqMock: supabaseEq,
    supabaseSingleMock: supabaseSingle,
    supabaseInsertMock: supabaseInsert,
    createTenantServerClientMock: createTenantServerClient,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import {
  postDonationToGlAction,
  upsertFundMappingAction,
  upsertGivingPageAction,
} from "@/app/app/giving-actions";

describe("giving actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: {
        roleId: "church-admin",
        church: { id: "church-1", slug: "my-church" },
      },
      profile: { id: "profile-1" },
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    supabaseUpsertMock.mockResolvedValue({ error: null });
    supabaseInsertMock.mockResolvedValue({ error: null });
    supabaseSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("rejects non-admin users", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: {
        roleId: "member",
        church: { id: "church-1", slug: "my-church" },
      },
      profile: { id: "profile-1" },
    });

    await expect(
      upsertFundMappingAction({
        fundDesignation: "General",
        assetAccountId: "asset-1",
        incomeAccountId: "income-1",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("validates required fund designation", async () => {
    const result = await upsertFundMappingAction({
      fundDesignation: "   ",
      assetAccountId: "asset-1",
      incomeAccountId: "income-1",
    });

    expect(result).toEqual({ ok: false, error: "Fund designation is required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("upserts fund mappings in local fallback mode", async () => {
    const result = await upsertFundMappingAction({
      fundDesignation: " General ",
      assetAccountId: "asset-1",
      incomeAccountId: "income-1",
    });

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.giving_fund_accounts"),
      ["church-1", "General", "asset-1", "income-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/giving");
  });

  it("returns an error when donation is not found in local fallback mode", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await postDonationToGlAction("donation-1");

    expect(result).toEqual({ ok: false, error: "Donation not found or not succeeded." });
  });

  it("posts donation journal and audit records in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "donation-1",
            amount_cents: 2500,
            fund_designation: "General",
            created_at: "2025-01-01T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ asset_account_id: "asset-1", income_account_id: "income-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "journal-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await postDonationToGlAction("donation-1");

    expect(result).toEqual({ ok: true, journalId: "journal-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.finance_journal_lines"),
      ["journal-1", "church-1", "asset-1", 2500, "Donation nation-1", "income-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/giving");
  });

  it("upserts giving page via Supabase when fallback is disabled", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseUpsertMock.mockResolvedValueOnce({ error: null });

    const result = await upsertGivingPageAction({
      headline: "Support The Mission",
      description: "Weekly giving",
      funds: ["General", "Missions"],
      stripeAccountId: "acct_123",
      isLive: true,
      allowAnonymous: false,
    });

    expect(result).toEqual({ ok: true });
    expect(createTenantServerClientMock).toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("public_giving_pages");
    expect(supabaseUpsertMock).toHaveBeenCalled();
  });
});
