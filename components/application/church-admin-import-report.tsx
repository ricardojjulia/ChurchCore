"use client";

import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import { Alert, Anchor, Badge, Button, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import { formatInstantInTimeZone } from "@/lib/church-time";
import { GL_NOTE, IMPORT_PAGE_SIZE, importStatusLabel, importerHref } from "@/lib/import-report-csv";
import type {
  ChangedSinceImport,
  FieldDifference,
  ReasonedRow,
  ReconciliationMismatch,
  ReconciliationResult,
} from "@/lib/import-reconciliation";

// G4.2: the reconciliation report page body. Shows counts, outcomes and key
// values only; never names, emails or phones.

const IMPORT_TYPE_LABELS: Record<string, string> = {
  people_households_csv: "People and households",
  giving_csv: "Giving",
  attendance_csv: "Attendance",
  events_csv: "Events",
  groups_csv: "Groups",
  group_memberships_csv: "Group memberships (tags)",
};

const SOURCE_LABELS: Record<string, string> = {
  generic_csv: "Generic CSV",
  planning_center: "Planning Center",
  breeze: "Breeze",
};

const MISMATCH_KIND_LABELS: Record<ReconciliationMismatch["kind"], string> = {
  failed: "Failed",
  not_attempted: "Not attempted",
  value_mismatch: "Value differs",
};

const CHANGE_LABELS: Record<ChangedSinceImport["change"], string> = {
  edited: "Edited",
  deleted: "Deleted",
  merged: "Merged into another profile",
};

export type ReportPaging = {
  mp: number;
  cp: number;
  sp: number;
  mismatchTotal: number;
  changedTotal: number;
  skippedTotal: number;
};

const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${Math.floor(Math.abs(cents) / 100).toLocaleString("en-US")}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

function formatValue(field: "amount" | "date" | "fund", value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "none";
  return field === "amount" && typeof value === "number" ? usd(value) : String(value);
}

const FIELD_LABELS = { amount: "Amount", date: "Date", fund: "Fund" } as const;

function differenceText(differences: FieldDifference[]) {
  return differences.map((d) => `${FIELD_LABELS[d.field]}: file ${formatValue(d.field, d.source)}, stored ${formatValue(d.field, d.stored)}`);
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl">
        {value.toLocaleString("en-US")}
      </Text>
    </Paper>
  );
}

function PagingControls({
  batchId,
  paging,
  param,
  total,
}: {
  batchId: string;
  paging: ReportPaging;
  param: "mp" | "cp" | "sp";
  total: number;
}) {
  const page = paging[param];
  const pageCount = Math.max(1, Math.ceil(total / IMPORT_PAGE_SIZE));
  if (total <= IMPORT_PAGE_SIZE) return null;
  const href = (target: number) => {
    const next = { mp: paging.mp, cp: paging.cp, sp: paging.sp, [param]: target };
    const query = (["mp", "cp", "sp"] as const)
      .filter((key) => next[key] > 1)
      .map((key) => `${key}=${next[key]}`)
      .join("&");
    return `/app/church-admin/imports/${batchId}${query ? `?${query}` : ""}`;
  };
  const first = (page - 1) * IMPORT_PAGE_SIZE + 1;
  const last = Math.min(total, page * IMPORT_PAGE_SIZE);
  return (
    <Group justify="space-between" mt="xs" component="nav" aria-label="Pages">
      <Text size="xs" c="dimmed">
        Showing {first}-{last} of {total}
      </Text>
      <Group gap="xs">
        {page > 1 ? (
          <Button component={Link} href={href(page - 1)} size="xs" variant="default">
            Previous
          </Button>
        ) : null}
        {page < pageCount ? (
          <Button component={Link} href={href(page + 1)} size="xs" variant="default">
            Next
          </Button>
        ) : null}
      </Group>
    </Group>
  );
}

function ScrollTable({ label, caption, children }: { label: string; caption: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} style={{ overflowX: "auto" }}>
      <Table highlightOnHover>
        <Table.Caption>{caption}</Table.Caption>
        {children}
      </Table>
    </div>
  );
}

