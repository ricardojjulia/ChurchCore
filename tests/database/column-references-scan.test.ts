import { describe, expect, it } from "vitest";

import { scanSource } from "./column-references-scan";

// The column-reference CI check is only as good as its scan: each Supabase
// call syntax used in the app must be found (PR #168 review), and anything it
// can't read statically must be counted, not silently skipped.

const FIXTURE = `
async function demo(supabase: any, patch: Record<string, unknown>, table: string) {
  await supabase.from("events").update({ title: "x", starts_at: now }).eq("id", id);
  await supabase.from('donations').insert({ amount_cents: 1, metadata: { nested_key: 1 } });
  await supabase.from("finance_journal_lines").insert([{ side: "debit", amount_cents: 1 }, { side: "credit", memo: "m" }]);
  await supabase.from("profiles").upsert({ id, "full_name": name }, { onConflict: "id" });
  await supabase.from('event_registrations').select('id, payment_status');
  await supabase.from("profiles").select(\`
    id,
    full_name,
    churches(name)
  \`);
  await supabase.from("events").select("id, starter:created_by, organizer:profiles!created_by(full_name)");
  await supabase.from("finance_accounts").update(patch);
  await supabase.from(table).select("id");
  await supabase.from("events").select(\`id, \${extra}\`);
}
`;

describe("column-reference scan", () => {
  const { references, unchecked } = scanSource("fixture.ts", FIXTURE);
  const find = (table: string, kind: "write" | "select") => references.filter((r) => r.table === table && r.kind === kind);

  it("reads object-literal writes, top-level keys only (a nested JSON value's keys aren't columns)", () => {
    expect(find("events", "write")[0].columns).toEqual(["title", "starts_at"]);
    expect(find("donations", "write")[0].columns).toEqual(["amount_cents", "metadata"]);
  });

  it("reads single-quoted names, quoted keys and upserts", () => {
    expect(find("donations", "write")).toHaveLength(1);
    expect(find("profiles", "write")[0].columns).toEqual(["id", "full_name"]);
    expect(find("event_registrations", "select")[0].columns).toEqual(["id", "payment_status"]);
  });

  it("reads every row of an array insert", () => {
    expect(find("finance_journal_lines", "write").map((r) => r.columns)).toEqual([
      ["side", "amount_cents"],
      ["side", "memo"],
    ]);
  });

  it("reads template-literal selects, skips embedded relations, and keeps an alias's column", () => {
    expect(find("profiles", "select")[0].columns).toEqual(["id", "full_name"]);
    expect(find("events", "select")[0].columns).toEqual(["id", "created_by"]);
  });

  it("counts what it can't read statically: a variable payload, a variable table, a template with substitutions", () => {
    expect(unchecked).toBe(3);
  });

  it("records the line of each reference", () => {
    expect(find("events", "write")[0].line).toBe(3);
  });
});
