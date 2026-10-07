import { describe, expect, it } from "vitest";

import { normalizeAttendanceImportSourceRow } from "@/lib/attendance-import-source-adapters";

describe("normalizeAttendanceImportSourceRow — generic_csv", () => {
  it("resolves all 5 canonical fields from generic_csv aliases", () => {
    const row = normalizeAttendanceImportSourceRow(
      {
        attendance_id: "ATT-001",
        email: "jane@example.com",
        event_source_id: "EVT-100",
        checked_in_at: "2026-07-06T10:00:00Z",
        attendance_status: "present",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("ATT-001");
    expect(row.profileEmail).toBe("jane@example.com");
    expect(row.eventSourceId).toBe("EVT-100");
    expect(row.checkedInAt).toBe("2026-07-06T10:00:00Z");
    expect(row.status).toBe("present");
  });

  it("auto-generates ATT-1 when no id column present (rowIndex 0)", () => {
    const row = normalizeAttendanceImportSourceRow(
      { email: "jane@example.com" },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("ATT-1");
  });

  it("auto-generates ATT-3 for rowIndex 2", () => {
    const row = normalizeAttendanceImportSourceRow(
      { email: "jane@example.com" },
      "generic_csv",
      2,
    );

    expect(row.sourceId).toBe("ATT-3");
  });

  it("uses id over source_id over attendance_id for sourceId", () => {
    const row = normalizeAttendanceImportSourceRow(
      {
        id: "FIRST",
        source_id: "SECOND",
        attendance_id: "THIRD",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("FIRST");
  });

  it("falls back to source_id when id is absent", () => {
    const row = normalizeAttendanceImportSourceRow(
      {
        source_id: "SRC-99",
        attendance_id: "ATT-99",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("SRC-99");
  });

  it("returns null for optional fields when absent", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "A-1" },
      "generic_csv",
      0,
    );

    expect(row.profileEmail).toBeNull();
    expect(row.eventSourceId).toBeNull();
    expect(row.checkedInAt).toBeNull();
    expect(row.status).toBeNull();
  });

  it("passes status through raw", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "A-1", status: "absent" },
      "generic_csv",
      0,
    );

    expect(row.status).toBe("absent");
  });

  it("resolves event_id alias for eventSourceId", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "A-1", event_id: "E-10" },
      "generic_csv",
      0,
    );

    expect(row.eventSourceId).toBe("E-10");
  });

  it("resolves check_in_time alias for checkedInAt", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "A-1", check_in_time: "2026-07-01T09:00:00Z" },
      "generic_csv",
      0,
    );

    expect(row.checkedInAt).toBe("2026-07-01T09:00:00Z");
  });
});

describe("normalizeAttendanceImportSourceRow — planning_center", () => {
  it("maps planning_center aliases correctly", () => {
    const row = normalizeAttendanceImportSourceRow(
      {
        id: "pc-42",
        person_email: "john@example.com",
        event_id: "pc-event-10",
        attended_at: "2026-08-01T10:00:00Z",
        status: "present",
      },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-42");
    expect(row.profileEmail).toBe("john@example.com");
    expect(row.eventSourceId).toBe("pc-event-10");
    expect(row.checkedInAt).toBe("2026-08-01T10:00:00Z");
    expect(row.status).toBe("present");
  });

  it("maps person_email to profileEmail", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "pc-1", person_email: "alice@example.com" },
      "planning_center",
      0,
    );

    expect(row.profileEmail).toBe("alice@example.com");
  });

  it("maps attended_at to checkedInAt", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "pc-2", attended_at: "2026-07-15T09:00:00Z" },
      "planning_center",
      0,
    );

    expect(row.checkedInAt).toBe("2026-07-15T09:00:00Z");
  });

  it("prefers checked_in_at over attended_at for checkedInAt", () => {
    const row = normalizeAttendanceImportSourceRow(
      {
        id: "pc-3",
        checked_in_at: "2026-07-15T09:00:00Z",
        attended_at: "2026-07-15T10:00:00Z",
      },
      "planning_center",
      0,
    );

    expect(row.checkedInAt).toBe("2026-07-15T09:00:00Z");
  });

  it("falls back to attendance_id for sourceId when id is absent", () => {
    const row = normalizeAttendanceImportSourceRow(
      { attendance_id: "pc-att-99" },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-att-99");
  });
});

