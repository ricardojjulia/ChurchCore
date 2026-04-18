"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  BarChart2,
  Link2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import type { FinanceAccount } from "@/lib/finance-types";
import type { FundMapping, GivingAnalyticsData } from "@/lib/donations-data";
import {
  upsertFundMappingAction,
  upsertGivingPageAction,
} from "@/app/app/giving-actions";
import type { ChurchAppSession } from "@/lib/auth";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortMonth(yearMonth: string): string {
  const [year, mon] = yearMonth.split("-");
  const d = new Date(Number(year), Number(mon) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ── Analytics panel ──────────────────────────────────────────

export function GivingAnalyticsPanel({
  analytics,
}: {
  analytics: GivingAnalyticsData;
}) {
  const { monthlyTrend, retentionRate, activeDonors, lapsedDonors, newDonorsThisMonth, avgGiftCents } = analytics;

  const maxCents = monthlyTrend.length > 0
    ? Math.max(...monthlyTrend.map((r) => r.totalCents), 1)
    : 1;

  const recent = monthlyTrend.slice(-2);
  const trendUp = recent.length === 2 && recent[1].totalCents >= recent[0].totalCents;

  return (
    <Stack gap="lg">
      {/* KPI row */}
      <Group grow align="stretch">
        <Paper withBorder p="md" radius="md">
          <Text fz="xs" c="dimmed">Active donors (90 days)</Text>
          <Group gap="xs" align="center">
            <Text fz="xl" fw={700}>{activeDonors}</Text>
            <Users size={16} color="var(--mantine-color-blue-6)" />
          </Group>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text fz="xs" c="dimmed">Retention rate (30-day)</Text>
          <Group gap="xs" align="center">
            <Text fz="xl" fw={700}>{retentionRate}%</Text>
            {retentionRate >= 60
              ? <TrendingUp size={16} color="var(--mantine-color-teal-6)" />
              : <TrendingDown size={16} color="var(--mantine-color-red-6)" />
            }
          </Group>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text fz="xs" c="dimmed">New donors this month</Text>
          <Text fz="xl" fw={700}>{newDonorsThisMonth}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text fz="xs" c="dimmed">Avg gift (12 mo.)</Text>
          <Text fz="xl" fw={700}>{formatCents(avgGiftCents)}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text fz="xs" c="dimmed">Lapsed donors</Text>
          <Group gap="xs" align="center">
            <Text fz="xl" fw={700}>{lapsedDonors}</Text>
            {lapsedDonors > 0 && <AlertTriangle size={16} color="var(--mantine-color-orange-6)" />}
          </Group>
        </Paper>
      </Group>

      {/* Trend chart */}
      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Title order={4} size="h5">Monthly giving trend (12 months)</Title>
          <Group gap="xs">
            {trendUp
              ? <Badge color="teal" leftSection={<TrendingUp size={12} />}>Trending up</Badge>
              : <Badge color="gray" leftSection={<TrendingDown size={12} />}>Trending down</Badge>
            }
          </Group>
        </Group>
        {monthlyTrend.length === 0 ? (
          <Text c="dimmed" size="sm">No giving data yet.</Text>
        ) : (
          <Stack gap="xs">
            {monthlyTrend.map((row) => (
              <Group key={row.month} gap="sm" align="center" wrap="nowrap">
                <Text fz="xs" c="dimmed" w={54} style={{ flexShrink: 0 }}>
                  {shortMonth(row.month)}
                </Text>
                <Progress
                  value={(row.totalCents / maxCents) * 100}
                  color="blue"
                  size="lg"
                  radius="xl"
                  style={{ flex: 1 }}
                />
                <Text fz="xs" fw={600} w={72} ta="right" style={{ flexShrink: 0 }}>
                  {formatCents(row.totalCents)}
                </Text>
                <Text fz="xs" c="dimmed" w={72} ta="right" style={{ flexShrink: 0 }}>
                  {row.donorCount} donors
                </Text>
                {row.newDonorCount > 0 && (
                  <Badge size="xs" color="teal" variant="light">+{row.newDonorCount} new</Badge>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}

// ── Fund mapping panel ───────────────────────────────────────

export function FundMappingPanel({
  mappings: initialMappings,
  accounts,
}: {
  session: ChurchAppSession;
  mappings: FundMapping[];
  accounts: FinanceAccount[];
}) {
  const [mappings, setMappings] = useState(initialMappings);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fundDesignation: "", assetAccountId: "", incomeAccountId: "" });

  const assetAccounts = accounts.filter((a) => a.accountType === "asset" && a.isActive);
  const incomeAccounts = accounts.filter((a) => a.accountType === "income" && a.isActive);

  function handleSave() {
    if (!form.fundDesignation.trim() || !form.assetAccountId || !form.incomeAccountId) {
      setMsg({ type: "error", text: "All three fields are required." });
      return;
    }
    startTransition(async () => {
      const res = await upsertFundMappingAction(form);
      if (res.ok) {
        setMsg({ type: "success", text: "Fund mapping saved." });
        setShowForm(false);
        setMappings((prev) => {
          const existing = prev.findIndex((m) => m.fundDesignation === form.fundDesignation);
          const next = { id: "", ...form, isActive: true };
          if (existing >= 0) {
            const copy = [...prev];
            copy[existing] = next;
            return copy;
          }
          return [...prev, next];
        });
        setForm({ fundDesignation: "", assetAccountId: "", incomeAccountId: "" });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to save." });
      }
    });
  }

  function accountName(id: string) {
    return accounts.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={4} size="h5">Fund → GL Account Mappings</Title>
          <Text size="sm" c="dimmed">Map each fund designation to asset and income GL accounts for auto-posting.</Text>
        </div>
        <Button size="xs" leftSection={<Link2 size={14} />} onClick={() => setShowForm(true)}>
          Add Mapping
        </Button>
      </Group>

      {msg && (
        <Alert color={msg.type === "success" ? "green" : "red"} withCloseButton onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      {showForm && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <TextInput
              label="Fund designation (exact match)"
              placeholder="e.g. General, Building Fund"
              value={form.fundDesignation}
              onChange={(e) => setForm((f) => ({ ...f, fundDesignation: e.target.value }))}
              required
            />
            <Select
              label="Asset account (debit on receipt)"
              placeholder="Select asset account"
              data={assetAccounts.map((a) => ({ value: a.id, label: `${a.accountCode} — ${a.name}` }))}
              value={form.assetAccountId}
              onChange={(v) => setForm((f) => ({ ...f, assetAccountId: v ?? "" }))}
              searchable
            />
            <Select
              label="Income account (credit on receipt)"
              placeholder="Select income account"
              data={incomeAccounts.map((a) => ({ value: a.id, label: `${a.accountCode} — ${a.name}` }))}
              value={form.incomeAccountId}
              onChange={(v) => setForm((f) => ({ ...f, incomeAccountId: v ?? "" }))}
              searchable
            />
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="xs" onClick={handleSave} loading={isPending}>Save</Button>
            </Group>
          </Stack>
        </Paper>
      )}

      {mappings.length === 0 ? (
        <Text c="dimmed" size="sm" ta="center" py="lg">No fund mappings configured yet.</Text>
      ) : (
        <Paper withBorder radius="md">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fund designation</Table.Th>
                <Table.Th>Asset account</Table.Th>
                <Table.Th>Income account</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {mappings.map((m) => (
                <Table.Tr key={m.id || m.fundDesignation}>
                  <Table.Td fw={500}>{m.fundDesignation}</Table.Td>
                  <Table.Td><Text size="sm">{accountName(m.assetAccountId)}</Text></Table.Td>
                  <Table.Td><Text size="sm">{accountName(m.incomeAccountId)}</Text></Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={m.isActive ? "green" : "gray"} variant="light">
                      {m.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

// ── Giving page config panel ─────────────────────────────────

export function GivingPageConfigPanel({
  session,
}: {
  session: ChurchAppSession;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    headline: "Support Our Church",
    description: "",
    funds: "General,Building Fund,Missions",
    isLive: false,
    allowAnonymous: true,
  });

  function handleSave() {
    startTransition(async () => {
      const res = await upsertGivingPageAction({
        headline: form.headline,
        description: form.description || undefined,
        funds: form.funds.split(",").map((f) => f.trim()).filter(Boolean),
        isLive: form.isLive,
        allowAnonymous: form.allowAnonymous,
      });
      if (res.ok) setMsg({ type: "success", text: "Giving page settings saved." });
      else setMsg({ type: "error", text: res.error ?? "Failed to save." });
    });
  }

  const slug = session.appContext.church.slug ?? session.appContext.church.id.slice(0, 8);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={4} size="h5">Public Giving Page</Title>
          <Text size="sm" c="dimmed">Configure your public-facing online giving page at <code>/give/{slug}</code>.</Text>
        </div>
      </Group>

      {msg && (
        <Alert color={msg.type === "success" ? "green" : "red"} withCloseButton onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <TextInput
            label="Page headline"
            value={form.headline}
            onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
          />
          <TextInput
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <TextInput
            label="Fund options (comma-separated)"
            value={form.funds}
            onChange={(e) => setForm((f) => ({ ...f, funds: e.target.value }))}
          />
          <Group gap="xl">
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.isLive}
                onChange={(e) => setForm((f) => ({ ...f, isLive: e.target.checked }))}
              />
              <Text size="sm">Page is live</Text>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.allowAnonymous}
                onChange={(e) => setForm((f) => ({ ...f, allowAnonymous: e.target.checked }))}
              />
              <Text size="sm">Allow anonymous gifts</Text>
            </label>
          </Group>
          <Group justify="flex-end">
            <Button size="xs" onClick={handleSave} loading={isPending}>Save Settings</Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

// ── BarChart2 re-export for convenience ──────────────────────
export { BarChart2 };
