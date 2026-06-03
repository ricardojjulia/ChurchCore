"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle, ClipboardList, Upload } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";

import { commitAttendanceImportBatchAction } from "@/app/app/church-admin/attendance/import/actions";
import { runAttendanceImportDryRunAction } from "@/app/app/church-admin/attendance/import/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  AttendanceImportCommitResult,
  AttendanceImportDryRunResult,
} from "@/lib/attendance-import-dry-run";
import type { AttendanceImportSourceSystem } from "@/lib/attendance-import-source-adapters";

export function ChurchAdminAttendanceImportWorkspace({
  session,
}: {
  session: ChurchAppSession;
}) {
  const [isPending, startTransition] = useTransition();
  const [sourceFilename, setSourceFilename] = useState("attendance.csv");
  const [sourceSystem, setSourceSystem] = useState<AttendanceImportSourceSystem>("generic_csv");
  const [csvText, setCsvText] = useState(
    "source_id,profile_email,event_id,checked_in_at,status\nATT-1,jane@example.com,EVT-1,2026-07-06T10:00:00Z,present\nATT-2,john@example.com,EVT-1,2026-07-06T10:05:00Z,present",
  );
  const [result, setResult] = useState<AttendanceImportDryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<AttendanceImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRunDryRun() {
    setError(null);

    startTransition(async () => {
      try {
        const nextResult = await runAttendanceImportDryRunAction({
          sourceFilename,
          sourceSystem,
          csvText,
        });
        setResult(nextResult);
        setCommitResult(null);
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : "Unable to run dry import.");
      }
    });
  }

  function handleCommitBatch() {
    if (!result?.batchId) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const nextCommitResult = await commitAttendanceImportBatchAction({
          batchId: result.batchId,
        });
        setCommitResult(nextCommitResult);
      } catch (err) {
        setCommitResult(null);
        setError(err instanceof Error ? err.message : "Unable to commit import batch.");
      }
    });
  }

  const counts = result?.counts;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Church admin"
      title="Attendance import dry run"
      description={session.appContext.church.name}
      sidebarTitle="Attendance import"
      sidebarDescription="Dry-run attendance CSV imports without production writes."
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin/attendance",
          label: "Attendance",
          description: "Event attendance records",
          icon: ClipboardList,
        },
        {
          href: "/app/church-admin/attendance/import",
          label: "Import",
          description: "Dry-run attendance migration",
          icon: Upload,
          active: true,
        },
      ]}
      topActions={
        <Button component={Link} href="/app/church-admin/attendance" variant="default" size="xs">
          Back to attendance
        </Button>
      }
    >
      <Stack gap="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Title order={4}>CSV Intake</Title>
            <Text size="sm" c="dimmed">
              Required columns: source_id, profile_email, event_id. Optional: checked_in_at,
              status.
            </Text>
            <TextInput
              label="Source filename"
              value={sourceFilename}
              onChange={(event) => setSourceFilename(event.currentTarget.value)}
            />
            <Select
              label="Source system"
              value={sourceSystem}
              onChange={(value) =>
                setSourceSystem((value ?? "generic_csv") as AttendanceImportSourceSystem)
              }
              data={[
                { value: "generic_csv", label: "Generic CSV" },
                { value: "planning_center", label: "Planning Center export" },
                { value: "breeze", label: "Breeze export" },
              ]}
            />
            <Textarea
              label="CSV content"
              value={csvText}
              onChange={(event) => setCsvText(event.currentTarget.value)}
              minRows={10}
              autosize
            />
            <Group justify="flex-end">
              <Button onClick={handleRunDryRun} loading={isPending}>
                Run dry import
              </Button>
            </Group>
          </Stack>
        </Paper>

        {error ? (
          <Alert color="red" title="Dry run failed">
            {error}
          </Alert>
        ) : null}

        {result && counts ? (
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group gap="xs">
                <Badge color="teal">create {counts.create}</Badge>
                <Badge color="blue">update {counts.update}</Badge>
                <Badge color="gray">skip {counts.skip}</Badge>
                <Badge color="red">reject {counts.reject}</Badge>
                {counts.unmatchedProfiles > 0 ? (
                  <Badge color="orange">{counts.unmatchedProfiles} unmatched profiles</Badge>
                ) : null}
                {counts.unmatchedEvents > 0 ? (
                  <Badge color="orange">{counts.unmatchedEvents} unmatched events</Badge>
                ) : null}
              </Group>
              <Text size="sm" c="dimmed">
                Dry run batch {result.batchId} captured in import staging tables.
              </Text>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Commit will only apply rows marked create/update.
                </Text>
                <Button
                  size="xs"
                  color="teal"
                  variant="light"
                  onClick={handleCommitBatch}
                  loading={isPending}
                  disabled={!result || counts.create + counts.update === 0 || isPending}
                >
                  Commit batch
                </Button>
              </Group>
              {commitResult ? (
                <Alert
                  color={commitResult.status === "committed" ? "green" : "orange"}
                  title={
                    commitResult.status === "committed"
                      ? "Import committed"
                      : "Import committed with failures"
                  }
                >
                  Created {commitResult.created}, updated {commitResult.updated}, failed{" "}
                  {commitResult.failed}.
                </Alert>
              ) : null}
              <div style={{ overflowX: "auto" }}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>Source ID</Table.Th>
                      <Table.Th>Profile Email</Table.Th>
                      <Table.Th>Profile ✓/✗</Table.Th>
                      <Table.Th>Event</Table.Th>
                      <Table.Th>Event ✓/✗</Table.Th>
                      <Table.Th>Checked In At</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Reason</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.slice(0, 50).map((row) => (
                      <Table.Tr
                        key={`${row.rowNumber}-${row.sourceId}-${row.profileEmail ?? ""}`}
                      >
                        <Table.Td>{row.rowNumber}</Table.Td>
                        <Table.Td>{row.sourceId || "-"}</Table.Td>
                        <Table.Td>{row.profileEmail ?? "-"}</Table.Td>
                        <Table.Td>
                          {row.action === "create" || row.action === "update" ? (
                            row.profileResolved === true ? (
                              <CheckCircle size={16} color="var(--mantine-color-green-6)" />
                            ) : row.profileResolved === false && row.profileEmail != null ? (
                              <AlertTriangle size={16} color="var(--mantine-color-orange-6)" />
                            ) : null
                          ) : null}
                        </Table.Td>
                        <Table.Td>{row.eventSourceId ?? "-"}</Table.Td>
                        <Table.Td>
                          {row.action === "create" || row.action === "update" ? (
                            row.eventResolved === true ? (
                              <CheckCircle size={16} color="var(--mantine-color-green-6)" />
                            ) : row.eventResolved === false && row.eventSourceId != null ? (
                              <AlertTriangle size={16} color="var(--mantine-color-orange-6)" />
                            ) : null
                          ) : null}
                        </Table.Td>
                        <Table.Td>{row.checkedInAt ?? "-"}</Table.Td>
                        <Table.Td>-</Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              row.action === "create"
                                ? "teal"
                                : row.action === "update"
                                  ? "blue"
                                  : row.action === "skip"
                                    ? "gray"
                                    : "red"
                            }
                          >
                            {row.action}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{row.reason ?? "-"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
