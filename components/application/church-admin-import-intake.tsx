"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, FileInput, Group, Stack, Text } from "@mantine/core";

import { formatInstantInTimeZone } from "@/lib/church-time";
import type { RecentImportBatch } from "@/lib/import-reconciliation";
import {
  detectImportSourceSystem,
  parseCsvHeaders,
  type DetectedImportSource,
} from "@/lib/import-source-detect";

export { parseCsvHeaders };

const SOURCE_LABELS: Record<DetectedImportSource, string> = {
  planning_center: "Planning Center",
  breeze: "Breeze",
};

/**
 * When the pasted/uploaded headers belong to a known vendor that differs from
 * the current choice, returns the source to switch to and a notice; else null.
 */
export function detectSourceSwitch(
  csvText: string,
  currentSource: string,
): { source: DetectedImportSource; notice: string } | null {
  const detected = detectImportSourceSystem(parseCsvHeaders(csvText));
  if (!detected || detected === currentSource) return null;
  const label = SOURCE_LABELS[detected];
  return { source: detected, notice: `Detected a ${label} file; source set to ${label}.` };
}

export type ImportKind = "people" | "events" | "giving" | "attendance" | "groups";

const GENERIC_COLUMNS: Record<ImportKind, string> = {
  people: "Required columns: household_name, full_name. Optional: email, phone, member_number.",
  events:
    "Required columns: source_id, title, starts_at, ends_at. Optional: description, location, capacity, ministry_name, status.",
  giving: "Required columns: source_id, amount. Optional: donor_email, fund, donated_at, note, recurring.",
  attendance:
    "Required columns: source_id, profile_email, event_id. Optional: checked_in_at, status.",
  groups: "Required columns: source_id, name. Optional: category, leader_email, status.",
};

const VENDOR_COLUMNS: Record<ImportKind, Record<DetectedImportSource, string>> = {
  people: {
    planning_center:
      "Planning Center People export. Required columns: Person ID, First Name, Last Name (Given Name is used when First Name is blank). Optional: Home Email, Mobile Phone Number, Household Name, Status, Membership.",
    breeze:
      "Breeze People export. Required columns: Breeze ID, First Name, Last Name. Optional: Email, Mobile, Home, Work, Family Name.",
  },
  events: {
    planning_center:
      "Planning Center events export. Required columns: Name, Starts At, Ends At. Optional: Event ID, Location, Description, Group Type, Status.",
    breeze:
      "Breeze events export. Required columns: Name, Start Date, End Date. Optional: Event ID, Location, Description, Category.",
  },
  giving: {
    planning_center:
      "Planning Center giving export. Required columns: Donation amount, Received date. Optional: Remote ID, Donor email, Fund, Memo, Check number.",
    breeze:
      "Breeze giving export. Required columns: Amount, Date. Optional: Breeze ID, Processor ID, Email, Fund, Note, Batch Number, Check Number.",
  },
  attendance: {
    planning_center:
      "Planning Center attendance export. Required columns: Email, Event ID, Checked in at. Optional: Status.",
    breeze:
      "Breeze attendance export. Required columns: Breeze ID, Event Name, Date. Optional: Email, Status.",
  },
  groups: {
    planning_center:
      "Planning Center groups export. Required columns: Name. Optional: ID, Group Type, Contact Email, Status.",
    breeze:
      "Breeze groups export. Required columns: Name. Optional: ID, Type, Email, Status. A Breeze Tags file (Breeze ID, Tag Name) is imported as group memberships instead: missing tags become groups and people are matched by Breeze ID.",
  },
};

/** Per-source "required columns" copy for an import page. */
export function requiredColumnsCopy(kind: ImportKind, sourceSystem: string): string {
  if (sourceSystem === "planning_center" || sourceSystem === "breeze") {
    return VENDOR_COLUMNS[kind][sourceSystem];
  }
  return GENERIC_COLUMNS[kind];
}

/** Polite status line shown when the source was switched automatically. */
export function SourceDetectedNotice({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <Text size="sm" role="status">
      {notice}
    </Text>
  );
}

