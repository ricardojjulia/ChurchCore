// Prefix cells that start with =, +, -, @, tab, or CR with a single quote so
// spreadsheet apps (Excel/Sheets/LibreOffice) treat them as text rather than
// live formulas -- a standard CSV-export mitigation for formula injection.
// User-controlled fields (names, emails, descriptions) are exported otherwise
// unsanitized. Shared by the custom reports export and the import report.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

/** One CSV cell: formula-neutralised, and quoted when it holds a comma, quote or line break. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = neutralizeFormulaInjection(String(value));
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// `columns` gives the header row when there are no rows, so an empty export
// is still a valid CSV with its headers rather than a 0-byte file.
export function jsonToCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return columns?.length ? columns.join(",") : "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.join(",");
  const rowLines = rows.map((row) => headers.map((h) => csvCell(row[h])).join(","));
  return [headerLine, ...rowLines].join("\n");
}
