import { describe, expect, it, vi } from "vitest";

const mockReadExcelFile = vi.hoisted(() => vi.fn());

vi.mock("read-excel-file/browser", () => ({
  default: mockReadExcelFile,
}));

import {
  csvRowsToPreview,
  detectFormat,
  iifToPreview,
  normalizeDate,
  ofxToPreview,
  parseCsv,
  parseDollarsToCents,
  parseIif,
  parseOfx,
  parsePlainText,
  parseXlsx,
} from "@/lib/finance-import";

describe("finance import helpers", () => {
  it("parses dollar strings into integer cents", () => {
    expect(parseDollarsToCents("$1,234.56")).toBe(123456);
    expect(parseDollarsToCents("-19.99")).toBe(-1999);
    expect(parseDollarsToCents("not-a-number")).toBe(0);
  });

  it("normalizes common date formats", () => {
    expect(normalizeDate("2026-04-21T14:00:00Z")).toBe("2026-04-21");
    expect(normalizeDate("4/7/2026")).toBe("2026-04-07");
    expect(normalizeDate("04-07-2026")).toBe("2026-04-07");
    expect(normalizeDate("20260421")).toBe("2026-04-21");
    expect(normalizeDate("April 7, 2026")).toBeNull();
  });

  it("maps CSV rows into preview rows with validation", () => {
    const preview = csvRowsToPreview(
      [
        {
          Posted: "04/21/2026",
          Description: "Sunday giving",
          Amount: "$125.00",
          Ref: "DEP-42",
        },
        {
          Posted: "bad-date",
          Description: "Broken row",
          Amount: "$0.00",
          Ref: "DEP-43",
        },
      ],
      {
        date: "Posted",
        description: "Description",
        amount: "Amount",
        reference: "Ref",
        debitAccount: null,
        creditAccount: null,
      },
    );

    expect(preview[0]).toMatchObject({
      date: "2026-04-21",
      description: "Sunday giving",
      amountCents: 12500,
      reference: "DEP-42",
      error: null,
    });
    expect(preview[1]?.error).toBe("Invalid date");
  });

  it("parses QuickBooks IIF transactions and converts them to preview rows", () => {
    const { transactions, errors } = parseIif([
      "!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO",
      "!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO",
      "TRNS\tDEPOSIT\t04/20/2026\tChecking\tGeneral Fund\t125.50\t1001\tOnline giving",
      "SPL\tDEPOSIT\t04/20/2026\tTithes Income\tGeneral Fund\t-125.50\t1001\tOnline giving",
      "ENDTRNS",
    ].join("\n"));

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      date: "2026-04-20",
      accountName: "Checking",
      splitAccountName: "Tithes Income",
      amountCents: 12550,
    });

    expect(iifToPreview(transactions)[0]).toMatchObject({
      amountCents: 12550,
      debitAccountCode: "Tithes Income",
      creditAccountCode: "Checking",
      error: null,
    });
  });

  it("parses OFX transactions and converts debit or credit directions", () => {
    const { transactions, errors } = parseOfx([
      "OFXHEADER:100",
      "<OFX>",
      "<BANKTRANLIST>",
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260421",
      "<TRNAMT>-42.15",
      "<FITID>abc-123",
      "<NAME>Coffee Fellowship",
      "<MEMO>Hospitality",
      "</STMTTRN>",
      "</BANKTRANLIST>",
      "</OFX>",
    ].join("\n"));

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(1);

    expect(ofxToPreview(transactions)[0]).toMatchObject({
      date: "2026-04-21",
      amountCents: 4215,
      description: "Coffee Fellowship — Hospitality",
      creditAccountCode: "BANK",
      debitAccountCode: null,
      error: null,
    });
  });
});

describe("parseCsv", () => {
  it("parses a simple CSV with headers", async () => {
    const result = await parseCsv("Name,Email,Amount\nJohn,john@x.com,100\nJane,jane@x.com,50");

    expect(result.headers).toEqual(["Name", "Email", "Amount"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ Name: "John", Email: "john@x.com", Amount: "100" });
    expect(result.errors).toEqual([]);
  });

  it("preserves commas inside quoted fields", async () => {
    const result = await parseCsv('Fund,Note\nBuilding,"repairs, plumbing, and paint"');

    expect(result.rows[0]?.Note).toBe("repairs, plumbing, and paint");
  });

  it("unescapes doubled quotes inside quoted fields", async () => {
    const result = await parseCsv('Note\n"He said ""hello"""');

    expect(result.rows[0]?.Note).toBe('He said "hello"');
  });

  it("consistent CRLF line endings parse cleanly", async () => {
    const result = await parseCsv("Date,Amount\r\n2026-04-21,100\r\n2026-04-22,50\r\n");

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toMatchObject({ Date: "2026-04-22", Amount: "50" });
    expect(result.errors).toEqual([]);
  });

  it("reports a field-count error when line endings are mixed within one file", async () => {
    // papaparse auto-detects a single newline style for the whole file; a lone "\n"
    // inside a file it decided uses "\r\n" gets treated as in-field text, not a row
    // break, merging two data rows into one with a reported field-count mismatch.
    const result = await parseCsv("Date,Amount\r\n2026-04-21,100\n2026-04-22,50\r\n");

    expect(result.rows).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns no rows for an empty file", async () => {
    const result = await parseCsv("");

    expect(result.rows).toEqual([]);
  });
});

