import { describe, expect, it } from "vitest";

import {
  chunkArray,
  computeIgnoredColumns,
  contentSourceId,
  normalizeHeaderKey,
  parseImportCsv,
  parseImportDate,
  pickField,
  splitFirstEmail,
} from "@/lib/import-normalize";

// Fixed "now" so the two-digit-year pivot is deterministic (current YY = 26).
const NOW = new Date("2026-10-07T12:00:00Z");

describe("normalizeHeaderKey", () => {
  it("makes spacing, case, punctuation and underscores irrelevant", () => {
    for (const header of ["Home Email", "home_email", "HOME-EMAIL", "  Home   Email ", "home.email"]) {
      expect(normalizeHeaderKey(header)).toBe("homeemail");
    }
  });

  it("strips a BOM and folds accents", () => {
    expect(normalizeHeaderKey("﻿Breeze ID")).toBe("breezeid");
    expect(normalizeHeaderKey("Dirección")).toBe("direccion");
  });
});

describe("pickField", () => {
  it("matches by normalized key and returns the first non-empty alias in alias order", () => {
    const row = { "Home Email": "", "Work Email": "work@example.org", "Other Email": "other@example.org" };
    expect(pickField(row, ["home_email", "work_email", "other_email"])).toBe("work@example.org");
    expect(pickField(row, ["other_email", "work_email"])).toBe("other@example.org");
  });

  it("returns null when nothing matches or all matches are blank", () => {
    expect(pickField({ Name: "  " }, ["name"])).toBeNull();
    expect(pickField({ Name: "Ada" }, ["email"])).toBeNull();
  });

  it("keeps existing snake_case aliases working against exact-key rows", () => {
    expect(pickField({ donated_at: "2026-07-06" }, ["donated_at", "date"])).toBe("2026-07-06");
  });

  it("lets the first non-empty column win when two headers normalize the same", () => {
    expect(pickField({ "Home Email": "", home_email: "second@example.org" }, ["homeemail"])).toBe(
      "second@example.org",
    );
  });
});

describe("computeIgnoredColumns", () => {
  it("lists header names that no alias consumed, once each, in file order", () => {
    const ignored = computeIgnoredColumns(
      ["Person ID", "First Name", "Grade", "Medical Notes", "Grade", "﻿", " "],
      ["person_id", "first_name"],
    );
    expect(ignored).toEqual(["Grade", "Medical Notes"]);
  });
});

describe("parseImportCsv", () => {
  it("strips a BOM from the first header", () => {
    const result = parseImportCsv("﻿Name,Email\nAda,ada@example.org\n");
    expect(result.headers).toEqual(["Name", "Email"]);
    expect(result.rows).toEqual([{ Name: "Ada", Email: "ada@example.org" }]);
  });

  it("drops blank rows and comma-only rows", () => {
    const result = parseImportCsv("Name,Email\nAda,a@example.org\n,\n\n,,\nBob,b@example.org\n,\n");
    expect(result.rows.map((row) => row.Name)).toEqual(["Ada", "Bob"]);
    expect(result.errors).toEqual([]);
  });

  it("renames repeated headers instead of letting a later column overwrite an earlier one", () => {
    const result = parseImportCsv("Home Email,Home Email,Home Email\na@example.org,b@example.org,c@example.org\n");
    expect(result.headers).toEqual(["Home Email", "Home Email__2", "Home Email__3"]);
    expect(result.rows[0]).toEqual({
      "Home Email": "a@example.org",
      "Home Email__2": "b@example.org",
      "Home Email__3": "c@example.org",
    });
  });

  it("trims header whitespace and handles CRLF and quoted commas", () => {
    const result = parseImportCsv(' Name , Note \r\n"Lovelace, Ada","said ""hi"""\r\n');
    expect(result.headers).toEqual(["Name", "Note"]);
    expect(result.rows[0]).toEqual({ Name: "Lovelace, Ada", Note: 'said "hi"' });
  });
});

