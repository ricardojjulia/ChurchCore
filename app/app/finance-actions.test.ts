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
          rowIndex: 0,
          date: "2025-01-01",
          description: "Invalid",
          amountCents: 0,
          debitAccountCode: null,
          creditAccountCode: null,
          reference: null,
          error: "invalid",
        }],
        defaultDebitAccountId: "acct-1",
        defaultCreditAccountId: "acct-2",
      }),
    ).rejects.toThrow("No valid rows to import");
  });

  describe("importFinanceRowsAction batch commit", () => {
    const validRow = {
      rowIndex: 0,
      date: "2025-01-01",
      description: "Tithe",
      amountCents: 5000,
      debitAccountCode: null,
      creditAccountCode: null,
      reference: null,
      error: null,
    };

    it("posts a completed import journal in local fallback mode", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(true);
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "import-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "journal-1" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await importFinanceRowsAction({
        filename: "import.csv",
        format: "csv",
        rows: [validRow],
        defaultDebitAccountId: "acct-cash",
        defaultCreditAccountId: "acct-giving",
      });

      expect(result).toEqual({ journalId: "journal-1", importId: "import-1" });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(4);
      expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("insert into public.finance_journal_lines"),
        ["journal-1", "church-1", "acct-cash", 5000, "Tithe", 0, "acct-giving", 1],
      );
      expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining("set status = 'completed'"),
        ["import-1", "church-1", 1, "journal-1"],
      );
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/import");
    });

    it("resolves mapped debit/credit account codes before posting in local fallback mode", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(true);
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "import-1" }] }) // insert finance_imports
        .mockResolvedValueOnce({ rows: [{ id: "journal-1" }] }) // insert finance_journals
        .mockResolvedValueOnce({ rows: [{ id: "acct-1010" }] }) // resolve debit code
        .mockResolvedValueOnce({ rows: [{ id: "acct-4000" }] }) // resolve credit code
        .mockResolvedValueOnce({ rows: [] }) // insert finance_journal_lines
        .mockResolvedValueOnce({ rows: [] }); // update finance_imports

      await importFinanceRowsAction({
        filename: "import.csv",
        format: "csv",
        rows: [{ ...validRow, debitAccountCode: "1010", creditAccountCode: "4000" }],
        defaultDebitAccountId: "acct-default-debit",
        defaultCreditAccountId: "acct-default-credit",
      });

      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(6);
      expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
        5,
        expect.stringContaining("insert into public.finance_journal_lines"),
        ["journal-1", "church-1", "acct-1010", 5000, "Tithe", 0, "acct-4000", 1],
      );
    });

    it("posts a completed import journal on the Supabase path", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);

      const importsSingleMock = vi.fn().mockResolvedValue({ data: { id: "import-1" } });
      const importsInsertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: importsSingleMock }) });
      const importsUpdateEqMock = vi.fn().mockResolvedValue({});
      const importsUpdateMock = vi.fn().mockReturnValue({ eq: importsUpdateEqMock });

      const journalsSingleMock = vi.fn().mockResolvedValue({ data: { id: "journal-1" } });
      const journalsInsertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: journalsSingleMock }) });

      const linesInsertMock = vi.fn().mockResolvedValue({});

      const fromMock = vi.fn((table: string) => {
        if (table === "finance_imports") return { insert: importsInsertMock, update: importsUpdateMock };
        if (table === "finance_journals") return { insert: journalsInsertMock };
        if (table === "finance_journal_lines") return { insert: linesInsertMock };
        throw new Error(`unexpected table ${table}`);
      });
      createTenantServerClientMock.mockResolvedValue({ from: fromMock });

      const result = await importFinanceRowsAction({
        filename: "import.csv",
        format: "csv",
        rows: [validRow],
        defaultDebitAccountId: "acct-cash",
        defaultCreditAccountId: "acct-giving",
      });

      expect(result).toEqual({ journalId: "journal-1", importId: "import-1" });
      expect(linesInsertMock).toHaveBeenCalledWith([
        { journal_id: "journal-1", church_id: "church-1", account_id: "acct-cash",
          side: "debit", amount_cents: 5000, memo: "Tithe", sort_order: 0 },
        { journal_id: "journal-1", church_id: "church-1", account_id: "acct-giving",
          side: "credit", amount_cents: 5000, memo: "Tithe", sort_order: 1 },
      ]);
      expect(importsUpdateMock).toHaveBeenCalledWith({ status: "completed", imported_rows: 1, journal_id: "journal-1" });
      expect(importsUpdateEqMock).toHaveBeenCalledWith("id", "import-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/import");
    });

    it("resolves mapped debit/credit account codes before posting on the Supabase path", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);

      const importsSingleMock = vi.fn().mockResolvedValue({ data: { id: "import-1" } });
      const importsInsertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: importsSingleMock }) });
      const importsUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });

      const journalsSingleMock = vi.fn().mockResolvedValue({ data: { id: "journal-1" } });
      const journalsInsertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: journalsSingleMock }) });

      const linesInsertMock = vi.fn().mockResolvedValue({});

      // finance_accounts lookup chain: .select("id").eq("church_id", ..).eq("account_code", ..).limit(1).maybeSingle()
      const accountsMaybeSingleMock = vi.fn()
        .mockResolvedValueOnce({ data: { id: "acct-1010" } }) // debit code "1010"
        .mockResolvedValueOnce({ data: { id: "acct-4000" } }); // credit code "4000"
      const accountsLimitMock = vi.fn().mockReturnValue({ maybeSingle: accountsMaybeSingleMock });
      const accountsEqAccountCodeMock = vi.fn().mockReturnValue({ limit: accountsLimitMock });
      const accountsEqChurchIdMock = vi.fn().mockReturnValue({ eq: accountsEqAccountCodeMock });
      const accountsSelectMock = vi.fn().mockReturnValue({ eq: accountsEqChurchIdMock });

      const fromMock = vi.fn((table: string) => {
        if (table === "finance_imports") return { insert: importsInsertMock, update: importsUpdateMock };
        if (table === "finance_journals") return { insert: journalsInsertMock };
        if (table === "finance_journal_lines") return { insert: linesInsertMock };
        if (table === "finance_accounts") return { select: accountsSelectMock };
        throw new Error(`unexpected table ${table}`);
      });
      createTenantServerClientMock.mockResolvedValue({ from: fromMock });

      await importFinanceRowsAction({
        filename: "import.csv",
        format: "csv",
        rows: [{ ...validRow, debitAccountCode: "1010", creditAccountCode: "4000" }],
        defaultDebitAccountId: "acct-default-debit",
        defaultCreditAccountId: "acct-default-credit",
      });

      expect(accountsEqChurchIdMock).toHaveBeenCalledWith("church_id", "church-1");
      expect(accountsEqAccountCodeMock).toHaveBeenNthCalledWith(1, "account_code", "1010");
      expect(accountsEqAccountCodeMock).toHaveBeenNthCalledWith(2, "account_code", "4000");
      expect(linesInsertMock).toHaveBeenCalledWith([
        { journal_id: "journal-1", church_id: "church-1", account_id: "acct-1010",
          side: "debit", amount_cents: 5000, memo: "Tithe", sort_order: 0 },
        { journal_id: "journal-1", church_id: "church-1", account_id: "acct-4000",
          side: "credit", amount_cents: 5000, memo: "Tithe", sort_order: 1 },
      ]);
    });
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
