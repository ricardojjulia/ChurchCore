"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Collapse,
  Code,
  Divider,
  Drawer,
  Group,
  Input,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { ChevronDown, ChevronRight } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { AuthSession } from "@/lib/auth";
import type { DemoFeedbackAction, DemoFeedbackRow } from "@/lib/control-plane-demo-feedback";

const CATEGORY_COLORS: Record<string, string> = {
  BUG: "red",
  ERROR: "orange",
  UNEXPECTED_RESULT: "yellow",
  IMPROVEMENT: "blue",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All" },
  { value: "BUG", label: "Bug" },
  { value: "ERROR", label: "Error" },
  { value: "UNEXPECTED_RESULT", label: "Unexpected" },
  { value: "IMPROVEMENT", label: "Improvement" },
];

const ACTION_OPTIONS: { value: DemoFeedbackAction; label: string }[] = [
  { value: "code_fixed", label: "Code Fixed" },
  { value: "update_applied", label: "Update Applied" },
  { value: "suggestion_not_implemented", label: "Suggestion: Not Implemented" },
  { value: "suggestion_implemented", label: "Suggestion: Implemented" },
  { value: "bug_fixed", label: "Bug Fixed" },
  { value: "error_fixed", label: "Error Fixed" },
  { value: "received_and_closed", label: "Received & Closed" },
];

const ACTION_COLORS: Record<DemoFeedbackAction, string> = {
  code_fixed: "teal",
  update_applied: "teal",
  suggestion_not_implemented: "gray",
  suggestion_implemented: "teal",
  bug_fixed: "green",
  error_fixed: "green",
  received_and_closed: "gray",
};

