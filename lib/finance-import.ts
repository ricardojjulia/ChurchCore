// Finance import parsers — CSV, Excel, QuickBooks IIF, OFX/QFX, plain text.
// All parsing is synchronous / returns plain data; no DB access here.
// Callers convert amounts to cents before persisting.

import type { ImportColumnMapping, ImportPreviewRow } from "@/lib/finance-types";

// ── Shared ───────────────────────────────────────────────────

/** Convert a dollar-amount string like "$1,234.56" or "-1234.56" to cents (integer). */
export function parseDollarsToCents(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/** Parse a date string in common US/ISO formats to "YYYY-MM-DD". Returns null if unparseable. */
export function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // MM/DD/YYYY or M/D/YYYY
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // MM-DD-YYYY
  const mdyDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (mdyDash) {
    const [, m, d, y] = mdyDash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYYMMDD (OFX style)
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    return `${y}-${m}-${d}`;
  }
  return null;
}

// ── CSV ──────────────────────────────────────────────────────

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
};

/**
 * Parse a raw CSV string using papaparse (dynamically imported to keep the
 * module edge-safe when papaparse is not yet installed).
 * Falls back to a minimal built-in parser if papaparse is unavailable.
 */
export async function parseCsv(raw: string): Promise<CsvParseResult> {
  try {
    const Papa = (await import("papaparse")).default;
    const result = Papa.parse<Record<string, string>>(raw, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
    } as Parameters<typeof Papa.parse>[1]);
    return {
      headers: result.meta.fields ?? [],
      rows: result.data,
      errors: result.errors.map((e) => e.message),
    };
  } catch {
    return parseCsvBuiltin(raw);
  }
}

/** Minimal CSV parser for environments where papaparse is not yet installed. */
function parseCsvBuiltin(raw: string): CsvParseResult {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], errors: ["Empty file"] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows, errors: [] };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Convert mapped CSV rows into ImportPreviewRow objects. */
export function csvRowsToPreview(
  rows: Record<string, string>[],
  mapping: ImportColumnMapping,
): ImportPreviewRow[] {
  return rows.map((row, i) => {
    const rawDate = mapping.date ? (row[mapping.date] ?? "") : "";
    const rawDesc = mapping.description ? (row[mapping.description] ?? "") : "";
    const rawAmount = mapping.amount ? (row[mapping.amount] ?? "") : "";
    const rawRef = mapping.reference ? (row[mapping.reference] ?? "") : "";

    const date = normalizeDate(rawDate);
    const amountCents = parseDollarsToCents(rawAmount);

    const error =
      !date ? "Invalid date" :
      amountCents === 0 ? "Zero or unparseable amount" :
      null;

    return {
      rowIndex: i,
      date: date ?? rawDate,
      description: rawDesc,
      amountCents,
      debitAccountCode: mapping.debitAccount ? (row[mapping.debitAccount] ?? null) : null,
      creditAccountCode: mapping.creditAccount ? (row[mapping.creditAccount] ?? null) : null,
      reference: rawRef || null,
      error,
    };
  });
}

// ── Excel (.xlsx) ────────────────────────────────────────────

export type ExcelParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  sheetNames: string[];
  errors: string[];
};

/**
 * Parse an Excel file (ArrayBuffer) using the read-excel-file browser parser.
 * Returns the first sheet's data as header-keyed rows.
 */
export async function parseXlsx(buffer: ArrayBuffer, sheetIndex = 0): Promise<ExcelParseResult> {
  try {
    const readExcelFile = (await import("read-excel-file/browser")).default;
    const sheets = await readExcelFile(buffer);
    const sheetNames = sheets.map((sheet) => sheet.sheet);
    const activeSheet = sheets[sheetIndex] ?? sheets[0];
    if (!activeSheet) return { headers: [], rows: [], sheetNames: [], errors: ["No sheets found"] };

    const headerCells = activeSheet.data[0] ?? [];
    const headers = headerCells.map((cell, idx) => {
      const headerText = cell == null ? "" : String(cell).trim();
      return headerText || `Column ${idx + 1}`;
    });

    const rows: Record<string, string>[] = activeSheet.data.slice(1)
      .map((row) => {
        const mapped: Record<string, string> = {};
        let hasData = false;
        headers.forEach((header, idx) => {
          const rawValue = row[idx];
          const textValue = rawValue == null ? "" : String(rawValue).trim();
          mapped[header] = textValue;
          if (textValue !== "") hasData = true;
        });
        return hasData ? mapped : null;
      })
      .filter((row): row is Record<string, string> => row !== null);

    return { headers, rows, sheetNames, errors: [] };
  } catch (err) {
    return { headers: [], rows: [], sheetNames: [], errors: [String(err)] };
  }
}

