"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
  createTenantServerClient,
} from "@/lib/supabase/tenant";
import type { ImportPreviewRow } from "@/lib/finance-types";

// ── Chart of Accounts ────────────────────────────────────────

export interface CreateAccountInput {
  parentId?: string | null;
  accountCode: string;
  name: string;
  description?: string | null;
  accountType: "asset" | "liability" | "equity" | "income" | "expense";
}

export async function createAccountAction(input: CreateAccountInput): Promise<{ id: string }> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.finance_accounts
         (church_id, parent_id, account_code, name, description, account_type)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [churchId, input.parentId ?? null, input.accountCode, input.name,
       input.description ?? null, input.accountType],
    );
    revalidatePath("/app/church-admin/finance/accounts");
    return { id: result.rows[0].id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("finance_accounts")
    .insert({
      church_id: churchId,
      parent_id: input.parentId ?? null,
      account_code: input.accountCode,
      name: input.name,
      description: input.description ?? null,
      account_type: input.accountType,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/app/church-admin/finance/accounts");
  return { id: (data as { id: string }).id };
}

export async function updateAccountAction(
  accountId: string,
  input: Partial<CreateAccountInput> & { isActive?: boolean },
): Promise<void> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.finance_accounts
       set parent_id    = coalesce($3, parent_id),
           account_code = coalesce($4, account_code),
           name         = coalesce($5, name),
           description  = coalesce($6, description),
           account_type = coalesce($7, account_type),
           is_active    = coalesce($8, is_active),
           updated_at   = now()
       where id = $1 and church_id = $2`,
      [accountId, churchId,
       input.parentId ?? null, input.accountCode ?? null,
       input.name ?? null, input.description ?? null,
       input.accountType ?? null, input.isActive ?? null],
    );
  } else {
    const supabase = await createTenantServerClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.parentId !== undefined) patch.parent_id = input.parentId;
    if (input.accountCode !== undefined) patch.account_code = input.accountCode;
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.accountType !== undefined) patch.account_type = input.accountType;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    await supabase.from("finance_accounts").update(patch).eq("id", accountId).eq("church_id", churchId);
  }

  revalidatePath("/app/church-admin/finance/accounts");
}

// ── Journal Entries ──────────────────────────────────────────

export interface JournalLineInput {
  accountId: string;
  side: "debit" | "credit";
  amountCents: number;
  memo?: string | null;
  sortOrder?: number;
}

export interface CreateJournalInput {
  journalDate: string; // YYYY-MM-DD
  description: string;
  journalType?: "general" | "bank_feed" | "accounts_payable" | "import";
  reference?: string | null;
  lines: JournalLineInput[];
}

function validateLines(lines: JournalLineInput[]): void {
  const totalDebits = lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amountCents, 0);
  const totalCredits = lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amountCents, 0);
  if (totalDebits !== totalCredits) {
    throw new Error(`Journal is unbalanced: debits ${totalDebits} ≠ credits ${totalCredits}`);
  }
  if (lines.length < 2) {
    throw new Error("A journal entry requires at least two lines");
  }
}

export async function createJournalAction(input: CreateJournalInput): Promise<{ id: string }> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  validateLines(input.lines);

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    const jResult = await queryTenantLocalDb<{ id: string }>(
      `insert into public.finance_journals
         (church_id, journal_date, description, journal_type, status, reference, created_by)
       values ($1, $2, $3, $4, 'draft', $5, $6)
       returning id`,
      [churchId, input.journalDate, input.description,
       input.journalType ?? "general", input.reference ?? null, profileId],
    );
    const journalId = jResult.rows[0].id;

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      await queryTenantLocalDb(
        `insert into public.finance_journal_lines
           (journal_id, church_id, account_id, side, amount_cents, memo, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [journalId, churchId, line.accountId, line.side, line.amountCents,
         line.memo ?? null, line.sortOrder ?? i],
      );
    }

    revalidatePath("/app/church-admin/finance/journals");
    return { id: journalId };
  }

  const supabase = await createTenantServerClient();
  const { data: jData, error: jError } = await supabase
    .from("finance_journals")
    .insert({
      church_id: churchId,
      journal_date: input.journalDate,
      description: input.description,
      journal_type: input.journalType ?? "general",
      status: "draft",
      reference: input.reference ?? null,
      created_by: profileId,
    })
    .select("id")
    .single();
  if (jError) throw new Error(jError.message);
  const journalId = (jData as { id: string }).id;

  const lineRows = input.lines.map((line, i) => ({
    journal_id: journalId,
    church_id: churchId,
    account_id: line.accountId,
    side: line.side,
    amount_cents: line.amountCents,
    memo: line.memo ?? null,
    sort_order: line.sortOrder ?? i,
  }));
  const { error: lError } = await supabase.from("finance_journal_lines").insert(lineRows);
  if (lError) throw new Error(lError.message);

  revalidatePath("/app/church-admin/finance/journals");
  return { id: journalId };
}

