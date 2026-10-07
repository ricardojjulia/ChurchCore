"use client";

import { useState } from "react";
import { Badge, FileInput, Group, Stack, Text } from "@mantine/core";

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
}: {
  onText: (text: string) => void;
  onFilename?: (name: string) => void;
}) {
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleChange(file: File | null) {
    setFileError(null);
    if (!file) {
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
    <Stack gap={4} aria-label="Ignored columns">
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