function MismatchTable({ rows }: { rows: ReconciliationMismatch[] }) {
  return (
    <ScrollTable label="Mismatches" caption="Rows the import did not save as the file says">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Row</Table.Th>
          <Table.Th>Source ID</Table.Th>
          <Table.Th>Kind</Table.Th>
          <Table.Th>Detail</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={`${row.rowNumber}-${row.kind}`}>
            <Table.Td>{row.rowNumber}</Table.Td>
            <Table.Td>{row.sourceId ?? "-"}</Table.Td>
            <Table.Td>
              <Badge color={row.kind === "value_mismatch" ? "orange" : "red"}>{MISMATCH_KIND_LABELS[row.kind]}</Badge>
            </Table.Td>
            <Table.Td>
              {row.kind === "value_mismatch"
                ? differenceText(row.differences).map((line) => <div key={line}>{line}</div>)
                : (row.reason ?? (row.kind === "not_attempted" ? "The import stopped before this row." : "-"))}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </ScrollTable>
  );
}

function ChangedTable({ rows }: { rows: ChangedSinceImport[] }) {
  return (
    <ScrollTable label="Changed since import" caption="Records changed after the import finished">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Row</Table.Th>
          <Table.Th>Source ID</Table.Th>
          <Table.Th>Change</Table.Th>
          <Table.Th>Detail</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={`${row.rowNumber}-${row.change}`}>
            <Table.Td>{row.rowNumber}</Table.Td>
            <Table.Td>{row.sourceId ?? "-"}</Table.Td>
            <Table.Td>{CHANGE_LABELS[row.change]}</Table.Td>
            <Table.Td>
              {row.differences.length > 0
                ? row.differences.map((d) => (
                    <div key={d.field}>
                      {FIELD_LABELS[d.field]}: at import {formatValue(d.field, d.atImport)}, now {formatValue(d.field, d.now)}
                    </div>
                  ))
                : "-"}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </ScrollTable>
  );
}

function SkippedTable({ rows }: { rows: ReasonedRow[] }) {
  return (
    <ScrollTable label="Skipped and rejected rows" caption="Rows the import left out on purpose">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Row</Table.Th>
          <Table.Th>Source ID</Table.Th>
          <Table.Th>Result</Table.Th>
          <Table.Th>Reason</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={`${row.rowNumber}-${row.classification}`}>
            <Table.Td>{row.rowNumber}</Table.Td>
            <Table.Td>{row.sourceId ?? "-"}</Table.Td>
            <Table.Td>
              <Badge color={row.classification === "reject" ? "red" : "gray"}>
                {row.classification === "reject" ? "Rejected" : "Skipped"}
              </Badge>
            </Table.Td>
            <Table.Td>{row.reason ?? "-"}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </ScrollTable>
  );
}

/**
 * `report` carries the lists for the current page only (the route slices them);
 * `paging` has the totals and current page numbers.
 */
