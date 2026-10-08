import { describe, expect, it } from "vitest";

import { csvCell, jsonToCsv, neutralizeFormulaInjection } from "@/lib/csv";
import { buildImportReportCsv, GL_NOTE } from "@/lib/import-report-csv";
import type { ReconciliationResult } from "@/lib/import-reconciliation";

describe("csvCell", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])("neutralises a leading %j", (value) => {
    expect(csvCell(value).replace(/^"/, "")).toMatch(/^'/);
    expect(neutralizeFormulaInjection(value)).toBe(`'${value}`);
  });

  it("quotes commas, quotes and line breaks and doubles inner quotes", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("writes null and undefined as an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("jsonToCsv", () => {
  it("keeps the header row for an empty export", () => {
    expect(jsonToCsv([], ["a", "b"])).toBe("a,b");
  });
});

type Ready = Extract<ReconciliationResult, { state: "ready" }>;

function report(overrides: Partial<Ready> = {}): Ready {
  return {
    state: "ready",
    batch: {
      id: "b",
      importType: "giving_csv",
      sourceSystem: "breeze",
      sourceFilename: "gifts.csv",
      status: "committed",
      createdAt: "2026-10-01T00:00:00Z",
      committedAt: "2026-10-01T00:01:00Z",
    },
    counts: { sourceRows: 3, expected: 2, written: 1, failed: 1, notAttempted: 0, skipped: 1, rejected: 0 },
    giving: { sourceCents: 15000, writtenAtCommitCents: 10000, currentCents: 10000, differenceCents: 5000 },
    mismatchCount: 1,
    mismatches: [],
    changedSinceImport: [],
    skipped: [],
    rejected: [],
    rows: [
      { rowNumber: 2, sourceId: "G-1", classification: "create", outcome: "written", reason: null, giving: { amountCents: 10000, donatedAt: "2026-09-01", fund: "General" } },
      { rowNumber: 3, sourceId: "=cmd()", classification: "create", outcome: "failed", reason: "Row could not be written.", giving: { amountCents: 5000, donatedAt: null, fund: "-Fund" } },
      { rowNumber: 4, sourceId: null, classification: "skip", outcome: "skipped", reason: "Duplicate source ID in import file.", giving: { amountCents: null, donatedAt: null, fund: null } },
    ],
    ...overrides,
  };
}

describe("buildImportReportCsv", () => {
  it("has a summary section with the GL note, a blank line, then one line per row", () => {
    const lines = buildImportReportCsv(report()).split("\n");
    expect(lines[0]).toBe("metric,value");
    expect(lines).toContain("written,1");
    expect(lines).toContain("difference_usd,50.00");
    expect(lines.some((line) => line.startsWith("note,") && line.includes(GL_NOTE.slice(0, 20)))).toBe(true);
    const blank = lines.indexOf("");
    expect(lines[blank + 1]).toBe("row_number,source_id,classification,outcome,reason,amount_usd,date,fund");
    expect(lines.slice(blank + 2)).toHaveLength(3);
    expect(lines[blank + 2]).toBe("2,G-1,create,written,,100.00,2026-09-01,General");
  });

  it("neutralises formula characters in every cell, including source id, fund and reason", () => {
    const csv = buildImportReportCsv(report());
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain("'-Fund");
  });

  it("omits giving columns and totals for other import types", () => {
    const csv = buildImportReportCsv(
      report({
        giving: null,
        rows: [{ rowNumber: 2, sourceId: "M1", classification: "create", outcome: "written", reason: null, giving: null }],
      }),
    );
    expect(csv).toContain("row_number,source_id,classification,outcome,reason\n2,M1,create,written,");
    expect(csv).not.toContain("amount_usd");
    expect(csv).not.toContain(GL_NOTE);
  });
});