describe("parseImportDate", () => {
  const chicago = "America/Chicago";

  it("parses an ISO date as noon in the church time zone", () => {
    expect(parseImportDate("2026-07-06", chicago, NOW)).toEqual({
      ok: true,
      day: "2026-07-06",
      instant: "2026-07-06T17:00:00.000Z", // CDT is UTC-5
    });
  });

  it("reads a zoneless ISO date-time as church-local, so Chicago and UTC differ", () => {
    const chicagoResult = parseImportDate("2026-07-06T10:30:00", chicago, NOW);
    const utcResult = parseImportDate("2026-07-06T10:30:00", "UTC", NOW);
    expect(chicagoResult).toMatchObject({ ok: true, instant: "2026-07-06T15:30:00.000Z" });
    expect(utcResult).toMatchObject({ ok: true, instant: "2026-07-06T10:30:00.000Z" });
  });

  it("respects an explicit Z or offset and reports the church-local day", () => {
    expect(parseImportDate("2026-07-06T23:30:00Z", chicago, NOW)).toEqual({
      ok: true,
      day: "2026-07-06",
      instant: "2026-07-06T23:30:00.000Z",
    });
    // 02:30Z on the 7th is still the evening of the 6th in Chicago.
    expect(parseImportDate("2026-07-07T02:30:00+00:00", chicago, NOW)).toMatchObject({
      ok: true,
      day: "2026-07-06",
    });
    expect(parseImportDate("2026-07-06T10:00:00-05:00", "UTC", NOW)).toMatchObject({
      ok: true,
      instant: "2026-07-06T15:00:00.000Z",
    });
    expect(parseImportDate("2026-07-06 10:00:00+0200", "UTC", NOW)).toMatchObject({
      ok: true,
      instant: "2026-07-06T08:00:00.000Z",
    });
  });

  it("accepts a space between date and time", () => {
    expect(parseImportDate("2026-09-06 10:30", "UTC", NOW)).toMatchObject({
      ok: true,
      instant: "2026-09-06T10:30:00.000Z",
    });
  });

  it("parses mm/dd/yyyy and m/d/yyyy", () => {
    expect(parseImportDate("09/06/2026", "UTC", NOW)).toMatchObject({ ok: true, day: "2026-09-06" });
    expect(parseImportDate("9/6/2026", "UTC", NOW)).toMatchObject({ ok: true, day: "2026-09-06" });
  });

  it("parses time suffixes: 10:30 am, 10:30am, 7:00 PM, 14:05, 12:00 am", () => {
    const at = (raw: string) => parseImportDate(raw, "UTC", NOW);
    expect(at("05/25/2018 10:30 am")).toMatchObject({ ok: true, instant: "2018-05-25T10:30:00.000Z" });
    expect(at("05/25/2018 10:30am")).toMatchObject({ ok: true, instant: "2018-05-25T10:30:00.000Z" });
    expect(at("05/25/2018 7:00 PM")).toMatchObject({ ok: true, instant: "2018-05-25T19:00:00.000Z" });
    expect(at("05/25/2018 14:05")).toMatchObject({ ok: true, instant: "2018-05-25T14:05:00.000Z" });
    expect(at("05/25/2018 12:00 am")).toMatchObject({ ok: true, instant: "2018-05-25T00:00:00.000Z" });
    expect(at("05/25/2018 12:30 pm")).toMatchObject({ ok: true, instant: "2018-05-25T12:30:00.000Z" });
  });

  it("applies the church time zone to US dates with a time", () => {
    expect(parseImportDate("05/25/18 10:30am", chicago, NOW)).toMatchObject({
      ok: true,
      day: "2018-05-25",
      instant: "2018-05-25T15:30:00.000Z",
    });
  });

  it("pivots two-digit years at the current year plus one", () => {
    const year = (raw: string) => {
      const result = parseImportDate(raw, "UTC", NOW);
      return result.ok ? result.day.slice(0, 4) : null;
    };
    expect(year("01/02/26")).toBe("2026");
    expect(year("01/02/27")).toBe("2027"); // current YY + 1
    expect(year("01/02/28")).toBe("1928");
    expect(year("01/02/99")).toBe("1999");
    expect(year("01/02/00")).toBe("2000");
  });

  it("rejects impossible calendar dates by round trip", () => {
    for (const raw of ["02/30/2026", "2026-02-30", "13/01/2026", "00/10/2026", "04/31/2026", "02/29/2025"]) {
      expect(parseImportDate(raw, "UTC", NOW)).toEqual({ ok: false });
    }
    expect(parseImportDate("02/29/2028", "UTC", NOW)).toMatchObject({ ok: true, day: "2028-02-29" });
  });

  it("rejects impossible times and unknown shapes", () => {
    for (const raw of [
      "",
      "   ",
      "July 1 2026",
      "2026-07-06T25:00:00",
      "05/25/2018 13:00 pm",
      "05/25/2018 10:75",
      "05/25/2018 0:30 am",
      "26-07-06",
      "2026/07/06",
    ]) {
      expect(parseImportDate(raw, "UTC", NOW)).toEqual({ ok: false });
    }
    expect(parseImportDate(null, "UTC", NOW)).toEqual({ ok: false });
    expect(parseImportDate(undefined, "UTC", NOW)).toEqual({ ok: false });
  });

  it("falls back to UTC for a missing or unknown time zone", () => {
    expect(parseImportDate("2026-07-06", null, NOW)).toMatchObject({ instant: "2026-07-06T12:00:00.000Z" });
    expect(parseImportDate("2026-07-06", "Not/AZone", NOW)).toMatchObject({
      instant: "2026-07-06T12:00:00.000Z",
    });
  });
});

