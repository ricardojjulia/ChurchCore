"use client";

import { useState, useTransition } from "react";
import {
  Badge, Button, Group, Modal, Paper, Select, Stack, Table, Text, TextInput, Textarea, Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Landmark, Plus } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
import { createAccountAction } from "@/app/app/finance-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceAccount } from "@/lib/finance-types";

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: "blue",
  liability: "orange",
  equity: "violet",
  income: "green",
  expense: "red",
};

const ACCOUNT_TYPE_OPTIONS = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

const TYPE_ORDER = ["asset", "liability", "equity", "income", "expense"];

export function FinanceAccountsWorkspace({
  session,
  accounts,
  selectedAccountId,
}: {
  session: ChurchAppSession;
  accounts: FinanceAccount[];
  selectedAccountId?: string | null;
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accountType, setAccountType] = useState<string>("expense");
  const [parentId, setParentId] = useState<string | null>(null);

  const grouped = TYPE_ORDER.reduce<Record<string, FinanceAccount[]>>((acc, type) => {
    acc[type] = accounts.filter((a) => a.accountType === type).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return acc;
  }, {});

  const parentOptions = accounts
    .filter((a) => a.accountType === accountType)
    .map((a) => ({ value: a.id, label: `${a.accountCode} — ${a.name}` }));

  function handleCreate() {
    if (!code.trim() || !name.trim()) {
      notifications.show({ color: "red", message: "Account code and name are required" });
      return;
    }
    startTransition(async () => {
      try {
        await createAccountAction({ accountCode: code.trim(), name: name.trim(), description: description || null, accountType: accountType as FinanceAccount["accountType"], parentId });
        notifications.show({ color: "green", message: "Account created" });
        setCode(""); setName(""); setDescription(""); setParentId(null);
        close();
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
      title="Chart of Accounts"
      description={session.appContext.church.name}
      sidebarTitle="Finance"
      sidebarDescription="Manage your church chart of accounts."
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/accounts")}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Landmark size={20} />
            <Title order={3}>Chart of Accounts</Title>
          </Group>
          <Button leftSection={<Plus size={16} />} onClick={open} size="sm">Add Account</Button>
        </Group>

        {accounts.length === 0 && (
          <Paper withBorder p="xl" radius="md" ta="center">
            <Text c="dimmed">No accounts yet. Add your first account to get started.</Text>
          </Paper>
        )}

        {TYPE_ORDER.filter((t) => grouped[t].length > 0).map((type) => (
          <Paper key={type} withBorder p="md" radius="md">
            <Group gap="xs" mb="sm">
              <Badge color={ACCOUNT_TYPE_COLORS[type]} size="sm" tt="capitalize">{type}</Badge>
              <Text size="sm" c="dimmed">({grouped[type].length})</Text>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Code</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {grouped[type].map((acct) => (
                  <Table.Tr key={acct.id} style={selectedAccountId === acct.id ? { background: "var(--mantine-color-blue-0)" } : undefined}>
                    <Table.Td><Text size="sm" ff="monospace">{acct.accountCode}</Text></Table.Td>
                    <Table.Td>{acct.name}</Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{acct.description ?? "—"}</Text></Table.Td>
                    <Table.Td>
                      <Badge color={acct.isActive ? "green" : "gray"} size="xs">{acct.isActive ? "Active" : "Inactive"}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        ))}
      </Stack>

      <Modal opened={opened} onClose={close} title="Add Account" size="md">
        <Stack gap="sm">
          <TextInput label="Account Code" placeholder="e.g. 5100" value={code} onChange={(e) => setCode(e.currentTarget.value)} required />
          <TextInput label="Name" placeholder="e.g. Salaries & Wages" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
          <Select label="Type" data={ACCOUNT_TYPE_OPTIONS} value={accountType} onChange={(v) => { setAccountType(v ?? "expense"); setParentId(null); }} />
          {parentOptions.length > 0 && (
            <Select label="Parent Account (optional)" data={parentOptions} value={parentId} onChange={setParentId} clearable />
          )}
          <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.currentTarget.value)} rows={2} />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={close}>Cancel</Button>
            <Button loading={isPending} onClick={handleCreate}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </ApplicationShell>
  );
}
