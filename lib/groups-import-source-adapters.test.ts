import { describe, expect, it } from "vitest";

import { normalizeGroupImportSourceRow } from "@/lib/groups-import-source-adapters";

describe("normalizeGroupImportSourceRow — generic_csv", () => {
  it("resolves all 6 canonical fields from generic_csv aliases", () => {
    const row = normalizeGroupImportSourceRow(
      {
        source_id: "CSV-001",
        group_name: "Monday Bible Study",
        category: "discipleship",
        notes: "Meets weekly",
        leader_email_address: "leader@example.com",
        status: "active",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("CSV-001");
    expect(row.name).toBe("Monday Bible Study");
    expect(row.category).toBe("discipleship");
    expect(row.description).toBe("Meets weekly");
    expect(row.leaderEmail).toBe("leader@example.com");
    expect(row.isActive).toBe(true);
  });

  it("uses first available alias for sourceId (id over source_id)", () => {
    const row = normalizeGroupImportSourceRow(
      {
        id: "FIRST-ID",
        source_id: "SECOND-ID",
        name: "Test Group",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("FIRST-ID");
  });

  it("uses leader_email when leader_email_address is absent", () => {
    const row = normalizeGroupImportSourceRow(
      {
        id: "G-1",
        name: "Test Group",
        leader_email: "pastor@example.com",
      },
      "generic_csv",
      0,
    );

    expect(row.leaderEmail).toBe("pastor@example.com");
  });
});

describe("normalizeGroupImportSourceRow — planning_center", () => {
  it("maps planning_center aliases correctly", () => {
    const row = normalizeGroupImportSourceRow(
      {
        id: "pc-42",
        group_name: "Young Adults",
        group_type: "life_stage",
        description: "Ages 18-30",
        contact_email: "ya-leader@example.com",
        status: "active",
      },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-42");
    expect(row.name).toBe("Young Adults");
    expect(row.category).toBe("life_stage");
    expect(row.description).toBe("Ages 18-30");
    expect(row.leaderEmail).toBe("ya-leader@example.com");
    expect(row.isActive).toBe(true);
  });

  it("falls back to group_id for sourceId when id is absent", () => {
    const row = normalizeGroupImportSourceRow(
      {
        group_id: "pc-group-99",
        name: "Seniors Ministry",
      },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-group-99");
  });

  it("prefers contact_email over leader_email (Planning Center canonical export column)", () => {
    const row = normalizeGroupImportSourceRow(
      {
        id: "pc-1",
        name: "Group",
        leader_email: "leader@example.com",
        contact_email: "contact@example.com",
      },
      "planning_center",
      0,
    );

    expect(row.leaderEmail).toBe("contact@example.com");
  });
});

describe("normalizeGroupImportSourceRow — breeze", () => {
  it("maps breeze aliases correctly", () => {
    const row = normalizeGroupImportSourceRow(
      {
        group_id: "br-77",
        name: "Men's Fellowship",
        type: "service",
        description: "Saturday mornings",
        email: "mens@example.com",
        status: "active",
      },
      "breeze",
      0,
    );

    expect(row.sourceId).toBe("br-77");
    expect(row.name).toBe("Men's Fellowship");
    expect(row.category).toBe("service");
    expect(row.description).toBe("Saturday mornings");
    expect(row.leaderEmail).toBe("mens@example.com");
    expect(row.isActive).toBe(true);
  });

  it("maps category from type field", () => {
    const row = normalizeGroupImportSourceRow(
      {
        id: "br-1",
        name: "Youth Group",
        type: "youth",
      },
      "breeze",
      0,
    );

    expect(row.category).toBe("youth");
  });

  it("maps leaderEmail from email field", () => {
    const row = normalizeGroupImportSourceRow(
      {
        id: "br-2",
        name: "Group",
        email: "leader@example.com",
      },
      "breeze",
      0,
    );

    expect(row.leaderEmail).toBe("leader@example.com");
  });
});

describe("normalizeGroupImportSourceRow — sourceId fallback", () => {
  it("auto-generates GRP-1 when no id column exists (rowIndex 0)", () => {
    const row = normalizeGroupImportSourceRow(
      { name: "Bible Study" },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("GRP-1");
  });

  it("auto-generates GRP-3 for rowIndex 2", () => {
    const row = normalizeGroupImportSourceRow(
      { name: "Prayer Group" },
      "generic_csv",
      2,
    );

    expect(row.sourceId).toBe("GRP-3");
  });
});

describe("normalizeGroupImportSourceRow — isActive logic", () => {
  it("returns isActive = true when status is absent", () => {
    const row = normalizeGroupImportSourceRow(
      { id: "G-1", name: "Test" },
      "generic_csv",
      0,
    );

    expect(row.isActive).toBe(true);
  });

  it("returns isActive = false when status is 'inactive'", () => {
    const row = normalizeGroupImportSourceRow(
      { id: "G-1", name: "Test", status: "inactive" },
      "generic_csv",
      0,
    );

    expect(row.isActive).toBe(false);
  });

  it("returns isActive = true when status is 'ACTIVE' (case-insensitive)", () => {
    const row = normalizeGroupImportSourceRow(
      { id: "G-1", name: "Test", status: "ACTIVE" },
      "generic_csv",
      0,
    );

    expect(row.isActive).toBe(true);
  });

  it("returns isActive = true when status is 'Active' (mixed case)", () => {
    const row = normalizeGroupImportSourceRow(
      { id: "G-1", name: "Test", status: "Active" },
      "generic_csv",
      0,
    );

    expect(row.isActive).toBe(true);
  });

  it("passes through other status values raw (for classifier to reject)", () => {
    const row = normalizeGroupImportSourceRow(
      { id: "G-1", name: "Test", status: "archived" },
      "generic_csv",
      0,
    );

    // The raw string is passed through — classifier will reject it
    expect(row.isActive as unknown as string).toBe("archived");
  });
});