describe("normalizeAttendanceImportSourceRow — breeze", () => {
  it("maps breeze aliases correctly", () => {
    const row = normalizeAttendanceImportSourceRow(
      {
        id: "br-77",
        member_email: "sarah@example.com",
        event_id: "br-event-5",
        attended_at: "2026-07-08T09:00:00Z",
        status: "excused",
      },
      "breeze",
      0,
    );

    expect(row.sourceId).toBe("br-77");
    expect(row.profileEmail).toBe("sarah@example.com");
    expect(row.eventSourceId).toBe("br-event-5");
    expect(row.checkedInAt).toBe("2026-07-08T09:00:00Z");
    expect(row.status).toBe("excused");
  });

  it("maps member_email to profileEmail", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "br-1", member_email: "bob@example.com" },
      "breeze",
      0,
    );

    expect(row.profileEmail).toBe("bob@example.com");
  });

  it("maps attended_at to checkedInAt for breeze", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "br-2", attended_at: "2026-07-10T08:00:00Z" },
      "breeze",
      0,
    );

    expect(row.checkedInAt).toBe("2026-07-10T08:00:00Z");
  });

  it("passes status through raw for breeze", () => {
    const row = normalizeAttendanceImportSourceRow(
      { id: "br-3", status: "absent" },
      "breeze",
      0,
    );

    expect(row.status).toBe("absent");
  });

  it("falls back to attendance_id for sourceId when id absent in breeze", () => {
    const row = normalizeAttendanceImportSourceRow(
      { attendance_id: "br-att-55" },
      "breeze",
      0,
    );

    expect(row.sourceId).toBe("br-att-55");
  });
});

describe("normalizeAttendanceImportSourceRow — Breeze export headers (G4.1)", () => {
  it("reads Breeze ID, Event Name and Date; derives a content id", () => {
    const row = normalizeAttendanceImportSourceRow(
      { "Breeze ID": "5001", "First Name": "Maria", "Event Name": "Sunday Service", Date: "09/06/26 10:30am", Count: "1" },
      "breeze",
      3,
      { timeZone: "America/Chicago" },
    );

    expect(row).toMatchObject({
      memberNumber: "5001",
      anonymousPerson: false,
      eventName: "Sunday Service",
      checkedInAt: "09/06/26 10:30am",
      synthetic: true,
    });
    expect(row.sourceId).toMatch(/^brz-att-[0-9a-f]{24}$/);
  });

  it("gives the same id for the same check-in at any position and a different id for another time", () => {
    const raw = { "Breeze ID": "5001", "Event Name": "Sunday Service", Date: "09/06/26 10:30am" };
    const a = normalizeAttendanceImportSourceRow(raw, "breeze", 0, { timeZone: "America/Chicago" });
    const b = normalizeAttendanceImportSourceRow(raw, "breeze", 99, { timeZone: "America/Chicago" });
    const c = normalizeAttendanceImportSourceRow({ ...raw, Date: "09/06/26 6:00pm" }, "breeze", 0, { timeZone: "America/Chicago" });
    expect(b.sourceId).toBe(a.sourceId);
    expect(c.sourceId).not.toBe(a.sourceId);
  });

  it("flags Anonymous and keeps generic_csv on ATT-n ids", () => {
    const anonymous = normalizeAttendanceImportSourceRow({ "Breeze ID": "anonymous", "Event Name": "X", Date: "09/06/26" }, "breeze", 0);
    expect(anonymous).toMatchObject({ anonymousPerson: true, memberNumber: null });

    const generic = normalizeAttendanceImportSourceRow({ email: "a@example.org" }, "generic_csv", 2);
    expect(generic).toMatchObject({ sourceId: "ATT-3", synthetic: false, eventName: null, memberNumber: null });
  });
});
