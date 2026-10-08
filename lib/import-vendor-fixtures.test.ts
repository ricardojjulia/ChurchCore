import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// G4.1: Planning Center and Breeze fixtures (tests/fixtures/imports, see its
// README for how much of each header row is verified) driven through the real
// adapters and dry-run classifiers. Only the database edges are mocked.

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => true),
  createTenantServerClient: vi.fn(),
  loadProfileLinkIndex: vi.fn(),
  loadEventTitleDayIndex: vi.fn(),
  loadGroupNameIndex: vi.fn(),
  loadMembershipPairs: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: hoisted.createTenantServerClient,
  queryTenantLocalDb: hoisted.queryTenantLocalDb,
  shouldUseLocalTenantFallback: hoisted.shouldUseLocalTenantFallback,
}));

vi.mock("@/lib/import-profile-index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/import-profile-index")>()),
  loadProfileLinkIndex: hoisted.loadProfileLinkIndex,
  loadEventTitleDayIndex: hoisted.loadEventTitleDayIndex,
  loadGroupNameIndex: hoisted.loadGroupNameIndex,
  loadMembershipPairs: hoisted.loadMembershipPairs,
}));

vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));

import { runAttendanceImportDryRun } from "@/lib/attendance-import-dry-run";
import { runEventsImportDryRun } from "@/lib/events-import-dry-run";
import {
  commitGivingImportBatch,
  runGivingImportDryRun,
} from "@/lib/giving-import-dry-run";
import {
  commitGroupsImportBatch,
  runGroupsImportDryRun,
} from "@/lib/groups-import-dry-run";
import { computeIgnoredColumns, parseImportCsv } from "@/lib/import-normalize";
import {
  classifyPeopleImportRows,
  parseImportRows,
  runPeopleHouseholdImportDryRun,
} from "@/lib/people-import-dry-run";
import { peopleConsumedAliases } from "@/lib/people-import-source-adapters";

const TZ = "America/Chicago";
const CHURCH_ID = "church-1";
const BATCH_ID = "batch-1";

function fixture(path: string) {
  return readFileSync(join(process.cwd(), "tests/fixtures/imports", path), "utf8");
}

type Captured = {
  summary: Record<string, unknown> | null;
  importType: string | null;
  payloads: unknown[];
  rawPayloads: Array<Record<string, unknown>>;
  reasons: Array<string | null>;
};

let captured: Captured;
let donationsOnFile: Array<{ id: string; source_id: string }> = [];

function installDatabase(options: { people?: Array<Record<string, unknown>> } = {}) {
  captured = { summary: null, importType: null, payloads: [], rawPayloads: [], reasons: [] };
  hoisted.shouldUseLocalTenantFallback.mockReturnValue(true);
  hoisted.queryTenantLocalDb.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("insert into public.import_batches")) {
      captured.summary = JSON.parse(params[4] as string);
      captured.importType = (params[5] as string | undefined) ?? (sql.match(/values \(\$1, '(\w+)'/)?.[1] ?? null);
      return { rows: [{ id: BATCH_ID }] };
    }
    if (sql.includes("insert into public.import_batch_rows")) {
      captured.rawPayloads.push(JSON.parse(params[3] as string));
      captured.payloads.push(JSON.parse(params[4] as string));
      captured.reasons.push((params[6] as string | null) ?? null);
      return { rows: [] };
    }
    if (sql.includes("from public.profiles")) return { rows: options.people ?? [] };
    if (sql.includes("from public.families")) return { rows: [] };
    if (sql.includes("from public.donations") && sql.includes("source_id is not null")) {
      return { rows: donationsOnFile };
    }
    if (sql.includes("source_id is not null")) return { rows: [] };
    if (sql.includes("status = 'present'")) return { rows: [] };
    return { rows: [] };
  });
}

const profileIndex = (byMemberNumber: Record<string, string>, byEmail: Record<string, string> = {}) => ({
  byMemberNumber: new Map(Object.entries(byMemberNumber)),
  byEmail: new Map(Object.entries(byEmail)),
});

beforeEach(() => {
  vi.clearAllMocks();
  donationsOnFile = [];
  installDatabase();
  hoisted.loadProfileLinkIndex.mockResolvedValue(profileIndex({}));
  hoisted.loadEventTitleDayIndex.mockResolvedValue(new Map());
  hoisted.loadGroupNameIndex.mockResolvedValue(new Map());
  hoisted.loadMembershipPairs.mockResolvedValue(new Set());
});

