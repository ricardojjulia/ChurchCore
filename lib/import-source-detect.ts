// Pure, client-safe vendor detection for the import workspaces (G4.1, R3).
// `normalizeHeaderKey` here mirrors lib/import-normalize.ts (which pulls in
// node:crypto and cannot be bundled for the browser); a unit test pins the two
// together. Header names only; no cell values are read.

export type DetectedImportSource = "planning_center" | "breeze";

export function normalizeDetectKey(header: string): string {
  return header
    .replace(/^﻿/, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Headers that only the named vendor's exports carry. Breeze wins ties.
const BREEZE_HEADERS = ["breezeid", "processorid", "familyid", "familyrole"];
const PLANNING_CENTER_HEADERS = [
  "personid",
  "donationamount",
  "receiveddate",
  "remoteid",
  "donornumber",
  "donorfirstname",
  "donorlastname",
  "donoremail",
  "givenname",
  "startsat",
  "endsat",
];

/** First-line header names of a CSV text (BOM and quotes tolerated). */
export function parseCsvHeaders(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  if (!firstLine.trim()) return [];
  return firstLine
    .replace(/^﻿/, "")
    .split(",")
    .map((cell) => cell.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

/** Returns the vendor a header row belongs to, or null to leave the user's choice alone. */
export function detectImportSourceSystem(headers: string[]): DetectedImportSource | null {
  const keys = new Set(headers.map(normalizeDetectKey));
  if (BREEZE_HEADERS.some((key) => keys.has(key))) return "breeze";
  if (PLANNING_CENTER_HEADERS.some((key) => keys.has(key))) return "planning_center";
  return null;
}
