import { csvCell } from "@/lib/csv";
import type { ReconciliationResult } from "@/lib/import-reconciliation";

// G4.2: the CSV layout of an import reconciliation report. Minimal columns by
// design: no names, emails or phones. Every cell goes through csvCell, so a
// leading = + - @ tab or CR is neutralised.


export const GL_NOTE =
  "Imported gifts are not posted to the general ledger; ledger totals are not reconciled here.";

type ReadyReport = Extract<ReconciliationResult, { state: "ready" }>;

const dollars = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

export function buildImportReportCsv(report: ReadyReport): string {
  const { counts, batch } = report;
  const summary: Array<[string, string | number]> = [
    ["import_type", batch.importType],
    ["source_system", batch.sourceSystem],
    ["file", batch.sourceFilename],
    ["status", batch.status],
    ["source_rows", counts.sourceRows],
    ["expected_rows", counts.expected],
    ["written", counts.written],
    ["failed", counts.failed],
    ["not_attempted", counts.notAttempted],
    ["skipped", counts.skipped],
    ["rejected", counts.rejected],
    ["mismatches", report.mismatchCount],
    ["changed_since_import", report.changedSinceImport.length],
  ];
  if (report.giving) {
    summary.push(
      ["source_total_usd", dollars(report.giving.sourceCents)],
      ["written_at_commit_usd", dollars(report.giving.writtenAtCommitCents)],
      ["difference_usd", dollars(report.giving.differenceCents)],
      ["current_total_usd", dollars(report.giving.currentCents)],
      ["note", GL_NOTE],
    );
  }

  const giving = Boolean(report.giving);
  const header = ["row_number", "source_id", "classification", "outcome", "reason", ...(giving ? ["amount_usd", "date", "fund"] : [])];
  const lines = [
    "metric,value",
    ...summary.map(([metric, value]) => `${csvCell(metric)},${csvCell(value)}`),
    "",
    header.join(","),
    ...(report.rows ?? []).map((row) =>
      [
        row.rowNumber,
        row.sourceId,
        row.classification,
        row.outcome,
        row.reason,
        ...(giving
          ? [row.giving?.amountCents != null ? dollars(row.giving.amountCents) : "", row.giving?.donatedAt ?? "", row.giving?.fund ?? ""]
          : []),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