export async function postJournalAction(journalId: string): Promise<void> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.finance_journals
       set status = 'posted', posted_by = $3, posted_at = now(), updated_at = now()
       where id = $1 and church_id = $2 and status = 'draft'`,
      [journalId, churchId, profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("finance_journals")
      .update({ status: "posted", posted_by: profileId, posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", journalId)
      .eq("church_id", churchId)
      .eq("status", "draft");
  }

  revalidatePath("/app/church-admin/finance/journals");
  revalidatePath(`/app/church-admin/finance/journals/${journalId}`);
}

export async function voidJournalAction(journalId: string): Promise<void> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.finance_journals
       set status = 'voided', updated_at = now()
       where id = $1 and church_id = $2`,
      [journalId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("finance_journals")
      .update({ status: "voided", updated_at: new Date().toISOString() })
      .eq("id", journalId)
      .eq("church_id", churchId);
  }

  revalidatePath("/app/church-admin/finance/journals");
}

export async function deleteJournalDraftAction(journalId: string): Promise<void> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    // Lines cascade-delete via FK
    await queryTenantLocalDb(
      `delete from public.finance_journals where id = $1 and church_id = $2 and status = 'draft'`,
      [journalId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("finance_journals")
      .delete()
      .eq("id", journalId)
      .eq("church_id", churchId)
      .eq("status", "draft");
  }

  revalidatePath("/app/church-admin/finance/journals");
}

// ── Budgets ──────────────────────────────────────────────────

export interface CreateBudgetInput {
  name: string;
  fiscalYear: number;
  notes?: string | null;
}

