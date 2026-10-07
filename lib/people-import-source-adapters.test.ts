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

describe("normalizePeopleImportSourceRow — vendor export headers (G4.1)", () => {
  it("planning_center: First Name + Last Name, Given Name fallback, Home/Work/Other Email, Person ID", () => {
    const row = normalizePeopleImportSourceRow(
      {
        "Person ID": "90002",
        "Given Name": "Charles",
        "First Name": "",
        Nickname: "Chuck",
        "Last Name": "Babbage",
        "Home Email": "",
        "Work Email": "charles@example.org",
        "Mobile Phone Number": "",
        "Home Phone Number": "555-010-0202",
        "Household Name": "Babbage Household",
      },
      "planning_center",
    );

    expect(row).toEqual({
      householdName: "Babbage Household",
      fullName: "Charles Babbage",
      email: "charles@example.org",
      phone: "555-010-0202",
      memberNumber: "90002",
    });
  });

  it("planning_center: still reads a single name column", () => {
    const row = normalizePeopleImportSourceRow({ Name: "Ada Lovelace", "Person ID": "1" }, "planning_center");
    expect(row.fullName).toBe("Ada Lovelace");
  });

  it("breeze: joins names, takes the first address in a multi-email cell, Mobile before Home before Work", () => {
    const row = normalizePeopleImportSourceRow(
      {
        "Breeze ID": "5001",
        "First Name": "Maria",
        "Last Name": "Santos",
        Email: "maria@example.org, alt@example.org",
        Mobile: "",
        Home: "555-0100",
        Work: "555-0200",
        "Family ID": "77",
      },
      "breeze",
    );

    expect(row).toEqual({
      householdName: null,
      fullName: "Maria Santos",
      email: "maria@example.org",
      phone: "555-0100",
      memberNumber: "5001",
    });
  });

  it("matches headers regardless of case, spacing and punctuation", () => {
    const row = normalizePeopleImportSourceRow(
      { "FIRST-NAME": "Ada", "last name": "Lovelace", "Person_Id": "9" },
      "planning_center",
    );
    expect(row).toMatchObject({ fullName: "Ada Lovelace", memberNumber: "9" });
  });

  it("generic_csv: does not compose names from first/last columns", () => {
    const row = normalizePeopleImportSourceRow(
      { first_name: "Ada", last_name: "Lovelace", full_name: "Ada L." },
      "generic_csv",
    );
    expect(row.fullName).toBe("Ada L.");
  });
});