function expectNoCellValues(result: { rows?: unknown; ignoredColumns: string[] }, forbidden: string[]) {
  const text = JSON.stringify({
    ignored: result.ignoredColumns,
    reasons: captured.reasons,
    summary: captured.summary,
  });
  for (const value of forbidden) {
    expect(text).not.toContain(value);
  }
}

describe("Planning Center people fixtures", () => {
  it("maps names, the first non-empty email, phones, ids and households", () => {
    const csv = parseImportCsv(fixture("planning-center/people.csv"));
    expect(csv.errors).toEqual([]);
    const rows = parseImportRows(csv.rows, "planning_center");

    expect(rows.map((row) => row.fullName)).toEqual([
      "Ada Lovelace",
      "Charles Babbage", // Given Name used because First Name is blank
      "Grace Hopper",
      "Ben Lovelace",
    ]);
    expect(rows.map((row) => row.email)).toEqual([
      "ada.lovelace@example.org", // Home Email before Work Email
      "charles.babbage@example.org", // Work Email
      "grace.hopper@example.org", // Other Email
      null,
    ]);
    expect(rows.map((row) => row.memberNumber)).toEqual(["90001", "90002", "90003", "90004"]);
    expect(rows.map((row) => row.phone)).toEqual(["5550100101", "5550100202", "5550100303", null]);
    expect(rows.map((row) => row.householdName)).toEqual([
      "Lovelace Household",
      "Babbage Household",
      "Hopper Household",
      "Lovelace Household",
    ]);
  });

  it("creates every person, plans three households, and reports ignored columns by name only", async () => {
    const result = await runPeopleHouseholdImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "planning_center",
      sourceFilename: "people.csv",
      csvText: fixture("planning-center/people.csv"),
    });

    expect(result.counts).toEqual({ create: 4, update: 0, skip: 0, reject: 0 });
    expect(result.householdCreates).toBe(3);
    expect(result.ignoredColumns).toEqual(
      expect.arrayContaining([
        "Nickname",
        "Grade",
        "School",
        "Medical Notes",
        "Child",
        "Birthdate",
        "Background Check Cleared",
        "Household Primary Contact",
      ]),
    );
    for (const used of ["Person ID", "Given Name", "First Name", "Last Name", "Home Email", "Mobile Phone Number", "Household Name"]) {
      expect(result.ignoredColumns).not.toContain(used);
    }
    expect(captured.summary?.ignoredColumns).toEqual(result.ignoredColumns);
    expectNoCellValues(result, ["Peanut", "Addie", "Example Elementary", "Lovelace"]);
  });

  it("is not thrown off by a BOM, CRLF line ends or trailing blank and comma-only rows", async () => {
    const result = await runPeopleHouseholdImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "planning_center",
      sourceFilename: "people.csv",
      csvText: fixture("planning-center/people-bom-blank-rows.csv"),
    });

    expect(result.counts.create).toBe(2);
    expect(result.counts.reject).toBe(0);
    expect(result.rows.map((row) => row.memberNumber)).toEqual(["90010", "90011"]);
    expect(result.ignoredColumns).toEqual([]);
  });

  it("keeps the first of two identical headers and reports the second as ignored", async () => {
    const result = await runPeopleHouseholdImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "planning_center",
      sourceFilename: "people.csv",
      csvText: fixture("planning-center/people-duplicate-headers.csv"),
    });

    expect(result.rows[0]?.email).toBe("alan.turing@example.org");
    expect(result.ignoredColumns).toEqual(["Home Email__2"]);
  });

  it("still reads a plain generic_csv file the old way", () => {
    const csv = parseImportCsv("full_name,email,phone,member_number,household_name\nAda Lovelace,ada@example.org,555-0101,M-1,River\n");
    const [row] = parseImportRows(csv.rows, "generic_csv");
    expect(row).toMatchObject({
      fullName: "Ada Lovelace",
      email: "ada@example.org",
      phone: "5550101",
      memberNumber: "M-1",
      householdName: "River",
    });
  });
});

