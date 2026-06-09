import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../supabase/migrations/20260712000000_localization_governance.sql",
);

describe("localization governance migration idempotency", () => {
  let sql: string;
  let lines: string[];

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    lines = sql.split("\n");
  });

  it("migration file exists and is non-empty", () => {
    expect(sql.length).toBeGreaterThan(100);
  });

  it("all CREATE TABLE statements use IF NOT EXISTS", () => {
    const createTableLines = lines.filter((line) =>
      /^\s*CREATE\s+TABLE\s+/i.test(line),
    );

    expect(createTableLines.length).toBeGreaterThan(0);

    for (const line of createTableLines) {
      expect(line.toUpperCase()).toContain("IF NOT EXISTS");
    }
  });

  it("all CREATE INDEX statements use IF NOT EXISTS", () => {
    const createIndexLines = lines.filter((line) =>
      /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.test(line),
    );

    expect(createIndexLines.length).toBeGreaterThan(0);

    for (const line of createIndexLines) {
      expect(line.toUpperCase()).toContain("IF NOT EXISTS");
    }
  });

  it("uses DROP POLICY IF EXISTS before CREATE POLICY (idempotent policies)", () => {
    const createPolicyLines = lines.filter((line) =>
      /^\s*CREATE\s+POLICY\s+/i.test(line),
    );
    const dropPolicyLines = lines.filter((line) =>
      /^\s*DROP\s+POLICY\s+IF\s+EXISTS\s+/i.test(line),
    );

    expect(createPolicyLines.length).toBeGreaterThan(0);
    // Every CREATE POLICY should have a corresponding DROP POLICY IF EXISTS
    expect(dropPolicyLines.length).toBe(createPolicyLines.length);
  });

  it("uses DROP TRIGGER IF EXISTS before CREATE TRIGGER (idempotent triggers)", () => {
    const createTriggerLines = lines.filter((line) =>
      /^\s*CREATE\s+TRIGGER\s+/i.test(line),
    );
    const dropTriggerLines = lines.filter((line) =>
      /^\s*DROP\s+TRIGGER\s+IF\s+EXISTS\s+/i.test(line),
    );

    expect(createTriggerLines.length).toBeGreaterThan(0);
    expect(dropTriggerLines.length).toBe(createTriggerLines.length);
  });

  it("all tables use tenant_id uuid (not varchar) for FK", () => {
    // Find tenant_id column definitions
    const tenantIdLines = lines.filter((line) =>
      /tenant_id\s+uuid/i.test(line),
    );
    expect(tenantIdLines.length).toBeGreaterThanOrEqual(6); // 6 tables
  });

  it("all id columns are uuid type (not varchar)", () => {
    // id uuid NOT NULL should appear for each table
    const idUuidLines = lines.filter((line) =>
      /^\s+id\s+uuid\s+NOT\s+NULL/i.test(line),
    );
    expect(idUuidLines.length).toBeGreaterThanOrEqual(5);
  });

  it("references public.churches(id) for tenant FK", () => {
    expect(sql).toContain("REFERENCES public.churches(id)");
  });

  it("enables RLS on all localization tables", () => {
    const rlsLines = lines.filter((line) =>
      /ENABLE ROW LEVEL SECURITY/i.test(line),
    );
    // 6 tables
    expect(rlsLines.length).toBeGreaterThanOrEqual(6);
  });

  it("messages and provenance are excluded from audit new_values/old_values", () => {
    // The audit trigger subtracts these columns
    expect(sql).toContain("- 'messages' - 'provenance'");
  });

  it("localization_review_assignments table is present", () => {
    expect(sql).toContain("localization_review_assignments");
  });
});

// Vitest needs this import
import { beforeAll } from "vitest";