/** Failure reasons from a commit (at most 10, already sanitised server-side). */
export function CommitFailureReasons({ reasons }: { reasons: string[] | undefined }) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <Stack gap={2} mt="xs">
      <Text size="sm" fw={600}>
        Why rows failed
      </Text>
      {reasons.map((reason) => (
        <Text key={reason} size="sm">
          {reason}
        </Text>
      ))}
    </Stack>
  );
}

export function importReportHref(batchId: string) {
  return `/app/church-admin/imports/${batchId}`;
}

/** Shown after a commit: opens the row-by-row reconciliation report for the batch. */
export function ViewReportLink({ batchId }: { batchId: string }) {
  return (
    <Text size="sm" mt="xs">
      <Link href={importReportHref(batchId)}>View reconciliation report</Link>
    </Text>
  );
}

/** Compact list of the church's latest imports of this type, each opening its report. */
export function RecentImports({
  imports,
  timeZone,
}: {
  imports: RecentImportBatch[] | undefined;
  timeZone: string | null;
}) {
  return (
    <Stack gap="xs" component="section" aria-labelledby="recent-imports-heading">
      <Text id="recent-imports-heading" fw={600} size="sm">
        Recent imports
      </Text>
      {!imports || imports.length === 0 ? (
        <Text size="sm" c="dimmed">
          No imports yet.
        </Text>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {imports.map((batch) => (
            <li key={batch.id} style={{ padding: "6px 0" }}>
              <Group gap="xs" wrap="wrap">
                <Text size="sm">{formatInstantInTimeZone(batch.createdAt, timeZone)}</Text>
                <Text size="sm" fw={500} style={{ wordBreak: "break-all" }}>
                  {batch.sourceFilename}
                </Text>
                <Badge variant="light" color={batch.status === "committed" ? "green" : "gray"}>
                  {batch.status}
                </Badge>
                <Text size="sm" c="dimmed">
                  {batch.mismatchCount === null
                    ? "mismatches not recorded"
                    : `${batch.mismatchCount} ${batch.mismatchCount === 1 ? "mismatch" : "mismatches"}`}
                </Text>
                <Link href={importReportHref(batch.id)} aria-label={`Open report for ${batch.sourceFilename}`}>
                  View report
                </Link>
              </Group>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}

export const IMPORT_MAX_BYTES = 3.5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

export const IMPORT_FILE_HINT =
  "Supported files: Planning Center CSV exports and Breeze CSV exports (for Breeze, export to Excel, then save as CSV). Up to 5,000 records and 3.5 MB per file.";

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsText(file);
  });
}

/** Reads a chosen CSV file as text into the caller's CSV state. Never echoes file contents. */
export function ImportCsvFileInput({
  onText,
  onFilename,
  onClear,
}: {
  onText: (text: string) => void;
  onClear?: () => void;
  onFilename?: (name: string) => void;
}) {
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleChange(file: File | null) {
    setFileError(null);
    if (!file) {
      onClear?.();
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setFileError("This file is larger than 3.5 MB. Split it into smaller files and upload each one.");
      return;
    }
    try {
      const text = await readFileText(file);
      onText(text);
      onFilename?.(file.name);
    } catch {
      setFileError("Unable to read this file. Try saving it as CSV again.");
    }
  }

  return (
    <FileInput
      label="Upload a CSV file"
      description="Or paste CSV content below. The file is loaded into the box below for review before the dry run."
      placeholder="Choose a .csv file"
      accept=".csv,text/csv"
      clearable
      clearButtonProps={{ "aria-label": "Clear selected file" }}
      onChange={(file) => void handleChange(file)}
      error={fileError}
    />
  );
}

/** Header names the importer did not use. Hidden when there are none. */
export function IgnoredColumns({ columns }: { columns: string[] | undefined }) {
  if (!columns || columns.length === 0) {
    return null;
  }
  return (
    <Stack gap={4} role="group" aria-label="Ignored columns">
      <Text size="sm" fw={600}>
        Ignored columns ({columns.length})
      </Text>
      <Text size="xs" c="dimmed">
        These columns were not imported.
      </Text>
      <Group gap="xs">
        {columns.map((column) => (
          <Badge key={column} color="gray" variant="outline" tt="none">
            {column}
          </Badge>
        ))}
      </Group>
    </Stack>
  );
}
