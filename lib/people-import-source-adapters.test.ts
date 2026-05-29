import { describe, expect, it } from "vitest";

import { normalizePeopleImportSourceRow } from "@/lib/people-import-source-adapters";

describe("normalizePeopleImportSourceRow", () => {
  it("maps planning center aliases", () => {
    const row = normalizePeopleImportSourceRow(
      {
        household: "River Family",
        name: "Ada Lovelace",
        email_address: "ada@example.com",
        mobile_phone: "555-0101",
        people_id: "pc-1",
      },
      "planning_center",
    );

    expect(row).toEqual({
      householdName: "River Family",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555-0101",
      memberNumber: "pc-1",
    });
  });

  it("maps breeze aliases", () => {
    const row = normalizePeopleImportSourceRow(
      {
        family: "Harbor House",
        name: "Grace Hopper",
        email: "grace@example.com",
        phone: "555-0102",
        member_id: "br-2",
      },
      "breeze",
    );

    expect(row).toEqual({
      householdName: "Harbor House",
      fullName: "Grace Hopper",
      email: "grace@example.com",
      phone: "555-0102",
      memberNumber: "br-2",
    });
  });

  it("maps pushpay/ccb aliases", () => {
    const row = normalizePeopleImportSourceRow(
      {
        household_name: "Stone Family",
        full_name: "Peter Stone",
        email: "peter@example.com",
        phone: "555-0103",
        individual_id: "pp-9",
      },
      "pushpay_ccb",
    );

    expect(row).toEqual({
      householdName: "Stone Family",
      fullName: "Peter Stone",
      email: "peter@example.com",
      phone: "555-0103",
      memberNumber: "pp-9",
    });
  });
});