describe("parsePlainText", () => {
  it("parses tab-delimited text", async () => {
    const result = await parsePlainText("Date\tAmount\n2026-04-21\t100\n2026-04-22\t50");

    expect(result.headers).toEqual(["Date", "Amount"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ Date: "2026-04-21", Amount: "100" });
  });

  it("parses pipe-delimited text", async () => {
    const result = await parsePlainText("Name | Amount\nJohn | 100");

    expect(result.headers).toEqual(["Name", "Amount"]);
    expect(result.rows[0]).toMatchObject({ Name: "John", Amount: "100" });
  });

  it("skips blank lines in tab-delimited input", async () => {
    const result = await parsePlainText("A\tB\n\nrow1\trow2\n\n");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ A: "row1", B: "row2" });
  });

  it("falls back to the CSV parser when no tab or pipe delimiter is found", async () => {
    const result = await parsePlainText("Name,Amount\nJohn,100");

    expect(result.headers).toEqual(["Name", "Amount"]);
    expect(result.rows[0]).toMatchObject({ Name: "John", Amount: "100" });
  });
});

describe("detectFormat", () => {
  it("detects xlsx and xls by extension", () => {
    expect(detectFormat("bank-export.xlsx")).toBe("xlsx");
    expect(detectFormat("bank-export.xls")).toBe("xlsx");
  });

  it("detects quickbooks_iif by extension", () => {
    expect(detectFormat("qb-export.iif")).toBe("quickbooks_iif");
  });

  it("detects ofx and qfx by extension", () => {
    expect(detectFormat("chase.ofx")).toBe("ofx");
    expect(detectFormat("chase.qfx")).toBe("ofx");
  });

  it("detects csv by extension", () => {
    expect(detectFormat("giving.csv")).toBe("csv");
  });

  it("sniffs OFX content when the extension doesn't say so", () => {
    expect(detectFormat("statement.txt", "OFXHEADER:100\n<OFX>\n<STMTTRN>")).toBe("ofx");
  });

  it("sniffs IIF content when the extension doesn't say so", () => {
    expect(detectFormat("ledger.txt", "!TRNS\tDATE\nTRNS\t04/20/2026\nENDTRNS")).toBe("quickbooks_iif");
  });

  it("defaults to txt when nothing is recognizable", () => {
    expect(detectFormat("data.txt", "just some plain notes")).toBe("txt");
    expect(detectFormat("data.unknown")).toBe("txt");
  });
});

describe("parseXlsx", () => {
  it("parses a single-sheet workbook", async () => {
    mockReadExcelFile.mockResolvedValueOnce([
      { sheet: "Sheet1", data: [["Date", "Amount"], ["2026-04-21", 100]] },
    ]);

    const result = await parseXlsx(new ArrayBuffer(0));

    expect(result.headers).toEqual(["Date", "Amount"]);
    expect(result.rows).toEqual([{ Date: "2026-04-21", Amount: "100" }]);
    expect(result.sheetNames).toEqual(["Sheet1"]);
    expect(result.errors).toEqual([]);
  });

  it("selects the requested sheet by index", async () => {
    mockReadExcelFile.mockResolvedValueOnce([
      { sheet: "Sheet1", data: [["A"], ["1"]] },
      { sheet: "Sheet2", data: [["B"], ["2"]] },
      { sheet: "Sheet3", data: [["C"], ["3"]] },
    ]);

    const result = await parseXlsx(new ArrayBuffer(0), 1);

    expect(result.headers).toEqual(["B"]);
    expect(result.rows).toEqual([{ B: "2" }]);
    expect(result.sheetNames).toEqual(["Sheet1", "Sheet2", "Sheet3"]);
  });

  it("fills in generic column names for blank header cells", async () => {
    mockReadExcelFile.mockResolvedValueOnce([
      { sheet: "Sheet1", data: [[null, "Amount", undefined], ["x", "100", "y"]] },
    ]);

    const result = await parseXlsx(new ArrayBuffer(0));

    expect(result.headers).toEqual(["Column 1", "Amount", "Column 3"]);
  });

  it("drops fully-empty data rows", async () => {
    mockReadExcelFile.mockResolvedValueOnce([
      { sheet: "Sheet1", data: [["Date", "Amount"], ["2026-04-21", 100], ["", null], ["2026-04-22", 50]] },
    ]);

    const result = await parseXlsx(new ArrayBuffer(0));

    expect(result.rows).toHaveLength(2);
  });

  it("reports an error when the sheet read throws", async () => {
    mockReadExcelFile.mockRejectedValueOnce(new Error("corrupt file"));

    const result = await parseXlsx(new ArrayBuffer(0));

    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});