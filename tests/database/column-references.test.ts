import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

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

type Reference = { file: string; line: number; table: string; columns: string[]; kind: "write" | "select" };

function lineOf(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

// The text inside the object literal whose "{" is at `open`, matching braces
// so a nested object value doesn't end it early.
function objectBody(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

// Top-level keys of an object literal: nested objects (JSON column values)
// are removed first, so their keys aren't mistaken for columns.
function topLevelKeys(body: string): string[] {
  let flat = body;
  for (let previous = ""; previous !== flat; ) {
    previous = flat;
    flat = flat.replace(/\{[^{}]*\}/g, "");
  }
  return [...flat.matchAll(/(?:^|,|\n)\s*(\w+)\s*:/g)].map((match) => match[1]);
}

// Top-level column names of a PostgREST select string: embedded relations
// (anything in parentheses) are skipped; `alias:column` keeps the column.
function selectColumns(select: string): string[] {
  let depth = 0;
  let current = "";
  const parts: string[] = [];
  for (const ch of select) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else if (depth === 0) current += ch;
  }
  parts.push(current);
  return parts
    .map((part) => part.trim())
    .filter((part) => part && part !== "*")
    .map((part) => part.split(":").pop()!.split("!")[0].split("::")[0].trim())
    .filter((part) => /^\w+$/.test(part));
}

function collectReferences(): Reference[] {
  const files = globSync(["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"]).filter((file) => !file.includes(".test."));
  const references: Reference[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.from\(\s*"(\w+)"\s*\)\s*\.(?:update|insert|upsert)\(\s*\{/g)) {
      const body = objectBody(source, match.index! + match[0].length - 1);
      references.push({ file, line: lineOf(source, match.index!), table: match[1], columns: topLevelKeys(body), kind: "write" });
    }
    for (const match of source.matchAll(/\.from\(\s*"(\w+)"\s*\)\s*\.select\(\s*"([^"]*)"/g)) {
      references.push({ file, line: lineOf(source, match.index!), table: match[1], columns: selectColumns(match[2]), kind: "select" });
    }
  }
  return references;
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

  it("finds the references it checks (the scan itself works)", () => {
    const references = collectReferences();
    expect(references.filter((r) => r.kind === "write").length).toBeGreaterThan(150);
    expect(references.filter((r) => r.kind === "select").length).toBeGreaterThan(300);
  });

  it("every written and selected column exists on its table", () => {
    const problems: string[] = [];
    for (const reference of collectReferences()) {
      if (CONTROL_PLANE_TABLES.has(reference.table)) continue;
      const tableColumns = columns.get(reference.table);
      if (!tableColumns) {
        problems.push(`${reference.file}:${reference.line} unknown table ${reference.table}`);
        continue;
      }
      // A select may name an embedded table without parentheses (e.g. a
      // relation alias); only plain columns are checked there.
      const missing = reference.columns.filter(
        (column) => !tableColumns.has(column) && !(reference.kind === "select" && columns.has(column)),
      );
      if (missing.length) {
        problems.push(`${reference.file}:${reference.line} ${reference.table} ${reference.kind}: ${missing.join(", ")}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