export function ChurchAdminImportReport({
  session,
  report,
  paging,
  skippedRejected,
}: {
  session: ChurchAppSession;
  report: ReconciliationResult;
  paging: ReportPaging;
  skippedRejected: ReasonedRow[];
}) {
  const timeZone = session.appContext.church.timezone;
  const { batch } = report;
  const typeLabel = IMPORT_TYPE_LABELS[batch.importType] ?? batch.importType;
  const when = formatInstantInTimeZone(batch.committedAt ?? batch.createdAt, timeZone);
  const csvHref = `/api/church-admin/imports/${batch.id}/report`;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Church admin"
      title="Import reconciliation report"
      description={session.appContext.church.name}
      sidebarTitle="Imports"
      sidebarDescription="Compare an import file with what was saved."
      navLabel="Church admin"
      navItems={[
        {
          href: importerHref(batch.importType),
          label: `${typeLabel} import`,
          description: "Back to the importer",
          icon: ArrowLeft,
        },
        {
          href: "/app/church-admin",
          label: "Church admin",
          description: "Admin home",
          icon: ArrowLeft,
        },
        {
          href: `/app/church-admin/imports/${batch.id}`,
          label: "Import report",
          description: typeLabel,
          icon: Upload,
          active: true,
        },
      ]}
      topActions={
        <Button component={Link} href={importerHref(batch.importType)} variant="default" size="xs">
          Back to {typeLabel} import
        </Button>
      }
    >
      <Stack gap="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap={4}>
            <Title order={3} style={{ wordBreak: "break-all" }}>
              {batch.sourceFilename}
            </Title>
            <Text size="sm" c="dimmed">
              {typeLabel} from {SOURCE_LABELS[batch.sourceSystem] ?? batch.sourceSystem}.{" "}
              {batch.committedAt ? "Committed" : "Created"} {when}. Status: {importStatusLabel(batch.status)}.
            </Text>
          </Stack>
        </Paper>

        {report.state === "not_available" ? (
          <Alert color="blue" title="Report not available yet">
            This import has not been committed yet. Commit the batch from the import page, then come back here.
          </Alert>
        ) : null}

        {report.state === "legacy" ? (
          <Alert
            color="gray"
            title={
              report.recording === "incomplete"
                ? "Row-level outcomes were not fully recorded for this import"
                : "Row-level outcomes were not recorded for this import"
            }
          >
            {report.recording === "incomplete"
              ? "ChurchCore could not finish recording what happened to each row, so a row-by-row comparison is not possible."
              : "This import ran before ChurchCore recorded what happened to each row, so a row-by-row comparison is not possible."}
            {report.summary.created !== null || report.summary.updated !== null || report.summary.failed !== null
              ? ` The saved totals say: created ${report.summary.created ?? "unknown"}, updated ${report.summary.updated ?? "unknown"}, failed ${report.summary.failed ?? "unknown"}.`
              : ""}
          </Alert>
        ) : null}

        {report.state === "ready" ? (
          <>
            <Alert
              role="status"
              color={report.mismatchCount === 0 ? "green" : "red"}
              title={`${report.mismatchCount} ${report.mismatchCount === 1 ? "mismatch" : "mismatches"}`}
            >
              {report.mismatchCount === 0
                ? "Every row the import was expected to save matches your file."
                : "Some rows were not saved as your file says. They are listed below."}
            </Alert>

            <div>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                <Count label="Source rows" value={report.counts.sourceRows} />
                <Count label="Expected (create + update)" value={report.counts.expected} />
                <Count label="Written" value={report.counts.written} />
                <Count label="Failed" value={report.counts.failed} />
                <Count label="Not attempted" value={report.counts.notAttempted} />
                <Count label="Skipped" value={report.counts.skipped} />
                <Count label="Rejected" value={report.counts.rejected} />
              </SimpleGrid>
            </div>

            {report.giving ? (
              <Paper withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Title order={4}>Giving totals (USD)</Title>
                  <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
                    <div>
                      <Text size="xs" c="dimmed">
                        In your file
                      </Text>
                      <Text fw={700}>{usd(report.giving.sourceCents)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Written at commit
                      </Text>
                      <Text fw={700}>{usd(report.giving.writtenAtCommitCents)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Difference
                      </Text>
                      <Text fw={700}>{usd(report.giving.differenceCents)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Saved gifts now
                      </Text>
                      <Text fw={700}>{usd(report.giving.currentCents)}</Text>
                    </div>
                  </SimpleGrid>
                  <Text size="sm">{GL_NOTE}</Text>
                  <Text size="xs" c="dimmed">
                    The gift date is compared as well, including for gifts the import updated. An update never changes the stored date.
                  </Text>
                </Stack>
              </Paper>
            ) : null}

            <Paper withBorder radius="md" p="md">
              <Stack gap="xs">
                <Title order={4}>Mismatches</Title>
                {paging.mismatchTotal === 0 ? (
                  <Text size="sm" c="dimmed">
                    No mismatches.
                  </Text>
                ) : (
                  <>
                    <MismatchTable rows={report.mismatches} />
                    <PagingControls batchId={batch.id} paging={paging} param="mp" total={paging.mismatchTotal} />
                  </>
                )}
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="md" style={{ borderStyle: "dashed" }}>
              <Stack gap="xs">
                <Title order={4}>Changed since import</Title>
                <Text size="sm" c="dimmed">
                  Does not count against this import. These records were edited, deleted or merged after the import finished.
                </Text>
                {paging.changedTotal === 0 ? (
                  <Text size="sm" c="dimmed">
                    Nothing has changed since the import.
                  </Text>
                ) : (
                  <>
                    <ChangedTable rows={report.changedSinceImport} />
                    <PagingControls batchId={batch.id} paging={paging} param="cp" total={paging.changedTotal} />
                  </>
                )}
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="md">
              <Stack gap="xs">
                <Title order={4}>Skipped and rejected</Title>
                {paging.skippedTotal === 0 ? (
                  <Text size="sm" c="dimmed">
                    No rows were skipped or rejected.
                  </Text>
                ) : (
                  <>
                    <SkippedTable rows={skippedRejected} />
                    <PagingControls batchId={batch.id} paging={paging} param="sp" total={paging.skippedTotal} />
                  </>
                )}
              </Stack>
            </Paper>

            <Group>
              <Anchor href={csvHref} download aria-label="Download reconciliation report (CSV)">
                Download reconciliation report (CSV)
              </Anchor>
            </Group>
          </>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