describe("Breeze people fixture", () => {
  it("joins first and last name, takes the first of several emails, and ignores Family ID", async () => {
    const result = await runPeopleHouseholdImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "breeze",
      sourceFilename: "people.csv",
      csvText: fixture("breeze/people.csv"),
    });

    expect(result.counts).toEqual({ create: 4, update: 0, skip: 0, reject: 0 });
    expect(result.rows.map((row) => row.fullName)).toEqual(["Maria Santos", "Joel Rivera", "Ruth Chen", "Sam Okafor"]);
    expect(result.rows.map((row) => row.email)).toEqual([
      "maria.santos@example.org",
      "joel.rivera@example.org",
      "ruth.chen@example.org",
      null,
    ]);
    expect(result.rows.map((row) => row.memberNumber)).toEqual(["5001", "5002", "5003", "5004"]);
    expect(result.rows.map((row) => row.phone)).toEqual(["5550200101", "5550200202", "5550200304", null]);
    expect(result.householdCreates).toBe(0);
    expect(result.ignoredColumns).toEqual(
      expect.arrayContaining(["Nickname", "Age", "Family ID", "Family Role", "Grade", "Maiden Name"]),
    );
    expectNoCellValues(result, ["maria", "03/14/1985", "Springfield"]);
  });

  it("rejects a malformed address instead of silently dropping it", () => {
    const [row] = parseImportRows(
      parseImportCsv("Breeze ID,First Name,Last Name,Email\n7,Ann,Lee,not-an-email\n").rows,
      "breeze",
    );
    const result = classifyPeopleImportRows([row], {
      byMemberNumber: new Map(),
      byEmail: new Map(),
      byNamePhone: new Map(),
      familyNames: new Set(),
    });
    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.reason).toBe("Invalid email format.");
  });

  it("re-importing matches by Breeze ID instead of creating again", () => {
    const rows = parseImportRows(parseImportCsv(fixture("breeze/people.csv")).rows, "breeze");
    const result = classifyPeopleImportRows(rows, {
      byMemberNumber: new Map([
        ["5001", "p1"],
        ["5002", "p2"],
        ["5003", "p3"],
        ["5004", "p4"],
      ]),
      byEmail: new Map(),
      byNamePhone: new Map(),
      familyNames: new Set(),
      emailById: new Map([
        ["p1", "maria.santos@example.org"],
        ["p2", "joel.rivera@example.org"],
      ]),
    });
    expect(result.counts).toEqual({ create: 0, update: 4, skip: 0, reject: 0 });
  });

  it("rejects a member number that already belongs to a person with a different email", () => {
    const rows = parseImportRows(parseImportCsv(fixture("breeze/people.csv")).rows, "breeze");
    const result = classifyPeopleImportRows(rows, {
      byMemberNumber: new Map([["5001", "other-person"]]),
      byEmail: new Map(),
      byNamePhone: new Map(),
      familyNames: new Set(),
      emailById: new Map([["other-person", "someone.else@example.org"]]),
    });
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Member number belongs to a different person.");
    expect(result.counts).toMatchObject({ reject: 1, create: 3 });
  });
});

