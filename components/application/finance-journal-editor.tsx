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
import { createJournalAction, postJournalAction, voidJournalAction, deleteJournalDraftAction } from "@/app/app/finance-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceAccount, FinanceJournalWithLines } from "@/lib/finance-types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
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
    if (!description.trim()) { notifications.show({ color: "red", message: "Description is required" }); return; }
    if (!isBalanced) { notifications.show({ color: "red", message: "Journal must be balanced (debits = credits)" }); return; }
    startTransition(async () => {
      try {
        const { id } = await createJournalAction({
          journalDate: date,
          description: description.trim(),
          reference: reference || null,
          journalType: "general",
          lines: lines.map((l, i) => ({ accountId: l.accountId, side: l.side, amountCents: l.amountCents, memo: l.memo || null, sortOrder: i })),
        });
        notifications.show({ color: "green", message: "Journal saved as draft" });
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
        notifications.show({ color: "green", message: "Journal posted" });
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
        notifications.show({ color: "yellow", message: "Journal voided" });
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
        notifications.show({ color: "gray", message: "Draft deleted" });
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
      sectionLabel="Finance"
      title={isNew ? "New Journal Entry" : journal.description}
      description={session.appContext.church.name}
      sidebarTitle="Finance"
      sidebarDescription="Create and post double-entry journal entries."
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/journals")}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <FileText size={20} />
            <Title order={3}>{isNew ? "New Journal Entry" : "Journal Entry"}</Title>
            {journal && <Badge color={journal.status === "posted" ? "green" : journal.status === "voided" ? "gray" : "yellow"}>{journal.status}</Badge>}
          </Group>
          {!isNew && !isReadOnly && (
            <Group gap="xs">
              <Button color="red" variant="subtle" size="sm" leftSection={<Trash2 size={14} />} onClick={handleDelete} loading={isPending}>Delete Draft</Button>
              <Button color="orange" variant="subtle" size="sm" leftSection={<XCircle size={14} />} onClick={handleVoid} loading={isPending}>Void</Button>
              <Button color="green" size="sm" leftSection={<CheckCircle size={14} />} onClick={handlePost} loading={isPending} disabled={!isBalanced}>Post</Button>
            </Group>
          )}
        </Group>

        {isReadOnly && (
          <Alert icon={<AlertCircle size={16} />} color="gray">This journal has been {journal.status} and cannot be edited.</Alert>
        )}

        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group grow>
              <TextInput label="Date" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} disabled={!!isReadOnly} required />
              <TextInput label="Reference / Check #" value={reference} onChange={(e) => setReference(e.currentTarget.value)} disabled={!!isReadOnly} placeholder="Optional" />
            </Group>
            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} disabled={!!isReadOnly} required rows={2} />
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="md">
            <Text fw={600}>Lines</Text>
            {!isReadOnly && (
              <Button size="xs" variant="light" leftSection={<Plus size={14} />} onClick={() => setLines((prev) => [...prev, newLine()])}>Add Line</Button>
            )}
          </Group>

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: "40%" }}>Account</Table.Th>
                <Table.Th style={{ width: "15%" }}>Side</Table.Th>
                <Table.Th style={{ width: "20%" }}>Amount</Table.Th>
                <Table.Th>Memo</Table.Th>
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
                        <Select data={accountOptions} value={line.accountId} onChange={(v) => updateLine(line.id, { accountId: v ?? "" })} searchable placeholder="Select account" size="xs" />
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isReadOnly ? (
                        <Badge color={line.side === "debit" ? "blue" : "green"} size="sm">{line.side}</Badge>
                      ) : (
                        <Select data={[{ value: "debit", label: "Debit" }, { value: "credit", label: "Credit" }]} value={line.side} onChange={(v) => updateLine(line.id, { side: (v ?? "debit") as "debit" | "credit" })} size="xs" />
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isReadOnly ? (
                        <Text size="sm">{formatCents(line.amountCents)}</Text>
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
                        <Text size="sm" c="dimmed">{line.memo || "—"}</Text>
                      ) : (
                        <TextInput value={line.memo} onChange={(e) => updateLine(line.id, { memo: e.currentTarget.value })} size="xs" placeholder="Optional" />
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
            <Text size="sm">Debits: <strong>{formatCents(totalDebits)}</strong></Text>
            <Text size="sm">Credits: <strong>{formatCents(totalCredits)}</strong></Text>
            <Badge color={isBalanced ? "green" : "red"} size="sm">{isBalanced ? "Balanced" : "Unbalanced"}</Badge>
          </Group>
        </Paper>

        {isNew && (
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => router.push("/app/church-admin/finance/journals")}>Cancel</Button>
            <Button loading={isPending} onClick={handleSave} disabled={!isBalanced}>Save Draft</Button>
          </Group>
        )}
      </Stack>
    </ApplicationShell>
  );
}
