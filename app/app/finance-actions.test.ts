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
  createBudgetAction,
  createJournalAction,
  deleteJournalDraftAction,
  importFinanceRowsAction,
  postJournalAction,
  updateAccountAction,
  upsertBudgetLinesAction,
  voidJournalAction,
} from "@/app/app/finance-actions";

describe("finance actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-1", profile: { id: "profile-1-login"},
    });
  });

  it("rejects non-admin users for chart of accounts changes", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      churchProfileId: "profile-1", profile: { id: "profile-1-login"},
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
      const importsUpdateEqMock = vi.fn();
      importsUpdateEqMock.mockReturnValue({ eq: importsUpdateEqMock, then: (resolve: (v: unknown) => void) => resolve({ error: null }) });
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
      expect(importsUpdateEqMock).toHaveBeenCalledWith("church_id", "church-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/import");
    });

    it("marks the import failed, not completed, and raises when the journal lines can't be written (Council Review 31)", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      const importUpdates: Array<Record<string, unknown>> = [];
      const updateChain = { eq: vi.fn(), then: (resolve: (v: unknown) => void) => resolve({ error: null }) };
      updateChain.eq.mockReturnValue(updateChain);
      const fromMock = vi.fn((table: string) => {
        if (table === "finance_imports") {
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: "import-1" }, error: null }) }) }),
            update: (values: Record<string, unknown>) => (importUpdates.push(values), updateChain),
          };
        }
        if (table === "finance_journals") {
          return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "journal-1" }, error: null }) }) }) };
        }
        if (table === "finance_journal_lines") {
          return { insert: async () => ({ error: { message: "insert or update on table violates foreign key constraint" } }) };
        }
        throw new Error(`unexpected table ${table}`);
      });
      createTenantServerClientMock.mockResolvedValue({ from: fromMock });

      await expect(
        importFinanceRowsAction({
          filename: "import.csv",
          format: "csv",
          rows: [validRow],
          defaultDebitAccountId: "acct-cash",
          defaultCreditAccountId: "acct-giving",
        }),
      ).rejects.toThrow("foreign key");

      expect(importUpdates).toEqual([
        { status: "failed", error_message: "insert or update on table violates foreign key constraint" },
      ]);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    // A Supabase client whose finance_imports updates return the given
    // results in order; journal lines insert with `linesError`.
    function importClient(updateResults: Array<{ error: { message: string } | null }>, linesError: { message: string } | null = null) {
      const importUpdates: Array<Record<string, unknown>> = [];
      const fromMock = vi.fn((table: string) => {
        if (table === "finance_imports") {
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: "import-1" }, error: null }) }) }),
            update: (values: Record<string, unknown>) => {
              importUpdates.push(values);
              const result = updateResults.shift() ?? { error: null };
              const chain = { eq: () => chain, then: (resolve: (v: unknown) => void) => resolve(result) };
              return chain;
            },
          };
        }
        if (table === "finance_journals") {
          return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "journal-1" }, error: null }) }) }) };
        }
        if (table === "finance_journal_lines") return { insert: async () => ({ error: linesError }) };
        throw new Error(`unexpected table ${table}`);
      });
      return { client: { from: fromMock }, importUpdates };
    }

    const importInput = () => ({
      filename: "import.csv",
      format: "csv" as const,
      rows: [validRow],
      defaultDebitAccountId: "acct-cash",
      defaultCreditAccountId: "acct-giving",
    });

    it("marks the import failed when the final 'completed' update fails (PR #168 review)", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      const { client, importUpdates } = importClient([{ error: { message: "connection reset" } }, { error: null }]);
      createTenantServerClientMock.mockResolvedValue(client);

      await expect(importFinanceRowsAction(importInput())).rejects.toThrow("connection reset");
      expect(importUpdates).toEqual([
        { status: "completed", imported_rows: 1, journal_id: "journal-1" },
        { status: "failed", error_message: "connection reset" },
      ]);
    });

    it("raises both errors when even recording the failure fails, so nothing sits at 'processing' silently", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      const { client } = importClient([{ error: { message: "database is read-only" } }], { message: "lines rejected" });
      createTenantServerClientMock.mockResolvedValue(client);

      await expect(importFinanceRowsAction(importInput())).rejects.toThrow(
        "lines rejected (and the import couldn't be marked failed: database is read-only)",
      );
    });

    it("resolves mapped debit/credit account codes before posting on the Supabase path", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);

      const importsSingleMock = vi.fn().mockResolvedValue({ data: { id: "import-1" } });
      const importsInsertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: importsSingleMock }) });
      const importsUpdateEq = vi.fn();
      importsUpdateEq.mockReturnValue({ eq: importsUpdateEq, then: (resolve: (v: unknown) => void) => resolve({ error: null }) });
      const importsUpdateMock = vi.fn().mockReturnValue({ eq: importsUpdateEq });

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

  describe("updateAccountAction", () => {
    it("raises a failed account update on the Supabase path and doesn't revalidate (Council Review 31)", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      const chain = { eq: vi.fn(), then: (resolve: (v: unknown) => void) => resolve({ error: { message: "duplicate account code" } }) };
      chain.eq.mockReturnValue(chain);
      createTenantServerClientMock.mockResolvedValue({ from: () => ({ update: () => chain }) });

      await expect(updateAccountAction("acct-1", { name: "Benevolence" })).rejects.toThrow("duplicate account code");
      expect(chain.eq).toHaveBeenCalledWith("church_id", "church-1");
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("voidJournalAction", () => {
    const baseSession = {
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      churchProfileId: "profile-actor-1", profile: { id: "profile-actor-1-login"},
      source: "supabase",
    };

    it("sets voided_at and voided_by on the Supabase path", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      requireChurchSessionMock.mockResolvedValue(baseSession);

      const rec = makeRecorder({ data: [{ id: "journal-1" }] });
      const updateMock = vi.fn((...args: unknown[]) => {
        rec.calls.push({ method: "update", args });
        return rec.builder;
      });
      rec.builder.update = updateMock;
      createTenantServerClientMock.mockResolvedValue(rec.client);

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

// ── T1a: budgets + draft deletion ────────────────────────────

type Call = { method: string; args: unknown[] };

/** Chainable, awaitable Supabase builder that records every call. */
type Result = { data?: unknown; error?: { message: string } | null };
function makeRecorder(result: Result, byTable: Record<string, Result> = {}) {
  const calls: Call[] = [];
  let res = { data: result.data ?? null, error: result.error ?? null };
  const builder: Record<string, unknown> = {};
  for (const method of ["insert", "select", "delete", "upsert", "update", "eq"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.single = async () => {
    calls.push({ method: "single", args: [] });
    return res;
  };
  builder.maybeSingle = async () => {
    calls.push({ method: "maybeSingle", args: [] });
    return res;
  };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(res).then(resolve, reject);
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    if (byTable[table]) {
      res = { data: byTable[table].data ?? null, error: byTable[table].error ?? null };
    }
    return builder;
  });
  return { client: { from }, calls, from, builder };
}

const adminSession = {
  appContext: { roleId: "church-admin", church: { id: "church-A" } },
  churchProfileId: "church-profile-9",
  profile: { id: "login-user-3" },
  userId: "login-user-3",
};
const deniedRoles = ["secretary", "pastor", "ministry-leader", "member"] as const;

function sessionFor(roleId: string) {
  return { ...adminSession, appContext: { ...adminSession.appContext, roleId } };
}

describe("T1a: createBudgetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(adminSession);
  });

  it("requires a church session via /app/church-admin", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [{ id: "b-1" }] });
    await createBudgetAction({ name: "FY", fiscalYear: 2027 });
    expect(requireChurchSessionMock).toHaveBeenCalledWith("/app/church-admin");
  });

  it.each(deniedRoles)("denies %s without touching the database", async (role) => {
    requireChurchSessionMock.mockResolvedValue(sessionFor(role));
    await expect(createBudgetAction({ name: "FY", fiscalYear: 2027 })).rejects.toThrow("Unauthorized");
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("propagates an auth failure from requireChurchSession", async () => {
    requireChurchSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(createBudgetAction({ name: "FY", fiscalYear: 2027 })).rejects.toThrow("NEXT_REDIRECT");
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });

  it("inserts with the session church and the church profile id (not the login id) on Supabase", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({ data: { id: "budget-77" } });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    const result = await createBudgetAction({ name: "FY27", fiscalYear: 2027, notes: "n" });

    expect(result).toEqual({ id: "budget-77" });
    expect(rec.from).toHaveBeenCalledWith("finance_budgets");
    expect(rec.calls.find((c) => c.method === "insert")?.args[0]).toEqual({
      church_id: "church-A",
      name: "FY27",
      fiscal_year: 2027,
      notes: "n",
      created_by: "church-profile-9",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/budgets");
  });

  it("trims the name, defaults notes to null and ignores a caller-supplied church id", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({ data: { id: "b" } });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await createBudgetAction({ name: "  FY  ", fiscalYear: 2027, church_id: "church-EVIL" } as never);

    const row = rec.calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(row.church_id).toBe("church-A");
    expect(row.name).toBe("FY");
    expect(row.notes).toBeNull();
  });

  it.each(["", "   "])("rejects a blank name %j before any write", async (name) => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    await expect(createBudgetAction({ name, fiscalYear: 2027 })).rejects.toThrow("A budget needs a name.");
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([1999, 2101, 2026.5, Number.NaN])("rejects invalid fiscal year %s before any write", async (fiscalYear) => {
    await expect(createBudgetAction({ name: "FY", fiscalYear })).rejects.toThrow("Enter a valid fiscal year.");
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("accepts the fiscal year boundaries 2000 and 2100", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [{ id: "b" }] });
    await createBudgetAction({ name: "FY", fiscalYear: 2000 });
    await createBudgetAction({ name: "FY", fiscalYear: 2100 });
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(2);
  });

  it("throws the database error message and does not revalidate on Supabase failure", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    createTenantServerClientMock.mockResolvedValue(
      makeRecorder({ error: { message: "duplicate key value" } }).client,
    );
    await expect(createBudgetAction({ name: "FY", fiscalYear: 2027 })).rejects.toThrow("duplicate key value");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("uses a parameterised insert scoped to the session church on the local fallback", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [{ id: "b-local" }] });

    const result = await createBudgetAction({ name: "FY27", fiscalYear: 2027 });

    expect(result).toEqual({ id: "b-local" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.finance_budgets"),
      ["church-A", "FY27", 2027, null, "church-profile-9"],
    );
  });
});

describe("T1a: upsertBudgetLinesAction", () => {
  const owned = { finance_budgets: { data: { id: "budget-1" } } };

  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(adminSession);
  });

  it.each(deniedRoles)("denies %s without touching the database", async (role) => {
    requireChurchSessionMock.mockResolvedValue(sessionFor(role));
    await expect(
      upsertBudgetLinesAction("budget-1", [{ accountId: "a", amountCents: 100 }]),
    ).rejects.toThrow("Unauthorized");
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("verifies the budget belongs to the session church, then upserts church-stamped rows (Supabase)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({}, owned);
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await upsertBudgetLinesAction("budget-1", [
      { accountId: "acct-1", amountCents: 5000, notes: "tithes" },
      { accountId: "acct-2", amountCents: 0 },
    ]);

    expect(rec.from).toHaveBeenNthCalledWith(1, "finance_budgets");
    expect(rec.from).toHaveBeenNthCalledWith(2, "finance_budget_lines");
    expect(rec.calls).toContainEqual({ method: "eq", args: ["id", "budget-1"] });
    expect(rec.calls).toContainEqual({ method: "eq", args: ["church_id", "church-A"] });
    expect(rec.calls.some((c) => c.method === "maybeSingle")).toBe(true);
    const upsert = rec.calls.find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toEqual([
      { budget_id: "budget-1", church_id: "church-A", account_id: "acct-1", amount_cents: 5000, notes: "tithes" },
      { budget_id: "budget-1", church_id: "church-A", account_id: "acct-2", amount_cents: 0, notes: null },
    ]);
    expect(upsert?.args[1]).toEqual({ onConflict: "budget_id,account_id" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/budgets/budget-1");
  });

  it("never lets a caller-supplied church id override the session church (Supabase)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({}, owned);
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await upsertBudgetLinesAction("budget-1", [
      { accountId: "acct-1", amountCents: 1, church_id: "church-EVIL" } as never,
    ]);

    const rows = rec.calls.find((c) => c.method === "upsert")?.args[0] as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.church_id === "church-A")).toBe(true);
  });

  it("throws Budget not found before any upsert when the budget is another church's (Supabase)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({}, { finance_budgets: { data: null } });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await expect(
      upsertBudgetLinesAction("budget-of-church-B", [{ accountId: "a", amountCents: 1 }]),
    ).rejects.toThrow("Budget not found.");

    expect(rec.calls).toContainEqual({ method: "eq", args: ["church_id", "church-A"] });
    expect(rec.calls.some((c) => c.method === "upsert")).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("surfaces a budget lookup error before any upsert (Supabase)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({}, { finance_budgets: { error: { message: "lookup failed" } } });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await expect(
      upsertBudgetLinesAction("budget-1", [{ accountId: "a", amountCents: 1 }]),
    ).rejects.toThrow("lookup failed");
    expect(rec.calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("surfaces a Supabase upsert error and does not revalidate", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({}, {
      ...owned,
      finance_budget_lines: { error: { message: "violates foreign key constraint" } },
    });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await expect(
      upsertBudgetLinesAction("budget-1", [{ accountId: "a", amountCents: 1 }]),
    ).rejects.toThrow("violates foreign key constraint");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("checks ownership then runs one parameterised upsert per line on the local fallback", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "budget-1" }] }).mockResolvedValue({ rows: [] });

    await upsertBudgetLinesAction("budget-1", [
      { accountId: "acct-1", amountCents: 100, notes: "x" },
      { accountId: "acct-2", amountCents: 200 },
    ]);

    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(3);
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      "select id from public.finance_budgets where id = $1 and church_id = $2",
      ["budget-1", "church-A"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("on conflict (budget_id, account_id)"),
      ["budget-1", "church-A", "acct-1", 100, "x"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(3, expect.any(String), [
      "budget-1",
      "church-A",
      "acct-2",
      200,
      null,
    ]);
  });

  it("throws Budget not found without inserting when the local ownership check finds nothing", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    await expect(
      upsertBudgetLinesAction("budget-of-church-B", [{ accountId: "a", amountCents: 1 }]),
    ).rejects.toThrow("Budget not found.");
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a line with no accountId before any DB call", async () => {
    await expect(
      upsertBudgetLinesAction("budget-1", [{ accountId: "", amountCents: 100 }]),
    ).rejects.toThrow("Each budget line needs an account.");
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });

  it.each([-500, 10.5, Number.NaN])("rejects amountCents %s before any DB call", async (amountCents) => {
    await expect(
      upsertBudgetLinesAction("budget-1", [{ accountId: "a", amountCents }]),
    ).rejects.toThrow("Budget amounts must be zero or more, in whole cents.");
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });
});

