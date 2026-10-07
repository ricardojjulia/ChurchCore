import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({
  createTenantServerClient: vi.fn(),
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: hoisted.createTenantServerClient,
  queryTenantLocalDb: hoisted.queryTenantLocalDb,
  shouldUseLocalTenantFallback: hoisted.shouldUseLocalTenantFallback,
}));

import {
  eventTitleDayKey,
  fetchAllPages,
  loadEventTitleDayIndex,
  loadGroupNameIndex,
  loadMembershipPairs,
  loadProfileLinkIndex,
} from "@/lib/import-profile-index";
import { runGivingImportDryRun } from "@/lib/giving-import-dry-run";

type Call = { table: string; filters: Array<[string, ...unknown[]]>; range?: [number, number]; op: string; payload?: unknown };

/** A Supabase stand-in that honours .range() over an in-memory table and records every call. */
function fakeClient(tables: Record<string, Array<Record<string, unknown>>>, calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, filters: [], op: "select" };
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === "then") {
              return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
                calls.push(call);
                if (call.op === "insert") return Promise.resolve({ data: null, error: null }).then(resolve, reject);
                const all = tables[table] ?? [];
                const [from, to] = call.range ?? [0, all.length - 1];
                return Promise.resolve({ data: all.slice(from, to + 1), error: null }).then(resolve, reject);
              };
            }
            if (prop === "single") {
              return () => {
                calls.push(call);
                return Promise.resolve({ data: { id: `new-${table}` }, error: null });
              };
            }
            return (...args: unknown[]) => {
              if (prop === "range") call.range = [args[0] as number, args[1] as number];
              else if (prop === "insert") {
                call.op = "insert";
                call.payload = args[0];
              } else if (prop === "eq" || prop === "is" || prop === "not" || prop === "in") {
                call.filters.push([prop, ...args]);
              }
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchAllPages", () => {
  it("reads every page until a short page", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const seen: Array<[number, number]> = [];
    const result = await fetchAllPages<{ id: number }>(async (from, to) => {
      seen.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(result).toHaveLength(2500);
    expect(seen).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks for one more page when the last one is exactly full", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    let pages = 0;
    await fetchAllPages(async (from, to) => {
      pages += 1;
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(pages).toBe(2);
  });

  it("throws a generic message on a database error without echoing it", async () => {
    await expect(
      fetchAllPages(async () => ({ data: null, error: { message: 'relation "x" secret detail' } })),
    ).rejects.toThrow("Unable to load existing records for the import.");
  });
});

describe("loadProfileLinkIndex", () => {
  it("scopes to the church, excludes merged profiles, and indexes beyond 1,000 rows", async () => {
    const profiles = Array.from({ length: 1500 }, (_, i) => ({
      id: `p-${i}`,
      email: i % 2 === 0 ? `Person${i}@Example.org ` : null,
      member_number: `M-${i}`,
    }));
    const calls: Call[] = [];
    hoisted.createTenantServerClient.mockResolvedValue(fakeClient({ profiles }, calls));

    const index = await loadProfileLinkIndex("church-1");

    expect(index.byMemberNumber.size).toBe(1500);
    expect(index.byMemberNumber.get("M-1499")).toBe("p-1499");
    expect(index.byEmail.get("person1498@example.org")).toBe("p-1498");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.table).toBe("profiles");
      expect(call.filters).toContainEqual(["eq", "church_id", "church-1"]);
      expect(call.filters).toContainEqual(["is", "merged_into_profile_id", null]);
    }
  });

  it("keeps the first profile when a number or email repeats", async () => {
    hoisted.createTenantServerClient.mockResolvedValue(
      fakeClient(
        {
          profiles: [
            { id: "first", email: "a@example.org", member_number: "1" },
            { id: "second", email: "A@example.org", member_number: "1" },
          ],
        },
        [],
      ),
    );
    const index = await loadProfileLinkIndex("church-1");
    expect(index.byMemberNumber.get("1")).toBe("first");
    expect(index.byEmail.get("a@example.org")).toBe("first");
  });
});

describe("event, group and membership indexes", () => {
  it("keys events by lowercased title and the church-local day", async () => {
    const calls: Call[] = [];
    hoisted.createTenantServerClient.mockResolvedValue(
      fakeClient(
        {
          events: [
            // 02:00Z on the 7th is still the evening of the 6th in Chicago.
            { id: "e1", title: "Sunday Service", starts_at: "2026-09-07T02:00:00Z" },
            { id: "e2", title: "sunday service", starts_at: "2026-09-07T02:30:00Z" },
            { id: "e3", title: "Youth Night", starts_at: "2026-09-12T00:00:00Z" },
            { id: "e4", title: null, starts_at: "2026-09-12T00:00:00Z" },
          ],
        },
        calls,
      ),
    );
    const index = await loadEventTitleDayIndex("church-1", "America/Chicago");
    expect(index.get(eventTitleDayKey("Sunday Service", "2026-09-06"))).toEqual(["e1", "e2"]);
    expect(index.get(eventTitleDayKey("Youth Night", "2026-09-11"))).toEqual(["e3"]);
    expect(calls[0].filters).toContainEqual(["eq", "church_id", "church-1"]);
  });

  it("maps group names case-insensitively and membership pairs", async () => {
    hoisted.createTenantServerClient.mockResolvedValue(
      fakeClient(
        {
          groups: [{ id: "g1", name: " Hospitality " }],
          group_members: [{ id: "m1", group_id: "g1", profile_id: "p1" }],
        },
        [],
      ),
    );
    expect((await loadGroupNameIndex("church-1")).get("hospitality")).toBe("g1");
    expect((await loadMembershipPairs("church-1")).has("g1:p1")).toBe(true);
  });
});

describe("a 5,000 row file (large-file import)", () => {
  it("dry-runs against Supabase, loads the existing index past 1,000 rows and inserts in chunks", async () => {
    const donations = Array.from({ length: 1200 }, (_, i) => ({ id: `d-${i}`, source_id: `OLD-${i}` }));
    const calls: Call[] = [];
    const client = fakeClient({ donations, profiles: [] }, calls);
    hoisted.createTenantServerClient.mockResolvedValue(client);

    const lines = ["id,email,amount,fund,donated_at"];
    for (let i = 0; i < 5000; i += 1) lines.push(`NEW-${i},,10.00,General,2026-07-06`);

    const result = await runGivingImportDryRun({
      churchId: "church-1",
      actorProfileId: "actor",
      sourceSystem: "generic_csv",
      sourceFilename: "big.csv",
      csvText: lines.join("\n"),
      timeZone: "America/Chicago",
    });

    expect(result.batchId).toBe("new-import_batches");
    expect(result.counts.create).toBe(5000);

    const donationReads = calls.filter((call) => call.table === "donations");
    expect(donationReads).toHaveLength(2); // 1,200 existing rows needed two pages
    const rowInserts = calls.filter((call) => call.table === "import_batch_rows" && call.op === "insert");
    expect(rowInserts).toHaveLength(10);
    expect(rowInserts.every((call) => (call.payload as unknown[]).length <= 500)).toBe(true);
    expect(rowInserts.reduce((sum, call) => sum + (call.payload as unknown[]).length, 0)).toBe(5000);
  });
});
