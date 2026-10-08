import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { normalizeHeaderKey } from "@/lib/import-normalize";
import {
  detectImportSourceSystem,
  normalizeDetectKey,
  parseCsvHeaders,
} from "@/lib/import-source-detect";

const fixture = (path: string) =>
  parseCsvHeaders(readFileSync(`tests/fixtures/imports/${path}`, "utf8"));

describe("import source detection", () => {
  it("normalizes headers exactly like lib/import-normalize", () => {
    for (const h of ["Person ID", "﻿Breeze ID", "  Home Email ", "Donor first name", "Café-Name"]) {
      expect(normalizeDetectKey(h)).toBe(normalizeHeaderKey(h));
    }
  });

  it("detects Planning Center and Breeze from every fixture", () => {
    for (const f of ["people.csv", "people-bom-blank-rows.csv", "giving.csv", "events.csv"]) {
      expect(detectImportSourceSystem(fixture(`planning-center/${f}`))).toBe("planning_center");
    }
    for (const f of ["people.csv", "giving.csv", "attendance.csv", "tags.csv"]) {
      expect(detectImportSourceSystem(fixture(`breeze/${f}`))).toBe("breeze");
    }
  });

  it("leaves generic files alone", () => {
    expect(detectImportSourceSystem(["household_name", "full_name", "email"])).toBeNull();
    expect(detectImportSourceSystem([])).toBeNull();
  });
});
