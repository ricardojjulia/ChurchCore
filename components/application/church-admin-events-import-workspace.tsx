"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Calendar, CheckCircle, Upload } from "lucide-react";
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

import { commitEventsImportBatchAction } from "@/app/app/church-admin/events/import/actions";
import { runEventsImportDryRunAction } from "@/app/app/church-admin/events/import/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  EventsImportCommitResult,
  EventsImportDryRunResult,
} from "@/lib/events-import-dry-run";
import type { EventsImportSourceSystem } from "@/lib/events-import-source-adapters";

export function ChurchAdminEventsImportWorkspace({
  session,
}: {
  session: ChurchAppSession;
}) {
  const [isPending, startTransition] = useTransition();
  const [sourceFilename, setSourceFilename] = useState("events.csv");
  const [sourceSystem, setSourceSystem] = useState<EventsImportSourceSystem>("generic_csv");
  const [csvText, setCsvText] = useState(
    "source_id,title,starts_at,ends_at,location,ministry_name,status\nEVT-1,Sunday Service,2026-07-06T09:00:00Z,2026-07-06T11:00:00Z,Main Sanctuary,Worship,draft\nEVT-2,Youth Night,2026-07-08T18:00:00Z,2026-07-08T20:00:00Z,Fellowship Hall,Youth,draft",
  );
  const [result, setResult] = useState<EventsImportDryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<EventsImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRunDryRun() {
    setError(null);

    startTransition(async () => {
      try {
        const nextResult = await runEventsImportDryRunAction({
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
        const nextCommitResult = await commitEventsImportBatchAction({
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
      title="Events import dry run"
      description={session.appContext.church.name}
      sidebarTitle="Events import"
      sidebarDescription="Dry-run events CSV imports without production writes."
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin/events",
          label: "Events",
          description: "Manage church events",
          icon: Calendar,
        },
        {
          href: "/app/church-admin/events/import",
          label: "Import",
          description: "Dry-run event migration",
          icon: Upload,
          active: true,
        },
      ]}
      topActions={
        <Button component={Link} href="/app/church-admin/events" variant="default" size="xs">
          Back to events
        </Button>
      }
    >
      <Stack gap="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Title order={4}>CSV Intake</Title>
            <Text size="sm" c="dimmed">
              Required columns: source_id, title, starts_at, ends_at. Optional: description,
              location, capacity, ministry_name, status.
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
                setSourceSystem((value ?? "generic_csv") as EventsImportSourceSystem)
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
                {counts.unmatchedMinistries > 0 ? (
                  <Badge color="orange">{counts.unmatchedMinistries} unmatched ministries</Badge>
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
                      <Table.Th>Title</Table.Th>
                      <Table.Th>Starts At</Table.Th>
                      <Table.Th>Ends At</Table.Th>
                      <Table.Th>Ministry</Table.Th>
                      <Table.Th>Ministry Matched</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Reason</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.slice(0, 50).map((row) => (
                      <Table.Tr
                        key={`${row.rowNumber}-${row.sourceId}-${row.ministryName ?? ""}`}
                      >
                        <Table.Td>{row.rowNumber}</Table.Td>
                        <Table.Td>{row.sourceId || "-"}</Table.Td>
                        <Table.Td>{row.title || "-"}</Table.Td>
                        <Table.Td>{row.startsAt ?? "-"}</Table.Td>
                        <Table.Td>{row.endsAt ?? "-"}</Table.Td>
                        <Table.Td>{row.ministryName ?? "-"}</Table.Td>
                        <Table.Td>
                          {row.action === "create" || row.action === "update" ? (
                            row.ministryResolved === true ? (
                              <CheckCircle size={16} color="var(--mantine-color-green-6)" />
                            ) : row.ministryResolved === false && row.ministryName != null ? (
                              <AlertTriangle size={16} color="var(--mantine-color-orange-6)" />
                            ) : null
                          ) : null}
                        </Table.Td>
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