function formatTimestamp(ts: string) {
  try {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch {
    return ts;
  }
}

function truncate(str: string | null | undefined, n: number) {
  if (!str) return null;
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

async function patchFeedback(
  id: string,
  patch: { processed?: boolean; action?: DemoFeedbackAction | null }
) {
  const res = await fetch(`/api/control/demo-feedback/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
}

function DrawerField({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <Stack gap={2}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Stack>
  );
}

export function DemoFeedbackWorkspace({
  feedbackData,
  session,
}: {
  feedbackData: DemoFeedbackRow[];
  session: AuthSession;
}) {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [processedFilter, setProcessedFilter] = useState("open");
  const [drawerRow, setDrawerRow] = useState<DemoFeedbackRow | null>(null);
  const [rows, setRows] = useState<DemoFeedbackRow[]>(feedbackData);
  const [jsonOpen, setJsonOpen] = useState(false);

  const filteredData = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;

      if (processedFilter === "open" && row.processed) return false;
      if (processedFilter === "done" && !row.processed) return false;

      if (emailFilter) {
        const haystack = `${row.user_email ?? ""} ${row.user_role ?? ""}`.toLowerCase();
        if (!haystack.includes(emailFilter.toLowerCase())) return false;
      }

      if (dateFrom) {
        if (new Date(row.created_at).getTime() < new Date(dateFrom).getTime()) return false;
      }

      if (dateTo) {
        if (new Date(row.created_at).getTime() >= new Date(dateTo).getTime() + 86400000)
          return false;
      }

      return true;
    });

    // unprocessed first, then newest
    return [...filtered].sort((a, b) => {
      if (a.processed !== b.processed) return a.processed ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows, categoryFilter, emailFilter, dateFrom, dateTo, processedFilter]);

  function updateRow(id: string, patch: Partial<DemoFeedbackRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDrawerRow((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }

  async function handleProcessedToggle(row: DemoFeedbackRow, value: boolean) {
    updateRow(row.id, { processed: value });
    try {
      await patchFeedback(row.id, { processed: value });
    } catch {
      updateRow(row.id, { processed: row.processed });
    }
  }

  async function handleActionChange(id: string, value: DemoFeedbackAction | null) {
    const prev = rows.find((r) => r.id === id)?.action ?? null;
    updateRow(id, { action: value });
    try {
      await patchFeedback(id, { action: value });
    } catch {
      updateRow(id, { action: prev });
    }
  }

  const openCount = rows.filter((r) => !r.processed).length;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/control"
      calendarHref={null}
      sectionLabel="Control Plane"
      title="Demo Feedback"
      description={`${openCount} open item${openCount !== 1 ? "s" : ""} · ${rows.length} total`}
      sidebarTitle="Control"
      sidebarDescription="Internal"
      navItems={[]}
      topActions={null}
    >
      <Stack gap="md">
        {/* Filters */}
        <Group gap="sm" wrap="wrap" align="flex-end">
          <SegmentedControl
            size="xs"
            value={processedFilter}
            onChange={setProcessedFilter}
            data={[
              { value: "open", label: "Open" },
              { value: "done", label: "Done" },
              { value: "all", label: "All" },
            ]}
          />
          <Select
            size="xs"
            placeholder="All categories"
            data={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v ?? "")}
            clearable
            style={{ minWidth: 160 }}
          />
          <TextInput
            size="xs"
            placeholder="Filter by email or role"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.currentTarget.value)}
            style={{ minWidth: 200 }}
          />
          <Input.Wrapper label="From" id="date-from-wrapper" size="xs">
            <Input
              id="date-from"
              size="xs"
              component="input"
              type="date"
              aria-label="From"
              value={dateFrom}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDateFrom(e.currentTarget.value)
              }
            />
          </Input.Wrapper>
          <Input.Wrapper label="To" id="date-to-wrapper" size="xs">
            <Input
              id="date-to"
              size="xs"
              component="input"
              type="date"
              aria-label="To"
              value={dateTo}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDateTo(e.currentTarget.value)
              }
            />
          </Input.Wrapper>
        </Group>

        {filteredData.length === 0 ? (
          <Text ta="center" c="dimmed" py="xl">
            {processedFilter === "open" ? "All caught up — no open items." : "No results."}
          </Text>
        ) : (
          <Table striped highlightOnHover withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 80 }}>When</Table.Th>
                <Table.Th style={{ width: 180 }}>User</Table.Th>
                <Table.Th>Route</Table.Th>
                <Table.Th style={{ width: 110 }}>Category</Table.Th>
                <Table.Th>Note / Error</Table.Th>
                <Table.Th style={{ width: 40, textAlign: "center" }}>×</Table.Th>
                <Table.Th style={{ width: 70 }}>Action</Table.Th>
                <Table.Th style={{ width: 50 }}>Done</Table.Th>
                <Table.Th style={{ width: 32 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredData.map((row) => {
                const preview = truncate(row.note ?? row.error_message, 60);
                return (
                  <Table.Tr
                    key={row.id}
                    style={{ opacity: row.processed ? 0.55 : 1 }}
                  >
                    <Table.Td c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {formatTimestamp(row.created_at)}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        <Text size="xs" fw={600} truncate>{row.user_email ?? "—"}</Text>
                        <Text size="xs" c="dimmed">{row.user_role ?? "—"}</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" truncate style={{ maxWidth: 180 }}>
                        {row.route}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={CATEGORY_COLORS[row.category] ?? "gray"}
                        variant="light"
                        size="sm"
                      >
                        {row.category}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {preview ? (
                        <Text size="xs" c={row.note ? undefined : "orange"}>
                          {preview}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="center" c="dimmed">{row.hit_count}</Table.Td>
                    <Table.Td>
                      {row.action ? (
                        <Badge
                          color={ACTION_COLORS[row.action]}
                          variant="dot"
                          size="sm"
                          style={{ cursor: "pointer" }}
                          onClick={() => { setDrawerRow(row); setJsonOpen(false); }}
                        >
                          {ACTION_OPTIONS.find((o) => o.value === row.action)?.label ?? row.action}
                        </Badge>
                      ) : (
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ cursor: "pointer" }}
                          onClick={() => { setDrawerRow(row); setJsonOpen(false); }}
                        >
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        size="xs"
                        checked={row.processed}
                        onChange={(e) => handleProcessedToggle(row, e.currentTarget.checked)}
                        color="teal"
                        aria-label="Mark as processed"
                      />
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label="Expand row"
                        onClick={() => { setDrawerRow(row); setJsonOpen(false); }}
                      >
                        <ChevronRight size={14} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Drawer
        opened={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        title={
          drawerRow ? (
            <Group gap="xs">
              <Badge color={CATEGORY_COLORS[drawerRow.category] ?? "gray"} variant="light">
                {drawerRow.category}
              </Badge>
              <Text fw={600} size="sm">{drawerRow.route}</Text>
            </Group>
          ) : "Feedback Detail"
        }
        position="right"
        size="lg"
        transitionProps={{ duration: 0 }}
      >
        {drawerRow ? (
          <Stack gap="md">
            {/* Context fields */}
            <Paper p="sm" radius="sm" withBorder>
              <Stack gap="sm">
                <DrawerField label="Submitted" value={new Date(drawerRow.created_at).toLocaleString()} />
                <DrawerField label="User" value={`${drawerRow.user_email ?? "unknown"} · ${drawerRow.user_role ?? "—"}`} />
                <DrawerField
                  label="Session duration"
                  value={formatDuration(drawerRow.session_duration_seconds)}
                />
                <DrawerField label="Hit count" value={String(drawerRow.hit_count)} />
                {drawerRow.breadcrumbs?.length ? (
                  <Stack gap={2}>
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed">Breadcrumbs</Text>
                    {(drawerRow.breadcrumbs as string[]).map((b, i) => (
                      <Text key={i} size="xs" c="dimmed">{b}</Text>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </Paper>

            {(drawerRow.note || drawerRow.error_message) ? (
              <Paper p="sm" radius="sm" withBorder>
                <Stack gap="sm">
                  {drawerRow.note ? (
                    <Stack gap={2}>
                      <Text size="xs" fw={700} tt="uppercase" c="dimmed">Note</Text>
                      <Text size="sm">{drawerRow.note}</Text>
                    </Stack>
                  ) : null}
                  {drawerRow.error_message ? (
                    <Stack gap={2}>
                      <Text size="xs" fw={700} tt="uppercase" c="orange">Error message</Text>
                      <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12 }}>
                        {drawerRow.error_message}
                      </Code>
                    </Stack>
                  ) : null}
                </Stack>
              </Paper>
            ) : null}

            {/* Triage */}
            <Paper p="sm" radius="sm" withBorder>
              <Stack gap="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Triage</Text>
                <Select
                  label="Action taken"
                  placeholder="No action selected"
                  data={ACTION_OPTIONS}
                  value={drawerRow.action ?? ""}
                  onChange={(v) =>
                    handleActionChange(drawerRow.id, (v || null) as DemoFeedbackAction | null)
                  }
                  clearable
                  size="sm"
                />
                <Switch
                  label="Processed"
                  description="Mark as reviewed and resolved"
                  checked={drawerRow.processed}
                  onChange={(e) => handleProcessedToggle(drawerRow, e.currentTarget.checked)}
                  color="teal"
                  size="sm"
                />
              </Stack>
            </Paper>

            <Divider />

            {/* Raw JSON — collapsed by default */}
            <UnstyledButton
              onClick={() => setJsonOpen((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {jsonOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Text size="xs" c="dimmed">Raw JSON</Text>
            </UnstyledButton>
            <Collapse expanded={jsonOpen}>
              <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 11 }}>
                {JSON.stringify(drawerRow, null, 2)}
              </Code>
            </Collapse>
          </Stack>
        ) : null}
      </Drawer>
    </ApplicationShell>
  );
}
