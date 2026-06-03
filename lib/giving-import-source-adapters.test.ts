import { describe, expect, it } from "vitest";

import { normalizeGivingImportSourceRow } from "@/lib/giving-import-source-adapters";

describe("normalizeGivingImportSourceRow — generic_csv", () => {
  it("resolves all 7 canonical fields from generic_csv aliases", () => {
    const row = normalizeGivingImportSourceRow(
      {
        donation_id: "GIV-001",
        donor_email: "jane@example.com",
        amount_dollars: "100.00",
        fund_designation: "General Fund",
        donated_at: "2026-07-06T10:00:00Z",
        notes: "Anniversary offering",
        is_recurring: "yes",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("GIV-001");
    expect(row.donorEmail).toBe("jane@example.com");
    expect(row.amountDollars).toBe("100.00");
    expect(row.fundDesignation).toBe("General Fund");
    expect(row.donatedAt).toBe("2026-07-06T10:00:00Z");
    expect(row.note).toBe("Anniversary offering");
    expect(row.isRecurringRaw).toBe("yes");
  });

  it("auto-generates GIV-1 when no id column present (rowIndex 0)", () => {
    const row = normalizeGivingImportSourceRow(
      { email: "jane@example.com", amount: "50.00" },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("GIV-1");
  });

  it("auto-generates GIV-3 for rowIndex 2", () => {
    const row = normalizeGivingImportSourceRow(
      { email: "jane@example.com", amount: "50.00" },
      "generic_csv",
      2,
    );

    expect(row.sourceId).toBe("GIV-3");
  });

  it("uses id over source_id over donation_id over gift_id for sourceId", () => {
    const row = normalizeGivingImportSourceRow(
      {
        id: "FIRST",
        source_id: "SECOND",
        donation_id: "THIRD",
        gift_id: "FOURTH",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("FIRST");
  });

  it("falls back to source_id when id is absent", () => {
    const row = normalizeGivingImportSourceRow(
      {
        source_id: "SRC-99",
        donation_id: "DON-99",
      },
      "generic_csv",
      0,
    );

    expect(row.sourceId).toBe("SRC-99");
  });

  it("returns null for optional fields when absent", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "G-1", amount: "25.00" },
      "generic_csv",
      0,
    );

    expect(row.donorEmail).toBeNull();
    expect(row.fundDesignation).toBeNull();
    expect(row.donatedAt).toBeNull();
    expect(row.note).toBeNull();
    expect(row.isRecurringRaw).toBeNull();
  });

  it("passes isRecurringRaw through raw without normalization", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "G-1", amount: "25.00", is_recurring: "YES" },
      "generic_csv",
      0,
    );

    // Adapter returns raw value — normalization happens in dry-run classifier
    expect(row.isRecurringRaw).toBe("YES");
  });

  it("resolves gift_date alias for donatedAt", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "G-1", amount: "25.00", gift_date: "2026-01-01" },
      "generic_csv",
      0,
    );

    expect(row.donatedAt).toBe("2026-01-01");
  });

  it("resolves memo alias for note", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "G-1", amount: "25.00", memo: "Tithe" },
      "generic_csv",
      0,
    );

    expect(row.note).toBe("Tithe");
  });

  it("resolves gift_amount alias for amountDollars", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "G-1", gift_amount: "75.50" },
      "generic_csv",
      0,
    );

    expect(row.amountDollars).toBe("75.50");
  });

  it("resolves fund_name alias for fundDesignation", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "G-1", amount: "25.00", fund_name: "Missions" },
      "generic_csv",
      0,
    );

    expect(row.fundDesignation).toBe("Missions");
  });
});

describe("normalizeGivingImportSourceRow — planning_center", () => {
  it("maps donation_id to sourceId", () => {
    const row = normalizeGivingImportSourceRow(
      {
        donation_id: "pc-42",
        email: "john@example.com",
        total: "250.00",
        designation: "Building Fund",
        donated_at: "2026-08-01T10:00:00Z",
        memo: "Monthly pledge",
        recurring: "true",
      },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-42");
    expect(row.donorEmail).toBe("john@example.com");
    expect(row.amountDollars).toBe("250.00");
    expect(row.fundDesignation).toBe("Building Fund");
    expect(row.donatedAt).toBe("2026-08-01T10:00:00Z");
    expect(row.note).toBe("Monthly pledge");
    expect(row.isRecurringRaw).toBe("true");
  });

  it("maps total to amountDollars for planning_center", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "pc-1", total: "500.00" },
      "planning_center",
      0,
    );

    expect(row.amountDollars).toBe("500.00");
  });

  it("maps designation to fundDesignation for planning_center", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "pc-1", amount: "100.00", designation: "Outreach" },
      "planning_center",
      0,
    );

    expect(row.fundDesignation).toBe("Outreach");
  });

  it("maps memo to note for planning_center", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "pc-2", amount: "100.00", memo: "Special gift" },
      "planning_center",
      0,
    );

    expect(row.note).toBe("Special gift");
  });

  it("falls back to id when donation_id absent in planning_center", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "pc-standalone-99", amount: "100.00" },
      "planning_center",
      0,
    );

    expect(row.sourceId).toBe("pc-standalone-99");
  });
});

describe("normalizeGivingImportSourceRow — breeze", () => {
  it("maps gift_id to sourceId", () => {
    const row = normalizeGivingImportSourceRow(
      {
        gift_id: "br-77",
        member_email: "sarah@example.com",
        gift_amount: "150.00",
        category: "Youth Ministry",
        gift_date: "2026-07-08",
        memo: "VBS donation",
        recurring: "1",
      },
      "breeze",
      0,
    );

    expect(row.sourceId).toBe("br-77");
    expect(row.donorEmail).toBe("sarah@example.com");
    expect(row.amountDollars).toBe("150.00");
    expect(row.fundDesignation).toBe("Youth Ministry");
    expect(row.donatedAt).toBe("2026-07-08");
    expect(row.note).toBe("VBS donation");
    expect(row.isRecurringRaw).toBe("1");
  });

  it("maps gift_amount to amountDollars for breeze", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "br-1", gift_amount: "200.00" },
      "breeze",
      0,
    );

    expect(row.amountDollars).toBe("200.00");
  });

  it("maps category to fundDesignation for breeze", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "br-1", amount: "50.00", category: "Benevolence" },
      "breeze",
      0,
    );

    expect(row.fundDesignation).toBe("Benevolence");
  });

  it("maps gift_date to donatedAt for breeze", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "br-2", amount: "50.00", gift_date: "2026-07-10" },
      "breeze",
      0,
    );

    expect(row.donatedAt).toBe("2026-07-10");
  });

  it("falls back to id when gift_id absent in breeze", () => {
    const row = normalizeGivingImportSourceRow(
      { id: "br-standalone-55", amount: "100.00" },
      "breeze",
      0,
    );

    expect(row.sourceId).toBe("br-standalone-55");
  });
});
