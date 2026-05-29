"use client";

import { useState, useTransition } from "react";
import {
  Alert, Badge, Button, Divider, Group, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Textarea, Title
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { AlertCircle, CheckCircle, FileText, Plus, Trash2, XCircle } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
import { useI18n } from "@/components/i18n-provider";
import { createJournalAction, postJournalAction, voidJournalAction, deleteJournalDraftAction } from "@/app/app/finance-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceAccount, FinanceJournalWithLines } from "@/lib/finance-types";

function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}


type DraftLine = {
  id: string;
  accountId: string;
  side: "debit" | "credit";
  amountCents: number;
  memo: string;
};

function newLine(): DraftLine {
  return { id: crypto.randomUUID(), accountId: "", side: "debit", amountCents: 0, memo: "" };
}

export function FinanceJournalEditor({
  session,
  accounts,
  journal,
}: {
  session: ChurchAppSession;
  accounts: FinanceAccount[];
  journal: FinanceJournalWithLines | null;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const tr = (key: string, values?: Record<string, string | number>) =>
    t("financeJournal", key, values);
  const [isPending, startTransition] = useTransition();

  const isNew = !journal;
  const isReadOnly = journal && journal.status !== "draft";

  // Form state for new / draft journals
  const [date, setDate] = useState(journal?.journalDate ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(journal?.description ?? "");
  const [reference, setReference] = useState(journal?.reference ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    journal?.lines.map((l) => ({ id: l.id, accountId: l.accountId, side: l.side, amountCents: l.amountCents, memo: l.memo ?? "" })) ??
    [newLine(), newLine()]
  );

  const accountOptions = accounts.filter((a) => a.isActive).map((a) => ({ value: a.id, label: `${a.accountCode} — ${a.name}` }));

  const totalDebits = lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amountCents, 0);
  const totalCredits = lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amountCents, 0);
  const isBalanced = totalDebits === totalCredits && totalDebits > 0;

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function handleSave() {
    if (!description.trim()) {
      notifications.show({ color: "red", message: tr("descriptionRequired") });
      return;
    }
    if (!isBalanced) {
      notifications.show({ color: "red", message: tr("mustBeBalanced") });
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await createJournalAction({
          journalDate: date,
          description: description.trim(),
          reference: reference || null,
          journalType: "general",
          lines: lines.map((l, i) => ({ accountId: l.accountId, side: l.side, amountCents: l.amountCents, memo: l.memo || null, sortOrder: i })),
        });
        notifications.show({ color: "green", message: tr("journalSavedAsDraft") });
        router.push(`/app/church-admin/finance/journals/${id}`);
      } catch (err) {
        notifications.show({ color: "red", message: String(err) });
      }
    });
  }

  function handlePost() {
    if (!journal) return;
    startTransition(async () => {
      try {
        await postJournalAction(journal.id);
        notifications.show({ color: "green", message: tr("journalPosted") });
      } catch (err) {
        notifications.show({ color: "red", message: String(err) });
      }
    });
  }

  function handleVoid() {
    if (!journal) return;
    startTransition(async () => {
      try {
        await voidJournalAction(journal.id);
        notifications.show({ color: "yellow", message: tr("journalVoided") });
      } catch (err) {
        notifications.show({ color: "red", message: String(err) });
      }
    });
  }

  function handleDelete() {
    if (!journal) return;
    startTransition(async () => {
      try {
        await deleteJournalDraftAction(journal.id);
        notifications.show({ color: "gray", message: tr("draftDeleted") });
        router.push("/app/church-admin/finance/journals");
      } catch (err) {
        notifications.show({ color: "red", message: String(err) });
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel={tr("finance")}
      title={isNew ? tr("newJournalEntry") : journal.description}
      description={session.appContext.church.name}
      sidebarTitle={tr("finance")}
      sidebarDescription={tr("sidebarDescription")}
      navLabel={tr("finance")}
      navItems={financeNavItems("/app/church-admin/finance/journals")}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <FileText size={20} />
            <Title order={3}>{isNew ? tr("newJournalEntry") : tr("journalEntry")}</Title>
            {journal && (
              <Badge color={journal.status === "posted" ? "green" : journal.status === "voided" ? "gray" : "yellow"}>
                {journal.status === "posted"
                  ? tr("statusPosted")
                  : journal.status === "voided"
                    ? tr("statusVoided")
                    : tr("statusDraft")}
              </Badge>
            )}
          </Group>
          {!isNew && !isReadOnly && (
            <Group gap="xs">
              <Button color="red" variant="subtle" size="sm" leftSection={<Trash2 size={14} />} onClick={handleDelete} loading={isPending}>{tr("deleteDraft")}</Button>
              <Button color="orange" variant="subtle" size="sm" leftSection={<XCircle size={14} />} onClick={handleVoid} loading={isPending}>{tr("void")}</Button>
              <Button color="green" size="sm" leftSection={<CheckCircle size={14} />} onClick={handlePost} loading={isPending} disabled={!isBalanced}>{tr("post")}</Button>
            </Group>
          )}
        </Group>

        {isReadOnly && (
          <Alert icon={<AlertCircle size={16} />} color="gray">{tr("readOnlyAlert", { status: journal.status === "posted" ? tr("statusPosted") : tr("statusVoided") })}</Alert>
        )}

        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group grow>
              <TextInput label={tr("date")} type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} disabled={!!isReadOnly} required />
              <TextInput label={tr("referenceCheck")} value={reference} onChange={(e) => setReference(e.currentTarget.value)} disabled={!!isReadOnly} placeholder={tr("optional")} />
            </Group>
            <Textarea label={tr("description")} value={description} onChange={(e) => setDescription(e.currentTarget.value)} disabled={!!isReadOnly} required rows={2} />
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="md">
            <Text fw={600}>{tr("lines")}</Text>
            {!isReadOnly && (
              <Button size="xs" variant="light" leftSection={<Plus size={14} />} onClick={() => setLines((prev) => [...prev, newLine()])}>{tr("addLine")}</Button>
            )}
          </Group>

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: "40%" }}>{tr("account")}</Table.Th>
                <Table.Th style={{ width: "15%" }}>{tr("side")}</Table.Th>
                <Table.Th style={{ width: "20%" }}>{tr("amount")}</Table.Th>
                <Table.Th>{tr("memo")}</Table.Th>
                {!isReadOnly && <Table.Th style={{ width: 40 }} />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lines.map((line) => {
                const displayAccount = isReadOnly
                  ? journal?.lines.find((l) => l.accountId === line.accountId)
                  : null;
                return (
                  <Table.Tr key={line.id}>
                    <Table.Td>
                      {isReadOnly ? (
                        <Text size="sm">{displayAccount ? `${displayAccount.accountCode} — ${displayAccount.accountName}` : line.accountId}</Text>
                      ) : (
                        <Select data={accountOptions} value={line.accountId} onChange={(v) => updateLine(line.id, { accountId: v ?? "" })} searchable placeholder={tr("selectAccount")} size="xs" />
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isReadOnly ? (
                        <Badge color={line.side === "debit" ? "blue" : "green"} size="sm">{line.side === "debit" ? tr("debit") : tr("credit")}</Badge>
                      ) : (
                        <Select data={[{ value: "debit", label: tr("debit") }, { value: "credit", label: tr("credit") }]} value={line.side} onChange={(v) => updateLine(line.id, { side: (v ?? "debit") as "debit" | "credit" })} size="xs" />
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isReadOnly ? (
                        <Text size="sm">{formatCents(line.amountCents, locale)}</Text>
                      ) : (
                        <NumberInput
                          value={line.amountCents / 100}
                          onChange={(v) => updateLine(line.id, { amountCents: Math.round((Number(v) || 0) * 100) })}
                          prefix="$" decimalScale={2} min={0} size="xs"
                        />
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isReadOnly ? (
                        <Text size="sm" c="dimmed">{line.memo || tr("dash")}</Text>
                      ) : (
                        <TextInput value={line.memo} onChange={(e) => updateLine(line.id, { memo: e.currentTarget.value })} size="xs" placeholder={tr("optional")} />
                      )}
                    </Table.Td>
                    {!isReadOnly && (
                      <Table.Td>
                        <Button variant="subtle" color="red" size="xs" px={4} onClick={() => removeLine(line.id)}><Trash2 size={14} /></Button>
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          <Divider my="sm" />
          <Group justify="flex-end" gap="xl">
            <Text size="sm">{tr("debits")}: <strong>{formatCents(totalDebits, locale)}</strong></Text>
            <Text size="sm">{tr("credits")}: <strong>{formatCents(totalCredits, locale)}</strong></Text>
            <Badge color={isBalanced ? "green" : "red"} size="sm">{isBalanced ? tr("balanced") : tr("unbalanced")}</Badge>
          </Group>
        </Paper>

        {isNew && (
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => router.push("/app/church-admin/finance/journals")}>{tr("cancel")}</Button>
            <Button loading={isPending} onClick={handleSave} disabled={!isBalanced}>{tr("saveDraft")}</Button>
          </Group>
        )}
      </Stack>
    </ApplicationShell>
  );
}
