import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  createTenantServerClientMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const createTenantServerClient = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    queryTenantLocalDbMock: queryTenantLocalDb,
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
  createAccountAction,
  createJournalAction,
  importFinanceRowsAction,
  postJournalAction,
  voidJournalAction,
} from "@/app/app/finance-actions";

describe("finance actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });
  });

  it("rejects non-admin users for chart of accounts changes", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });

    await expect(
      createAccountAction({
        accountCode: "1000",
        name: "Cash",
        accountType: "asset",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("creates account in local fallback mode", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "acct-1" }] });

    const result = await createAccountAction({
      accountCode: "1000",
      name: "Operating Cash",
      accountType: "asset",
    });

    expect(result).toEqual({ id: "acct-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.finance_accounts"),
      ["church-1", null, "1000", "Operating Cash", null, "asset"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/accounts");
  });

  it("rejects unbalanced journal entries", async () => {
    await expect(
      createJournalAction({
        journalDate: "2025-01-01",
        description: "Bad journal",
        lines: [
          { accountId: "acct-1", side: "debit", amountCents: 1000 },
          { accountId: "acct-2", side: "credit", amountCents: 900 },
        ],
      }),
    ).rejects.toThrow("Journal is unbalanced");
  });

  it("creates a draft journal and lines in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "journal-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await createJournalAction({
      journalDate: "2025-01-01",
      description: "Balanced journal",
      lines: [
        { accountId: "acct-1", side: "debit", amountCents: 1000 },
        { accountId: "acct-2", side: "credit", amountCents: 1000 },
      ],
    });

    expect(result).toEqual({ id: "journal-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals");
  });

  it("posts a draft journal and revalidates detail + list paths", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await postJournalAction("journal-22");

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("set status = 'posted'"),
      ["journal-22", "church-1", "profile-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals/journal-22");
  });

  it("blocks imports with no valid positive rows", async () => {
    await expect(
      importFinanceRowsAction({
        filename: "import.csv",
        format: "csv",
        rows: [{
          date: "2025-01-01",
          description: "Invalid",
          amountCents: 0,
          debitAccountCode: null,
          creditAccountCode: null,
          raw: {},
          error: "invalid",
        }],
        defaultDebitAccountId: "acct-1",
        defaultCreditAccountId: "acct-2",
      }),
    ).rejects.toThrow("No valid rows to import");
  });

  describe("voidJournalAction", () => {
    const baseSession = {
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-actor-1" },
      source: "supabase",
    };

    it("sets voided_at and voided_by on the Supabase path", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      requireChurchSessionMock.mockResolvedValue(baseSession);

      const eqMock = vi.fn().mockReturnThis();
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      eqMock.mockReturnValue({ eq: eqMock });
      const fromMock = vi.fn().mockReturnValue({ update: updateMock, eq: eqMock });
      createTenantServerClientMock.mockResolvedValue({ from: fromMock });

      await voidJournalAction("journal-1");

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "voided",
          voided_by: "profile-actor-1",
        }),
      );
      expect(updateMock.mock.calls[0][0]).toHaveProperty("voided_at");
    });

    it("sets voided_at and voided_by on the local fallback path", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(true);
      requireChurchSessionMock.mockResolvedValue(baseSession);
      queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

      await voidJournalAction("journal-1");

      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("voided_at"),
        expect.arrayContaining(["journal-1", "church-1", "profile-actor-1"]),
      );
    });

    it("throws when role is not church-admin", async () => {
      requireChurchSessionMock.mockResolvedValue({
        ...baseSession,
        appContext: { ...baseSession.appContext, roleId: "member" },
      });

      await expect(voidJournalAction("journal-1")).rejects.toThrow("Unauthorized");
    });
  });
});