describe("Planning Center giving fixture", () => {
  const run = (csvText = fixture("planning-center/giving.csv")) =>
    runGivingImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "planning_center",
      sourceFilename: "giving.csv",
      csvText,
      timeZone: TZ,
    });

  beforeEach(() => {
    hoisted.loadProfileLinkIndex.mockResolvedValue(
      profileIndex({}, { "ada.lovelace@example.org": "p-ada", "charles.babbage@example.org": "p-charles", "grace.hopper@example.org": "p-grace" }),
    );
  });

  it("classifies the file and parses $1,250.00, mm/dd/yyyy and ISO dates", async () => {
    const result = await run();

    expect(result.counts).toEqual({ create: 6, update: 0, skip: 0, reject: 2, unmatchedDonors: 1 });
    const [big, remote, repeatA, repeatB, unmatched, noDonor, zero, negative] = result.rows;
    expect(big).toMatchObject({ action: "create", donorResolved: true, reason: null });
    expect(big.sourceId).toMatch(/^pco-giv-[0-9a-f]{24}-1$/);
    expect(remote).toMatchObject({ action: "create", sourceId: "PCO-REMOTE-77" });
    expect(repeatA.sourceId).toMatch(/-1$/);
    expect(repeatB.sourceId).toBe(repeatA.sourceId.replace(/-1$/, "-2"));
    expect(unmatched).toMatchObject({ action: "create", donorResolved: false });
    expect(unmatched.reason).toBe("Donor not matched — donation will be recorded as anonymous.");
    expect(noDonor).toMatchObject({ action: "create", reason: null });
    expect(zero).toMatchObject({ action: "reject", reason: "Invalid donation amount — must be a positive number." });
    expect(negative).toMatchObject({ action: "reject", reason: "Invalid donation amount — must be a positive number." });

    const payloads = captured.payloads as Array<Record<string, unknown>>;
    expect(payloads[0]).toMatchObject({
      amountCents: 125000,
      profileId: "p-ada",
      isAnonymous: false,
      donatedInstant: "2026-09-06T17:00:00.000Z", // noon CDT
      synthetic: true,
    });
    expect(payloads[1]).toMatchObject({ donatedInstant: "2026-09-13T17:00:00.000Z", synthetic: false });
    expect(payloads[4]).toMatchObject({ profileId: null, isAnonymous: true });
    expect(payloads[5]).toMatchObject({ profileId: null, isAnonymous: true });
  });

  it("gives the same gift the same id wherever it sits in the file", async () => {
    const first = await run();
    const lines = fixture("planning-center/giving.csv").trim().split("\n");
    const reversed = [lines[0], ...lines.slice(1).reverse()].join("\n");
    const second = await run(reversed);

    const ids = (rows: typeof first.rows) => rows.filter((row) => row.action === "create").map((row) => row.sourceId).sort();
    expect(ids(second.rows)).toEqual(ids(first.rows));
  });

  it("skips an already imported vendor row but still updates an explicit id", async () => {
    const first = await run();
    donationsOnFile = first.rows
      .filter((row) => row.action === "create")
      .map((row, i) => ({ id: `d-${i}`, source_id: row.sourceId }));

    const again = await run();
    expect(again.counts.create).toBe(0);
    expect(again.counts.update).toBe(1); // the Remote ID row
    expect(again.counts.skip).toBe(5);
    expect(again.rows.filter((row) => row.action === "skip").every((row) => row.reason === "Already imported.")).toBe(true);
  });

  it("lists unused export columns by header name only", async () => {
    const result = await run();
    expect(result.ignoredColumns).toEqual(
      expect.arrayContaining(["Payment method", "Donor first name", "Donor last name", "Donor phone", "Donor number", "Fees", "Campus", "Admin notes", "Labels", "Check date"]),
    );
    for (const used of ["Donation amount", "Received date", "Fund", "Donor email", "Remote ID", "Memo", "Check number"]) {
      expect(result.ignoredColumns).not.toContain(used);
    }
    expectNoCellValues(result, ["Lovelace", "Plate offering", "Building fund"]);
  });
});

describe("Breeze giving fixture", () => {
  const run = (csvText = fixture("breeze/giving.csv")) =>
    runGivingImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "breeze",
      sourceFilename: "giving.csv",
      csvText,
      timeZone: TZ,
    });

  beforeEach(() => {
    hoisted.loadProfileLinkIndex.mockResolvedValue(profileIndex({ "5001": "p-maria", "5002": "p-joel", "5003": "p-ruth" }));
  });

  it("links by Breeze ID, treats Anonymous as anonymous without a warning, and counts unmatched ids", async () => {
    const result = await run();

    expect(result.counts).toEqual({ create: 5, update: 0, skip: 0, reject: 2, unmatchedDonors: 1 });
    const payloads = captured.payloads as Array<Record<string, unknown>>;
    expect(payloads[0]).toMatchObject({ profileId: "p-maria", isAnonymous: false, amountCents: 10000 });
    expect(payloads[2]).toMatchObject({ profileId: "p-joel" });
    expect(payloads[3]).toMatchObject({ profileId: null, isAnonymous: true, anonymousDonor: true });
    expect(result.rows[3]).toMatchObject({ action: "create", reason: null });
    expect(payloads[4]).toMatchObject({ profileId: null, isAnonymous: true });
    expect(result.rows[4].reason).toBe("Donor not matched — donation will be recorded as anonymous.");
  });

  it("uses Processor ID as the source id when present and numbers genuine repeats", async () => {
    const result = await run();
    expect(result.rows[2].sourceId).toBe("ch_example_0001");
    expect(result.rows[0].sourceId).toMatch(/^brz-giv-[0-9a-f]{24}-1$/);
    expect(result.rows[1].sourceId).toBe(result.rows[0].sourceId.replace(/-1$/, "-2"));
    expect(result.rows[0].action).toBe("create");
    expect(result.rows[1].action).toBe("create");
  });

  it("rejects zero and negative amounts", async () => {
    const result = await run();
    expect(result.rows[5]).toMatchObject({ action: "reject" });
    expect(result.rows[6]).toMatchObject({ action: "reject" });
  });

  it("carries the new fields through to commit (church time zone applied, donor linked)", async () => {
    await run();
    const rowsForCommit = (captured.payloads as Array<Record<string, unknown>>).map((payload, i) => ({
      normalized_payload: payload,
      classification: captured.reasons[i] === undefined ? "create" : "create",
    }));
    const inserts: unknown[][] = [];
    hoisted.queryTenantLocalDb.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      }
      if (sql.includes("from public.import_batch_rows")) {
        // Only create rows: the zero and negative amounts were rejected at dry run.
        return { rows: rowsForCommit.slice(0, 5) };
      }
      if (sql.includes("from public.donations")) return { rows: [] };
      if (sql.includes("insert into public.donations")) {
        inserts.push(params);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await commitGivingImportBatch({ churchId: CHURCH_ID, actorProfileId: "actor", batchId: BATCH_ID });
    expect(result).toMatchObject({ status: "committed", created: 5, failed: 0 });

    // params: church, source_id, profile_id, email, cents, fund, recurring, anonymous, note, created_at
    expect(inserts[0][2]).toBe("p-maria");
    expect(inserts[0][4]).toBe(10000);
    expect(inserts[0][7]).toBe(false);
    expect(inserts[0][9]).toBe("2026-09-06T17:00:00.000Z");
    expect(inserts[3][2]).toBeNull();
    expect(inserts[3][7]).toBe(true);
  });
});

