"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Divider,
  Drawer,
  Group,
  Input,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { ChevronDown } from "lucide-react";

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
  { value: "UNEXPECTED_RESULT", label: "Unexpected Result" },
  { value: "IMPROVEMENT", label: "Improvement Idea" },
];

const ACTION_OPTIONS: { value: DemoFeedbackAction; label: string }[] = [
  { value: "code_fixed", label: "Code Fixed" },
  { value: "update_applied", label: "Update Applied" },
  { value: "suggestion_not_implemented", label: "Suggestion Not Implemented" },
  { value: "suggestion_implemented", label: "Suggestion Implemented" },
  { value: "bug_fixed", label: "Bug Fixed" },
  { value: "error_fixed", label: "Error Fixed" },
  { value: "received_and_closed", label: "Received and Closed by Dev Team" },
];

function formatTimestamp(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
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
  const [drawerRow, setDrawerRow] = useState<DemoFeedbackRow | null>(null);
  const [rows, setRows] = useState<DemoFeedbackRow[]>(feedbackData);
  const [saving, setSaving] = useState(false);

  const filteredData = useMemo(() => {
    return rows.filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;

      if (emailFilter) {
        const email = (row.user_email ?? "").toLowerCase();
        if (!email.includes(emailFilter.toLowerCase())) return false;
      }

      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (new Date(row.created_at).getTime() < from) return false;
      }

      if (dateTo) {
        const to = new Date(dateTo).getTime() + 86400000;
        if (new Date(row.created_at).getTime() >= to) return false;
      }

      return true;
    });
  }, [rows, categoryFilter, emailFilter, dateFrom, dateTo]);

  function updateRow(id: string, patch: Partial<DemoFeedbackRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (drawerRow?.id === id) setDrawerRow((prev) => (prev ? { ...prev, ...patch } : prev));
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

  async function handleDrawerSave() {
    if (!drawerRow) return;
    setSaving(true);
    try {
      await patchFeedback(drawerRow.id, {
        processed: drawerRow.processed,
        action: drawerRow.action,
      });
      updateRow(drawerRow.id, { processed: drawerRow.processed, action: drawerRow.action });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/control"
      calendarHref={null}
      sectionLabel="Control Plane"
      title="Demo Feedback"
      description="Bugs, errors, and improvement signals from the hosted demo"
      sidebarTitle="Control"
      sidebarDescription="Internal"
      navItems={[]}
      topActions={null}
    >
      <Stack gap="md">
        <Group gap="sm" wrap="wrap">
          <Select
            placeholder="All categories"
            data={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v ?? "")}
            clearable
            style={{ minWidth: 180 }}
          />
          <TextInput
            placeholder="Filter by email"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.currentTarget.value)}
            style={{ minWidth: 200 }}
          />
          <Input.Wrapper label="From" id="date-from-wrapper">
            <Input
              id="date-from"
              component="input"
              type="date"
              aria-label="From"
              value={dateFrom}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDateFrom(e.currentTarget.value)
              }
            />
          </Input.Wrapper>
          <Input.Wrapper label="To" id="date-to-wrapper">
            <Input
              id="date-to"
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
          <Text ta="center" c="dimmed">
            No feedback submissions yet.
          </Text>
        ) : (
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Created</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Route</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th>Hits</Table.Th>
                <Table.Th>Processed</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredData.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>{formatTimestamp(row.created_at)}</Table.Td>
                  <Table.Td>{row.user_email ?? "—"}</Table.Td>
                  <Table.Td>{row.user_role ?? "—"}</Table.Td>
                  <Table.Td>{row.route}</Table.Td>
                  <Table.Td>
                    <Badge color={CATEGORY_COLORS[row.category] ?? "gray"} variant="light">
                      {row.category}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{row.hit_count}</Table.Td>
                  <Table.Td>
                    <Switch
                      size="sm"
                      checked={row.processed}
                      onChange={(e) => handleProcessedToggle(row, e.currentTarget.checked)}
                      color="teal"
                      aria-label="Mark as processed"
                    />
                  </Table.Td>
                  <Table.Td style={{ minWidth: 180 }}>
                    <Select
                      size="xs"
                      placeholder="No action"
                      data={ACTION_OPTIONS}
                      value={row.action ?? ""}
                      onChange={(v) =>
                        handleActionChange(row.id, (v || null) as DemoFeedbackAction | null)
                      }
                      clearable
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Expand row"
                      onClick={() => setDrawerRow(row)}
                    >
                      <ChevronDown size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Drawer
        opened={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        title="Feedback Detail"
        position="right"
        size="lg"
        transitionProps={{ duration: 0 }}
      >
        {drawerRow ? (
          <Stack gap="md">
            <Stack gap="sm">
              <Switch
                label="Processed"
                description="Mark this item as reviewed and acted upon"
                checked={drawerRow.processed}
                onChange={(e) =>
                  setDrawerRow((prev) =>
                    prev ? { ...prev, processed: e.currentTarget.checked } : prev
                  )
                }
                color="teal"
              />
              <Select
                label="Action taken"
                placeholder="No action selected"
                data={ACTION_OPTIONS}
                value={drawerRow.action ?? ""}
                onChange={(v) =>
                  setDrawerRow((prev) =>
                    prev ? { ...prev, action: (v || null) as DemoFeedbackAction | null } : prev
                  )
                }
                clearable
              />
              <Button
                size="sm"
                color="teal"
                loading={saving}
                onClick={handleDrawerSave}
              >
                Save triage
              </Button>
            </Stack>

            <Divider />

            <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {JSON.stringify(drawerRow, null, 2)}
            </Code>
          </Stack>
        ) : null}
      </Drawer>
    </ApplicationShell>
  );
}
