import { describe, expect, it } from "vitest";

import { normalizeEventImportSourceRow } from "@/lib/events-import-source-adapters";

describe("normalizeEventImportSourceRow — generic_csv", () => {
  it("resolves all canonical fields from generic_csv aliases", () => {
    const row = normalizeEventImportSourceRow(
      {
        source_id: "CSV-001",
        event_name: "Sunday Service",
        description: "Weekly worship gathering",
        venue: "Main Sanctuary",
        start_date: "2026-07-06T10:00:00Z",
        end_date: "2026-07-06T12:00:00Z",
        max_attendees: "200",
        ministry_name: "Worship",
        approval_status: "approved",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("CSV-001");
    expect(row.title).toBe("Sunday Service");
    expect(row.description).toBe("Weekly worship gathering");
    expect(row.location).toBe("Main Sanctuary");
    expect(row.startsAt).toBe("2026-07-06T10:00:00Z");
    expect(row.endsAt).toBe("2026-07-06T12:00:00Z");
    expect(row.capacity).toBe(200);
    expect(row.ministryName).toBe("Worship");
    expect(row.approvalStatus).toBe("approved");
  });

  it("uses first available alias for sourceId (id over source_id)", () => {
    const row = normalizeEventImportSourceRow(
      {
        id: "FIRST-ID",
        source_id: "SECOND-ID",
        title: "Test Event",
        starts_at: "2026-07-01T10:00:00Z",
        ends_at: "2026-07-01T12:00:00Z",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("FIRST-ID");
  });

  it("auto-generates EVT-1 when no id column exists (rowIndex 0)", () => {
    const row = normalizeEventImportSourceRow(
      {
        title: "Prayer Meeting",
        starts_at: "2026-07-01T18:00:00Z",
        ends_at: "2026-07-01T19:00:00Z",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("EVT-1");
  });

  it("auto-generates EVT-3 for rowIndex 2", () => {
    const row = normalizeEventImportSourceRow(
      { title: "Event" },
      "generic_csv",
      2,
    );

    expect(row.sourceId).toBe("EVT-3");
  });

  it("parses capacity as integer", () => {
    const row = normalizeEventImportSourceRow(
      { id: "E-1", title: "Event", capacity: "50" },
      "generic_csv",
      0,
    );

    expect(row.capacity).toBe(50);
  });

  it("returns capacity null when absent", () => {
    const row = normalizeEventImportSourceRow(
      { id: "E-1", title: "Event" },
      "generic_csv",
      0,
    );

    expect(row.capacity).toBeNull();
  });

  it("returns capacity null when non-numeric", () => {
    const row = normalizeEventImportSourceRow(
      { id: "E-1", title: "Event", capacity: "many" },
      "generic_csv",
      0,
    );

    expect(row.capacity).toBeNull();
  });

  it("passes approvalStatus through raw", () => {
    const row = normalizeEventImportSourceRow(
      { id: "E-1", title: "Event", status: "pending" },
      "generic_csv",
      0,
    );

    expect(row.approvalStatus).toBe("pending");
  });

  it("returns approvalStatus null when absent", () => {
    const row = normalizeEventImportSourceRow(
      { id: "E-1", title: "Event" },
      "generic_csv",
      0,
    );

    expect(row.approvalStatus).toBeNull();
  });
});

describe("normalizeEventImportSourceRow — planning_center", () => {
  it("maps planning_center aliases correctly", () => {
    const row = normalizeEventImportSourceRow(
      {
        id: "pc-42",
        name: "Men's Retreat",
        description: "Annual retreat",
        location: "Camp Galilee",
        starts_at: "2026-08-01T08:00:00Z",
        ends_at: "2026-08-03T17:00:00Z",
        capacity: "40",
        group_type: "Men's Ministry",
        status: "approved",
      },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-42");
    expect(row.title).toBe("Men's Retreat");
    expect(row.description).toBe("Annual retreat");
    expect(row.location).toBe("Camp Galilee");
    expect(row.startsAt).toBe("2026-08-01T08:00:00Z");
    expect(row.endsAt).toBe("2026-08-03T17:00:00Z");
    expect(row.capacity).toBe(40);
    expect(row.ministryName).toBe("Men's Ministry");
    expect(row.approvalStatus).toBe("approved");
  });

  it("maps name to title (planning_center canonical column)", () => {
    const row = normalizeEventImportSourceRow(
      { id: "pc-1", name: "Youth Night", starts_at: "2026-07-05T19:00:00Z", ends_at: "2026-07-05T21:00:00Z" },
      "planning_center",
      0,
    );

    expect(row.title).toBe("Youth Night");
  });

  it("maps starts_at and start aliases for startsAt", () => {
    const rowWithStart = normalizeEventImportSourceRow(
      { id: "pc-2", name: "Event", start: "2026-09-01T09:00:00Z", ends_at: "2026-09-01T11:00:00Z" },
      "planning_center",
      0,
    );

    expect(rowWithStart.startsAt).toBe("2026-09-01T09:00:00Z");
  });

  it("maps ministry alias for ministryName", () => {
    const row = normalizeEventImportSourceRow(
      { id: "pc-3", name: "Event", ministry: "Outreach" },
      "planning_center",
      0,
    );

    expect(row.ministryName).toBe("Outreach");
  });

  it("prefers group_type over ministry for ministryName", () => {
    const row = normalizeEventImportSourceRow(
      { id: "pc-4", name: "Event", group_type: "Worship", ministry: "Other" },
      "planning_center",
      0,
    );

    expect(row.ministryName).toBe("Worship");
  });

  it("falls back to event_id for sourceId when id is absent", () => {
    const row = normalizeEventImportSourceRow(
      { event_id: "pc-event-99", name: "Conference" },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-event-99");
  });
});

describe("normalizeEventImportSourceRow — breeze", () => {
  it("maps breeze aliases correctly", () => {
    const row = normalizeEventImportSourceRow(
      {
        id: "br-77",
        name: "Women's Bible Study",
        description: "Tuesday mornings",
        venue: "Fellowship Hall",
        start_date: "2026-07-08T09:00:00Z",
        end_date: "2026-07-08T10:30:00Z",
        capacity: "25",
        category: "Women's Ministry",
        status: "approved",
      },
      "breeze",
      0,
    );

    expect(row.sourceId).toBe("br-77");
    expect(row.title).toBe("Women's Bible Study");
    expect(row.description).toBe("Tuesday mornings");
    expect(row.location).toBe("Fellowship Hall");
    expect(row.startsAt).toBe("2026-07-08T09:00:00Z");
    expect(row.endsAt).toBe("2026-07-08T10:30:00Z");
    expect(row.capacity).toBe(25);
    expect(row.ministryName).toBe("Women's Ministry");
    expect(row.approvalStatus).toBe("approved");
  });

  it("maps name to title (breeze canonical column)", () => {
    const row = normalizeEventImportSourceRow(
      { id: "br-1", name: "Prayer Service" },
      "breeze",
      0,
    );

    expect(row.title).toBe("Prayer Service");
  });

  it("maps start_date to startsAt", () => {
    const row = normalizeEventImportSourceRow(
      { id: "br-2", name: "Event", start_date: "2026-07-10T08:00:00Z" },
      "breeze",
      0,
    );

    expect(row.startsAt).toBe("2026-07-10T08:00:00Z");
  });

  it("maps end_date to endsAt", () => {
    const row = normalizeEventImportSourceRow(
      { id: "br-3", name: "Event", end_date: "2026-07-10T10:00:00Z" },
      "breeze",
      0,
    );

    expect(row.endsAt).toBe("2026-07-10T10:00:00Z");
  });

  it("maps category to ministryName", () => {
    const row = normalizeEventImportSourceRow(
      { id: "br-4", name: "Event", category: "Youth" },
      "breeze",
      0,
    );

    expect(row.ministryName).toBe("Youth");
  });

  it("falls back to ministry for ministryName when category absent", () => {
    const row = normalizeEventImportSourceRow(
      { id: "br-5", name: "Event", ministry: "Outreach" },
      "breeze",
      0,
    );

    expect(row.ministryName).toBe("Outreach");
  });

  it("maps notes to description for breeze", () => {
    const row = normalizeEventImportSourceRow(
      { id: "br-6", name: "Event", notes: "Bring your Bible" },
      "breeze",
      0,
    );

    expect(row.description).toBe("Bring your Bible");
  });
});