describe("events fixtures", () => {
  it("reads Planning Center dates in the church time zone", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "planning_center",
      sourceFilename: "events.csv",
      csvText: fixture("planning-center/events.csv"),
      timeZone: TZ,
    });

    expect(result.counts).toMatchObject({ create: 2, reject: 0 });
    const payloads = captured.payloads as Array<Record<string, unknown>>;
    expect(payloads[0]).toMatchObject({ startsAtInstant: "2026-09-10T00:00:00.000Z", endsAtInstant: "2026-09-10T01:00:00.000Z" });
    expect(payloads[1]).toMatchObject({ startsAtInstant: "2026-09-26T22:30:00.000Z", endsAtInstant: "2026-09-27T01:00:00.000Z" });
    expect(result.ignoredColumns).toEqual([]);
  });

  it("reads Breeze am/pm dates and keeps two services on different days apart", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "breeze",
      sourceFilename: "events.csv",
      csvText: fixture("breeze/events.csv"),
      timeZone: TZ,
    });

    expect(result.counts).toMatchObject({ create: 3, reject: 0 });
    expect((captured.payloads as Array<Record<string, unknown>>)[0]).toMatchObject({
      startsAtInstant: "2026-09-06T15:30:00.000Z",
    });
  });

  it("rejects an impossible date with a header-only reason", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: "id,title,starts_at,ends_at\nE-1,Picnic,02/30/2026,03/01/2026\n",
      timeZone: TZ,
    });
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Missing or invalid starts_at — use YYYY-MM-DD or mm/dd/yyyy.");
    expect(result.rows[0]?.reason).not.toContain("02/30");
  });
});

describe("Breeze attendance fixture", () => {
  const run = () =>
    runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "breeze",
      sourceFilename: "attendance.csv",
      csvText: fixture("breeze/attendance.csv"),
      timeZone: TZ,
    });

  beforeEach(() => {
    hoisted.loadProfileLinkIndex.mockResolvedValue(profileIndex({ "5001": "p-maria", "5002": "p-joel", "5003": "p-ruth" }));
    hoisted.loadEventTitleDayIndex.mockResolvedValue(
      new Map([
        ["sunday service|2026-09-06", ["e-sun-1"]],
        ["sunday service|2026-09-13", ["e-sun-2"]],
        ["youth night|2026-09-11", ["e-youth"]],
      ]),
    );
  });

  it("matches person by Breeze ID and event by name and church-local day", async () => {
    const result = await run();

    expect(result.counts).toEqual({
      create: 3,
      update: 0,
      skip: 4,
      reject: 0,
      unmatchedProfiles: 1,
      unmatchedEvents: 1,
      skippedAnonymous: 1,
    });
    const payloads = captured.payloads as Array<Record<string, unknown>>;
    expect(payloads[0]).toMatchObject({ profileId: "p-maria", eventId: "e-sun-1", checkedInInstant: "2026-09-06T15:30:00.000Z" });
    expect(payloads[4]).toMatchObject({ profileId: "p-ruth", eventId: "e-youth", checkedInInstant: "2026-09-12T00:00:00.000Z" });
  });

  it("skips anonymous head-counts, unmatched people, unmatched events and repeats with a reason", async () => {
    const result = await run();
    expect(result.rows.map((row) => row.reason)).toEqual([
      null,
      null,
      "Duplicate present attendance for this profile and event in import file.",
      "Anonymous head-counts are not supported.",
      null,
      "Event not matched — no event with that name on that date.",
      "Person not matched — attendance needs an existing person.",
    ]);
  });

  it("derives the same id for the same check-in wherever it sits, with a repeat counter", async () => {
    const first = await run();
    expect(first.rows[0].sourceId).toMatch(/^brz-att-[0-9a-f]{24}-1$/);
    expect(first.rows[2].sourceId).toBe(first.rows[0].sourceId.replace(/-1$/, "-2"));
  });

  it("refuses to guess between two events with the same name on the same day", async () => {
    hoisted.loadEventTitleDayIndex.mockResolvedValue(new Map([["sunday service|2026-09-06", ["a", "b"]]]));
    const result = await run();
    expect(result.rows[0]?.action).toBe("skip");
    expect(result.rows[0]?.reason).toBe("Event not matched — more than one event has that name on that date.");
  });

  it("ignores Count and names no cell values", async () => {
    const result = await run();
    expect(result.ignoredColumns).toEqual(["First Name", "Last Name", "Count"]);
    expectNoCellValues(result, ["Maria", "Santos", "Sunday Service"]);
  });
});

