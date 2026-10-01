import { globSync, readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { scanSource, type ScanResult } from "./column-references-scan";

// S4: every Supabase read and write in app/ and lib/ names columns that exist.
// A write to a column that doesn't exist fails, and code that ignores the
// error looks fine: event_registrations.updated_at (the Stripe webhook and
// the demo payment never marked a registration paid) and profiles
// emergency_contact_* (every demo profile save failed). Unit tests mock the
// client, so only a check against the real schema catches this.

const connectionString =
  process.env.TENANT_DB_URL ??
  "postgresql://postgres:postgres@localhost:4202/postgres";

// Tables in the control-plane database, not this one.
const CONTROL_PLANE_TABLES = new Set(["demo_feedback", "tenants", "tenant_view_audit_logs"]);

function collectReferences(): ScanResult {
  const files = globSync(["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"]).filter((file) => !file.includes(".test."));
  const result: ScanResult = { references: [], unchecked: 0 };
  for (const file of files) {
    const scanned = scanSource(file, readFileSync(file, "utf8"));
    result.references.push(...scanned.references);
    result.unchecked += scanned.unchecked;
  }
  return result;
}

describe("Supabase column references match the schema (S4)", () => {
  let pool: Pool;
  const columns = new Map<string, Set<string>>();

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    );
    for (const row of rows) {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
      columns.get(row.table_name)!.add(row.column_name);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("finds the references it checks (the scan itself works; see column-references-scan.test.ts)", () => {
    const { references, unchecked } = collectReferences();
    expect(references.filter((r) => r.kind === "write").length).toBeGreaterThan(200);
    expect(references.filter((r) => r.kind === "select").length).toBeGreaterThan(400);
    // Calls it can't read statically (variable payloads, computed table
    // names). Kept small: a jump means a new pattern the scan doesn't cover.
    expect(unchecked).toBeLessThanOrEqual(45);
  });

  it("every written and selected column exists on its table", () => {
    const problems: string[] = [];
    for (const reference of collectReferences().references) {
      if (CONTROL_PLANE_TABLES.has(reference.table)) continue;
      const tableColumns = columns.get(reference.table);
      if (!tableColumns) {
        problems.push(`${reference.file}:${reference.line} unknown table ${reference.table}`);
        continue;
      }
      const missing = reference.columns.filter((column) => !tableColumns.has(column));
      if (missing.length) {
        problems.push(`${reference.file}:${reference.line} ${reference.table} ${reference.kind}: ${missing.join(", ")}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