// ── QuickBooks IIF ────────────────────────────────────────────

export type IifTransaction = {
  date: string | null;
  description: string;
  amountCents: number;
  accountName: string | null;
  splitAccountName: string | null;
  reference: string | null;
  type: string;
};

/**
 * Parse a QuickBooks IIF (Intuit Interchange Format) file.
 * IIF is tab-delimited; transaction rows are identified by !TRNS / TRNS markers.
 * Each TRNS block may have one or more SPLT (split) rows.
 */
export function parseIif(raw: string): { transactions: IifTransaction[]; errors: string[] } {
  const transactions: IifTransaction[] = [];
  const errors: string[] = [];

  let trnsHeaders: string[] = [];
  let splitHeaders: string[] = [];
  let currentTrns: Record<string, string> | null = null;

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const cols = line.split("\t");
    const marker = (cols[0] ?? "").trim().toUpperCase();

    if (marker === "!TRNS") {
      trnsHeaders = cols.slice(1).map((h) => h.trim().toUpperCase());
      continue;
    }
    if (marker === "!SPL" || marker === "!SPLT") {
      splitHeaders = cols.slice(1).map((h) => h.trim().toUpperCase());
      continue;
    }
    if (marker === "TRNS") {
      if (currentTrns) transactions.push(buildIifTrns(currentTrns));
      currentTrns = {};
      trnsHeaders.forEach((h, i) => { currentTrns![h] = (cols[i + 1] ?? "").trim(); });
      continue;
    }
    if ((marker === "SPL" || marker === "SPLT") && currentTrns) {
      const split: Record<string, string> = {};
      splitHeaders.forEach((h, i) => { split[h] = (cols[i + 1] ?? "").trim(); });
      if (split["ACCNT"]) currentTrns["SPLIT_ACCNT"] = split["ACCNT"];
      continue;
    }
    if (marker === "ENDTRNS" && currentTrns) {
      transactions.push(buildIifTrns(currentTrns));
      currentTrns = null;
      continue;
    }
  }
  if (currentTrns) transactions.push(buildIifTrns(currentTrns));

  if (transactions.length === 0) errors.push("No transactions found in IIF file");
  return { transactions, errors };
}

function buildIifTrns(row: Record<string, string>): IifTransaction {
  return {
    date: normalizeDate(row["DATE"] ?? ""),
    description: row["MEMO"] ?? row["NAME"] ?? "",
    amountCents: parseDollarsToCents(row["AMOUNT"] ?? "0"),
    accountName: row["ACCNT"] ?? null,
    splitAccountName: row["SPLIT_ACCNT"] ?? null,
    reference: row["DOCNUM"] ?? row["REFNUM"] ?? null,
    type: row["TRNSTYPE"] ?? "GENERAL",
  };
}

/** Convert IIF transactions to ImportPreviewRow format. */
export function iifToPreview(transactions: IifTransaction[]): ImportPreviewRow[] {
  return transactions.map((t, i) => ({
    rowIndex: i,
    date: t.date ?? "",
    description: t.description,
    amountCents: Math.abs(t.amountCents),
    debitAccountCode: t.amountCents < 0 ? (t.accountName ?? null) : (t.splitAccountName ?? null),
    creditAccountCode: t.amountCents >= 0 ? (t.accountName ?? null) : (t.splitAccountName ?? null),
    reference: t.reference,
    error: !t.date ? "Invalid date" : null,
  }));
}