describe("Breeze tags fixture", () => {
  const run = () =>
    runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "breeze",
      sourceFilename: "tags.csv",
      csvText: fixture("breeze/tags.csv"),
    });

  beforeEach(() => {
    hoisted.loadProfileLinkIndex.mockResolvedValue(
      profileIndex({ "5001": "p-maria", "5002": "p-joel", "5003": "p-ruth", "5004": "p-sam" }),
    );
    // An existing group whose name differs only in case from the tag.
    hoisted.loadGroupNameIndex.mockResolvedValue(new Map([["hospitality", "g-hosp"]]));
  });

  it("detects memberships mode and matches existing groups by case-insensitive name", async () => {
    const result = await run();

    expect(result.mode).toBe("memberships");
    expect(result.totalRows).toBe(7);
    expect(result.rows).toEqual([]);
    expect(result.counts).toMatchObject({ create: 5, skip: 2, reject: 0, unmatchedMembers: 1 });
    expect(result.groupCreates).toBe(2);
    expect(captured.importType).toBe("group_memberships_csv");

    const [maria, joel, ruth, duplicate, adult, newMembers, unknown] = result.membershipRows;
    expect(maria).toMatchObject({ groupName: "Hospitality", folder: "Ministries", groupExists: true, action: "create", reason: "Joins existing group Hospitality" });
    expect(adult.reason).toBeNull();
    expect(joel.action).toBe("create");
    expect(ruth).toMatchObject({ groupName: "Hospitality", folder: null, action: "create" });
    expect(duplicate).toMatchObject({ action: "skip", reason: "Duplicate membership in import file." });
    expect(adult).toMatchObject({ groupName: "Adult Class", groupExists: false, action: "create" });
    expect(newMembers).toMatchObject({ groupName: "New Members 2026", folder: "Youth>>Students", action: "create" });
    expect(unknown).toMatchObject({ action: "skip", profileResolved: false });
    expect(unknown.reason).toBe("Person not matched — import people first.");
    expect(result.ignoredColumns).toEqual(["First Name", "Last Name"]);
  });

  it("skips people who are already in the group on a re-import", async () => {
    hoisted.loadMembershipPairs.mockResolvedValue(new Set(["g-hosp:p-maria", "g-hosp:p-joel", "g-hosp:p-ruth"]));
    const result = await run();
    expect(result.counts.create).toBe(2);
    expect(result.membershipRows.filter((row) => row.reason === "Already a member of this group.")).toHaveLength(3);
  });

  it("truncates long tag text to 200 characters", async () => {
    const longTag = "x".repeat(500);
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "breeze",
      sourceFilename: "tags.csv",
      csvText: `Breeze ID,Tag Name\n5001,${longTag}\n`,
    });
    expect(result.membershipRows[0]?.groupName).toHaveLength(200);
  });

  it("a groups file without a Tag Name column still imports groups as before", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: "id,name\nG-1,Monday Study\n",
    });
    expect(result.mode).toBe("groups");
    expect(result.rows).toHaveLength(1);
    expect(result.membershipRows).toEqual([]);
    expect(captured.importType).toBe("groups_csv");
  });

  describe("commit", () => {
    type Operation = { table: string; op: string; payload?: Record<string, unknown> };
    let operations: Operation[];
    let existingMembership: boolean;

    function fakeClient(batchRows: unknown[]) {
      let nextGroup = 0;
      return {
        from(table: string) {
          const state: { op: string; payload?: Record<string, unknown> } = { op: "select" };
          const builder: Record<string, unknown> = new Proxy(
            {},
            {
              get(_target, prop: string) {
                if (prop === "then") {
                  return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
                    operations.push({ table, op: state.op, payload: state.payload });
                    let result: { data: unknown; error: null } = { data: null, error: null };
                    if (state.op === "update") {
                      result = { data: [{ id: "row-1" }], error: null };
                    } else if (table === "import_batches" && state.op === "select") {
                      result = { data: { status: "dry_run_completed", dry_run: true }, error: null };
                    } else if (table === "import_batch_rows" && state.op === "select") {
                      result = { data: batchRows, error: null };
                    } else if (table === "profiles" && state.op === "select") {
                      result = { data: ["p-maria", "p-joel", "p-ruth", "p-sam"].map((id) => ({ id })), error: null };
                    } else if (table === "groups" && state.op === "insert") {
                      result = { data: { id: `new-group-${(nextGroup += 1)}` }, error: null };
                    } else if (table === "group_members" && state.op === "insert") {
                      result = { data: { id: "gm-new" }, error: null };
                    } else if (table === "group_members" && state.op === "select") {
                      result = { data: existingMembership ? { id: "gm-1" } : null, error: null };
                    }
                    return Promise.resolve(result).then(resolve, reject);
                  };
                }
                return (...args: unknown[]) => {
                  if (prop === "insert" || prop === "update") {
                    state.op = prop;
                    state.payload = args[0] as Record<string, unknown>;
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

    it("creates missing groups closed, adds members once, and never duplicates", async () => {
      await run();
      const batchRows = (captured.payloads as Array<Record<string, unknown>>)
        .map((normalized_payload) => ({ normalized_payload }))
        // create rows only: skip/reject rows are never committed
        .filter((_row, i) => [0, 1, 2, 4, 5].includes(i));

      operations = [];
      existingMembership = false;
      hoisted.shouldUseLocalTenantFallback.mockReturnValue(false);
      hoisted.createTenantServerClient.mockResolvedValue(fakeClient(batchRows));

      const result = await commitGroupsImportBatch({ churchId: CHURCH_ID, actorProfileId: "actor", batchId: BATCH_ID });
      expect(result).toMatchObject({ status: "committed", created: 5, failed: 0 });

      const groupInserts = operations.filter((o) => o.table === "groups" && o.op === "insert");
      expect(groupInserts.map((o) => o.payload?.name)).toEqual(["Adult Class", "New Members 2026"]);
      for (const insert of groupInserts) {
        expect(insert.payload).toMatchObject({ church_id: CHURCH_ID, category: "general", is_open: false });
      }
      expect(groupInserts[1].payload?.description).toBe("Imported from Breeze tag folder: Youth>>Students");

      const memberInserts = operations.filter((o) => o.table === "group_members" && o.op === "insert");
      expect(memberInserts).toHaveLength(5);
      expect(memberInserts[0].payload).toMatchObject({
        church_id: CHURCH_ID,
        group_id: "g-hosp",
        profile_id: "p-maria",
        role: "member",
        status: "active",
      });
    });

    it("does not insert a membership that already exists", async () => {
      await run();
      const batchRows = (captured.payloads as Array<Record<string, unknown>>)
        .map((normalized_payload) => ({ normalized_payload }))
        .slice(0, 1);

      operations = [];
      existingMembership = true;
      hoisted.shouldUseLocalTenantFallback.mockReturnValue(false);
      hoisted.createTenantServerClient.mockResolvedValue(fakeClient(batchRows));

      const result = await commitGroupsImportBatch({ churchId: CHURCH_ID, actorProfileId: "actor", batchId: BATCH_ID });
      expect(result).toMatchObject({ created: 0, failed: 0 });
      expect(operations.filter((o) => o.table === "group_members" && o.op === "insert")).toHaveLength(0);
    });

    it("refuses a membership for a person who is not in this church", async () => {
      await run();
      const batchRows = [
        { normalized_payload: { kind: "group_membership", groupName: "Hospitality", folder: null, profileId: "profile-of-another-church" } },
      ];

      operations = [];
      existingMembership = false;
      hoisted.shouldUseLocalTenantFallback.mockReturnValue(false);
      hoisted.createTenantServerClient.mockResolvedValue(fakeClient(batchRows));

      const result = await commitGroupsImportBatch({ churchId: CHURCH_ID, actorProfileId: "actor", batchId: BATCH_ID });
      expect(result).toMatchObject({ created: 0, failed: 1 });
      expect(operations.filter((o) => o.table === "group_members" && o.op === "insert")).toHaveLength(0);
    });
  });
});

describe("ignored-column helper against every vendor people header", () => {
  it("never lists a header the people adapter reads", () => {
    const pco = parseImportCsv(fixture("planning-center/people.csv")).headers;
    const ignored = computeIgnoredColumns(pco, peopleConsumedAliases("planning_center"));
    expect(ignored).not.toContain("Given Name");
    expect(ignored).toContain("Nickname");
  });
});

describe("staged raw payloads hold mapped columns only (R11)", () => {
  it("people: a PCO file's Medical Notes, School and Grade never reach raw_payload", async () => {
    await runPeopleHouseholdImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "planning_center",
      sourceFilename: "people.csv",
      csvText: fixture("planning-center/people.csv"),
    });
    const text = JSON.stringify(captured.rawPayloads);
    expect(text).not.toMatch(/Peanut|Example Elementary|Medical Notes|Addie/);
  });

  it("giving: ignored columns are dropped from raw_payload, mapped ones kept", async () => {
    hoisted.loadProfileLinkIndex.mockResolvedValue(profileIndex({}));
    await runGivingImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "actor",
      sourceSystem: "planning_center",
      sourceFilename: "giving.csv",
      csvText: fixture("planning-center/giving.csv"),
      timeZone: TZ,
    });
    const first = captured.rawPayloads[0];
    expect(first).toHaveProperty("Donation amount", "$1,250.00");
    expect(first).toHaveProperty("Donor email");
    for (const ignored of ["Donor first name", "Donor last name", "Admin notes", "Payment method", "Donor phone"]) {
      expect(first).not.toHaveProperty(ignored);
    }
  });

  it("attendance and tags: First Name, Last Name and Count are not staged", async () => {
    hoisted.loadProfileLinkIndex.mockResolvedValue(profileIndex({ "5001": "p" }));
    await runAttendanceImportDryRun({ churchId: CHURCH_ID, actorProfileId: "a", sourceSystem: "breeze", sourceFilename: "a.csv", csvText: fixture("breeze/attendance.csv"), timeZone: TZ });
    expect(captured.rawPayloads[0]).toEqual({ "Breeze ID": "5001", "Event Name": "Sunday Service", Date: "09/06/26 10:30am" });

    installDatabase();
    await runGroupsImportDryRun({ churchId: CHURCH_ID, actorProfileId: "a", sourceSystem: "breeze", sourceFilename: "t.csv", csvText: fixture("breeze/tags.csv") });
    expect(captured.rawPayloads[0]).toEqual({ "Breeze ID": "5001", "Tag Name": "Ministries>>Hospitality" });
  });
});

describe("Planning Center status and membership (R6)", () => {
  it("maps Inactive and Visitor, leaves everything else active, on create only", async () => {
    const csv = [
      "Person ID,First Name,Last Name,Status,Membership",
      "1,Ina,Ctive,Inactive,Member",
      "2,Vic,Sitor,Active,Regular Visitor",
      "3,Mem,Ber,Active,Member",
      "4,Una,Set,,",
      "5,Both,Cases,INACTIVE,Visitor",
    ].join("\n");
    const result = await runPeopleHouseholdImportDryRun({ churchId: CHURCH_ID, actorProfileId: "a", sourceSystem: "planning_center", sourceFilename: "p.csv", csvText: csv });
    expect(result.rows.map((row) => row.membershipStatus)).toEqual(["inactive", "visitor", undefined, undefined, "inactive"]);
    expect(result.ignoredColumns).toEqual([]);
    expect((captured.payloads as Array<Record<string, unknown>>).map((p) => p.membershipStatus)).toEqual(["inactive", "visitor", undefined, undefined, "inactive"]);
  });

  it("Breeze and generic files ignore a Status column", () => {
    const rows = parseImportRows(parseImportCsv("Breeze ID,First Name,Last Name,Status\n1,A,B,Inactive\n").rows, "breeze");
    expect(rows[0].membershipStatus).toBeUndefined();
  });
});

describe("events: an unknown source system does not crash the classifier (R13)", () => {
  it("falls back to the generic aliases", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: "a",
      sourceSystem: "mystery" as never,
      sourceFilename: "e.csv",
      csvText: "id,title,starts_at,ends_at,capacity\nE-1,Picnic,2026-09-06T10:00:00,2026-09-06T12:00:00,20\n",
      timeZone: TZ,
    });
    expect(result.counts.create).toBe(1);
    expect(result.totalRows).toBe(1);
  });
});