export async function createBudgetAction(input: CreateBudgetInput): Promise<{ id: string }> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `insert into public.finance_budgets (church_id, name, fiscal_year, notes, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [churchId, input.name, input.fiscalYear, input.notes ?? null, profileId],
    );
    revalidatePath("/app/church-admin/finance/budgets");
    return { id: result.rows[0].id };
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("finance_budgets")
    .insert({ church_id: churchId, name: input.name, fiscal_year: input.fiscalYear,
               notes: input.notes ?? null, created_by: profileId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/app/church-admin/finance/budgets");
  return { id: (data as { id: string }).id };
}

export interface UpsertBudgetLineInput {
  accountId: string;
  amountCents: number;
  notes?: string | null;
}

export async function upsertBudgetLinesAction(
  budgetId: string,
  lines: UpsertBudgetLineInput[],
): Promise<void> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    for (const line of lines) {
      await queryTenantLocalDb(
        `insert into public.finance_budget_lines
           (budget_id, church_id, account_id, amount_cents, notes)
         values ($1, $2, $3, $4, $5)
         on conflict (budget_id, account_id)
         do update set amount_cents = excluded.amount_cents,
                       notes = excluded.notes,
                       updated_at = now()`,
        [budgetId, churchId, line.accountId, line.amountCents, line.notes ?? null],
      );
    }
  } else {
    const supabase = await createTenantServerClient();
    const rows = lines.map((l) => ({
      budget_id: budgetId,
      church_id: churchId,
      account_id: l.accountId,
      amount_cents: l.amountCents,
      notes: l.notes ?? null,
    }));
    await supabase.from("finance_budget_lines").upsert(rows, { onConflict: "budget_id,account_id" });
  }

  revalidatePath(`/app/church-admin/finance/budgets/${budgetId}`);
}

// ── Import ───────────────────────────────────────────────────

export interface ImportFinanceRowsInput {
  filename: string;
  format: "csv" | "xlsx" | "quickbooks_iif" | "ofx" | "txt";
  rows: ImportPreviewRow[];
  defaultDebitAccountId: string;
  defaultCreditAccountId: string;
  description?: string;
}

export async function importFinanceRowsAction(input: ImportFinanceRowsInput): Promise<{ journalId: string; importId: string }> {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") throw new Error("Unauthorized");

  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  const validRows = input.rows.filter((r) => !r.error && r.amountCents > 0);
  if (validRows.length === 0) throw new Error("No valid rows to import");

  const journalDate = validRows[0].date;
  const description = input.description ?? `Import: ${input.filename}`;

  if (shouldUseLocalTenantFallback()) {
    // Create import job record
    const importResult = await queryTenantLocalDb<{ id: string }>(
      `insert into public.finance_imports
         (church_id, filename, format, status, total_rows, imported_by)
       values ($1, $2, $3, 'processing', $4, $5) returning id`,
      [churchId, input.filename, input.format, validRows.length, profileId],
    );
    const importId = importResult.rows[0].id;

    // Create a single "import" journal
    const jResult = await queryTenantLocalDb<{ id: string }>(
      `insert into public.finance_journals
         (church_id, journal_date, description, journal_type, status, created_by)
       values ($1, $2, $3, 'import', 'draft', $4) returning id`,
      [churchId, journalDate, description, profileId],
    );
    const journalId = jResult.rows[0].id;

    let importedRows = 0;
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const debitAccountId = row.debitAccountCode
        ? (await resolveAccountByCode(churchId, row.debitAccountCode)) ?? input.defaultDebitAccountId
        : input.defaultDebitAccountId;
      const creditAccountId = row.creditAccountCode
        ? (await resolveAccountByCode(churchId, row.creditAccountCode)) ?? input.defaultCreditAccountId
        : input.defaultCreditAccountId;

      await queryTenantLocalDb(
        `insert into public.finance_journal_lines
           (journal_id, church_id, account_id, side, amount_cents, memo, sort_order)
         values ($1,$2,$3,'debit',$4,$5,$6),
                ($1,$2,$7,'credit',$4,$5,$8)`,
        [journalId, churchId, debitAccountId, row.amountCents, row.description,
         i * 2, creditAccountId, i * 2 + 1],
      );
      importedRows++;
    }

    await queryTenantLocalDb(
      `update public.finance_imports
       set status = 'completed', imported_rows = $3, journal_id = $4, updated_at = now()
       where id = $1 and church_id = $2`,
      [importId, churchId, importedRows, journalId],
    );

    revalidatePath("/app/church-admin/finance/journals");
    revalidatePath("/app/church-admin/finance/import");
    return { journalId, importId };
  }

  const supabase = await createTenantServerClient();

  const { data: impData } = await supabase
    .from("finance_imports")
    .insert({ church_id: churchId, filename: input.filename, format: input.format,
               status: "processing", total_rows: validRows.length, imported_by: profileId })
    .select("id").single();
  const importId = (impData as { id: string }).id;

  const { data: jData } = await supabase
    .from("finance_journals")
    .insert({ church_id: churchId, journal_date: journalDate, description, journal_type: "import",
               status: "draft", created_by: profileId })
    .select("id").single();
  const journalId = (jData as { id: string }).id;

  const lineRows: Record<string, unknown>[] = [];
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    lineRows.push(
      { journal_id: journalId, church_id: churchId, account_id: input.defaultDebitAccountId,
        side: "debit", amount_cents: row.amountCents, memo: row.description, sort_order: i * 2 },
      { journal_id: journalId, church_id: churchId, account_id: input.defaultCreditAccountId,
        side: "credit", amount_cents: row.amountCents, memo: row.description, sort_order: i * 2 + 1 },
    );
  }
  await supabase.from("finance_journal_lines").insert(lineRows);
  await supabase.from("finance_imports").update({ status: "completed", imported_rows: validRows.length, journal_id: journalId }).eq("id", importId);

  revalidatePath("/app/church-admin/finance/journals");
  revalidatePath("/app/church-admin/finance/import");
  return { journalId, importId };
}

async function resolveAccountByCode(churchId: string, code: string): Promise<string | null> {
  const result = await queryTenantLocalDb<{ id: string }>(
    `select id from public.finance_accounts where church_id = $1 and account_code = $2 limit 1`,
    [churchId, code],
  );
  return result.rows[0]?.id ?? null;
}