// ── OFX / QFX ────────────────────────────────────────────────

export type OfxTransaction = {
  date: string | null;
  description: string;
  amountCents: number;
  fitid: string | null; // financial institution transaction ID
  memo: string | null;
  type: string | null; // DEBIT, CREDIT, CHECK, etc.
};

/**
 * Parse an OFX or QFX bank feed file.
 * OFX is SGML-like; each <STMTTRN> block contains the relevant fields.
 * We extract fields with a simple regex approach (no full SGML parser needed).
 */
export function parseOfx(raw: string): { transactions: OfxTransaction[]; errors: string[] } {
  const transactions: OfxTransaction[] = [];
  const errors: string[] = [];

  // Strip headers before <OFX> tag
  const ofxStart = raw.indexOf("<OFX>");
  const body = ofxStart >= 0 ? raw.slice(ofxStart) : raw;

  // Split into STMTTRN blocks
  const blockRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(body)) !== null) {
    const block = match[1];
    transactions.push({
      date: normalizeDate(extractOfxField(block, "DTPOSTED") ?? ""),
      description: extractOfxField(block, "NAME") ?? extractOfxField(block, "PAYEE") ?? "",
      amountCents: parseDollarsToCents(extractOfxField(block, "TRNAMT") ?? "0"),
      fitid: extractOfxField(block, "FITID"),
      memo: extractOfxField(block, "MEMO"),
      type: extractOfxField(block, "TRNTYPE"),
    });
  }

  if (transactions.length === 0) errors.push("No STMTTRN blocks found in OFX file");
  return { transactions, errors };
}

function extractOfxField(block: string, tag: string): string | null {
  // Both <TAG>value and <TAG>value\n styles
  const re = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

/** Convert OFX transactions to ImportPreviewRow format. */
export function ofxToPreview(transactions: OfxTransaction[]): ImportPreviewRow[] {
  return transactions.map((t, i) => {
    const isDebit = t.amountCents < 0 ||
      (t.type?.toUpperCase() === "DEBIT" || t.type?.toUpperCase() === "CHECK");
    return {
      rowIndex: i,
      date: t.date ?? "",
      description: t.description + (t.memo ? ` — ${t.memo}` : ""),
      amountCents: Math.abs(t.amountCents),
      // Debit-side: cash/bank account (asset); credit-side: "bank feed clearing" (to be mapped)
      debitAccountCode: isDebit ? null : "BANK",
      creditAccountCode: isDebit ? "BANK" : null,
      reference: t.fitid,
      error: !t.date ? "Invalid date" : null,
    };
  });
}

// ── Plain text ───────────────────────────────────────────────

/**
 * Attempt to parse a plain-text file as a delimited format.
 * Tries tab-delimited first, then pipe-delimited, then falls back to CSV.
 */
export async function parsePlainText(raw: string): Promise<CsvParseResult> {
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  if (firstLine.includes("\t")) {
    // Tab-delimited — treat like IIF headers check or plain TSV
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const headers = firstLine.split("\t").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split("\t");
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
      return row;
    });
    return { headers, rows, errors: [] };
  }
  if (firstLine.includes("|")) {
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const headers = firstLine.split("|").map((h) => h.trim()).filter(Boolean);
    const rows = lines.slice(1).map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
      return row;
    });
    return { headers, rows, errors: [] };
  }
  // Fallback to CSV parser
  return parseCsv(raw);
}

// ── Auto-detect format ────────────────────────────────────────

export type DetectedFormat = "csv" | "xlsx" | "quickbooks_iif" | "ofx" | "txt";

export function detectFormat(filename: string, rawText?: string): DetectedFormat {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "iif") return "quickbooks_iif";
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (ext === "csv") return "csv";
  // Sniff content
  if (rawText) {
    if (rawText.includes("<OFX>") || rawText.includes("<STMTTRN>")) return "ofx";
    if (rawText.includes("!TRNS") || rawText.includes("ENDTRNS")) return "quickbooks_iif";
  }
  return "txt";
}