describe("T1a: deleteJournalDraftAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(adminSession);
  });

  it.each(deniedRoles)("denies %s without touching the database", async (role) => {
    requireChurchSessionMock.mockResolvedValue(sessionFor(role));
    await expect(deleteJournalDraftAction("journal-1")).rejects.toThrow("Unauthorized");
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deletes only draft journals of the session church, touching nothing else (Supabase)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({ data: [{ id: "journal-1" }] });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await deleteJournalDraftAction("journal-1");

    expect(rec.from).toHaveBeenCalledTimes(1);
    expect(rec.from).toHaveBeenCalledWith("finance_journals");
    expect(rec.calls.filter((c) => c.method !== "from")).toEqual([
      { method: "delete", args: [] },
      { method: "eq", args: ["id", "journal-1"] },
      { method: "eq", args: ["church_id", "church-A"] },
      { method: "eq", args: ["status", "draft"] },
      { method: "select", args: ["id"] },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals");
  });

  it("scopes the local delete to church and draft status, so posted/voided rows are untouched", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    await deleteJournalDraftAction("journal-posted");

    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryTenantLocalDbMock.mock.calls[0];
    expect(sql).toMatch(/delete from public\.finance_journals/);
    expect(sql).toMatch(/church_id = \$2/);
    expect(sql).toMatch(/status = 'draft'/);
    expect(params).toEqual(["journal-posted", "church-A"]);
  });

  it("uses the session church for a journal id of another church, and a zero-row delete throws", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    const rec = makeRecorder({ data: [] });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await expect(deleteJournalDraftAction("journal-of-church-B")).rejects.toThrow(
      "Journal not found, or it is no longer a draft.",
    );

    expect(rec.calls).toContainEqual({ method: "eq", args: ["church_id", "church-A"] });
    expect(rec.calls.some((c) => c.args.includes("church-B"))).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("throws when the delete matched no rows because the journal is already posted", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    createTenantServerClientMock.mockResolvedValue(makeRecorder({ data: null }).client);
    await expect(deleteJournalDraftAction("journal-posted")).rejects.toThrow(
      "Journal not found, or it is no longer a draft.",
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase delete error and does not revalidate", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    createTenantServerClientMock.mockResolvedValue(
      makeRecorder({ error: { message: "permission denied" } }).client,
    );
    await expect(deleteJournalDraftAction("journal-1")).rejects.toThrow("permission denied");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("T1a: post/void journal Supabase result handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    requireChurchSessionMock.mockResolvedValue(adminSession);
  });

  it("post: scopes to church and draft, selects ids, and revalidates on success", async () => {
    const rec = makeRecorder({ data: [{ id: "j-1" }] });
    createTenantServerClientMock.mockResolvedValue(rec.client);

    await postJournalAction("j-1");

    expect(rec.calls).toContainEqual({ method: "eq", args: ["church_id", "church-A"] });
    expect(rec.calls).toContainEqual({ method: "eq", args: ["status", "draft"] });
    expect(rec.calls).toContainEqual({ method: "select", args: ["id"] });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/finance/journals");
  });

  it("post: zero affected rows throws not-found and does not revalidate", async () => {
    createTenantServerClientMock.mockResolvedValue(makeRecorder({ data: [] }).client);
    await expect(postJournalAction("j-1")).rejects.toThrow("Journal not found, or it is no longer a draft.");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("post: surfaces a database error", async () => {
    createTenantServerClientMock.mockResolvedValue(makeRecorder({ error: { message: "rls denied" } }).client);
    await expect(postJournalAction("j-1")).rejects.toThrow("rls denied");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("void: zero affected rows throws not-found and does not revalidate", async () => {
    createTenantServerClientMock.mockResolvedValue(makeRecorder({ data: [] }).client);
    await expect(voidJournalAction("j-1")).rejects.toThrow("Journal not found.");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("void: surfaces a database error", async () => {
    createTenantServerClientMock.mockResolvedValue(makeRecorder({ error: { message: "rls denied" } }).client);
    await expect(voidJournalAction("j-1")).rejects.toThrow("rls denied");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