describe("contentSourceId", () => {
  it("is stable, prefixed and 24 hex characters long", () => {
    const id = contentSourceId("brz-giv", ["5001", "2026-09-06", "10000", "General", "B1", "1001"]);
    expect(id).toMatch(/^brz-giv-[0-9a-f]{24}$/);
    expect(contentSourceId("brz-giv", ["5001", "2026-09-06", "10000", "General", "B1", "1001"])).toBe(id);
  });

  it("ignores case and surrounding whitespace but not content", () => {
    const base = contentSourceId("pco-giv", ["Ada@Example.org", "2026-09-06", "125000", "General Fund"]);
    expect(contentSourceId("pco-giv", [" ada@example.org ", "2026-09-06", "125000", "general fund"])).toBe(base);
    expect(contentSourceId("pco-giv", ["ada@example.org", "2026-09-06", "125001", "General Fund"])).not.toBe(base);
  });

  it("does not collide when parts shift between fields", () => {
    expect(contentSourceId("x", ["ab", "c"])).not.toBe(contentSourceId("x", ["a", "bc"]));
    expect(contentSourceId("x", ["a", null])).toBe(contentSourceId("x", ["a", ""]));
  });
});

describe("splitFirstEmail", () => {
  it("takes the first address from a comma or semicolon separated cell", () => {
    expect(splitFirstEmail("a@example.org, b@example.org")).toBe("a@example.org");
    expect(splitFirstEmail("a@example.org;b@example.org")).toBe("a@example.org");
  });

  it("skips a leading junk piece when a later one looks like an address", () => {
    expect(splitFirstEmail("none, real@example.org")).toBe("real@example.org");
  });

  it("returns the first piece when none look valid, so the caller can reject it", () => {
    expect(splitFirstEmail("not-an-email, also bad")).toBe("not-an-email");
  });

  it("returns null for blank input", () => {
    expect(splitFirstEmail("")).toBeNull();
    expect(splitFirstEmail(" , ; ")).toBeNull();
    expect(splitFirstEmail(null)).toBeNull();
  });
});

describe("chunkArray", () => {
  it("splits into chunks of at most the size", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
  });
});
