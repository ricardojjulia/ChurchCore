// Shared, pure helpers for the CSV import adapters (G4.1): tolerant header
// matching, vendor date formats, content-derived source ids, multi-value email
// cells and a CSV parser that survives real exports (BOM, blank rows,
// repeated headers). No database access and no `server-only` so it is unit
// testable; nothing here ever echoes a cell value into an error or reason.

import { createHash } from "node:crypto";
import Papa from "papaparse";

import { todayInTimeZone, zonedTimeToInstant } from "@/lib/church-time";

/** Split a list into chunks of at most `size` (large inserts go out in several requests). */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Throws a clear error for a source system the importer does not know (the value comes from the browser). */
export function assertImportSourceSystem<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error("Unknown source system.");
  }
  return value as T;
}

/** A copy of a CSV row without the ignored columns, so staged raw payloads hold mapped columns only. */
export function omitColumns(row: Record<string, string>, ignored: string[]): Record<string, string> {
  if (ignored.length === 0) return row;
  const drop = new Set(ignored);
  return Object.fromEntries(Object.entries(row).filter(([header]) => !drop.has(header)));
}

// ── Headers ──────────────────────────────────────────────────

/** "Home Email", "home_email", "HOME-EMAIL" and "﻿Home  Email" all become "homeemail". */
export function normalizeHeaderKey(header: string): string {
  return header
    .replace(/^﻿/, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const normalizedRowCache = new WeakMap<Record<string, string>, Map<string, string>>();

function normalizedRowMap(row: Record<string, string>): Map<string, string> {
  const cached = normalizedRowCache.get(row);
  if (cached) return cached;

  const map = new Map<string, string>();
  for (const [header, value] of Object.entries(row)) {
    const key = normalizeHeaderKey(header);
    if (!key || value == null || String(value).trim().length === 0) continue;
    // The first non-empty column for a normalized key wins.
    if (!map.has(key)) map.set(key, value);
  }
  normalizedRowCache.set(row, map);
  return map;
}

/** First non-empty value for the aliases, in alias order, matching headers by normalized key. */
export function pickField(row: Record<string, string>, aliases: string[]): string | null {
  const map = normalizedRowMap(row);
  for (const alias of aliases) {
    const value = map.get(normalizeHeaderKey(alias));
    if (value != null) return value;
  }
  return null;
}

/**
 * Header names (never cell values) that no alias consumed, in file order and
 * without repeats. `consumedAliases` is every alias the adapter understands.
 */
export function computeIgnoredColumns(headers: string[], consumedAliases: string[]): string[] {
  const consumed = new Set(consumedAliases.map(normalizeHeaderKey));
  const seen = new Set<string>();
  const ignored: string[] = [];
  for (const header of headers) {
    const clean = header.replace(/^﻿/, "").trim();
    if (!clean) continue;
    const key = normalizeHeaderKey(clean);
    if (consumed.has(key) || seen.has(clean)) continue;
    seen.add(clean);
    ignored.push(clean);
  }
  return ignored;
}

// ── CSV ──────────────────────────────────────────────────────

export type ImportCsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
};

/**
 * Parse a CSV export: strips a BOM, trims headers, drops blank and comma-only
 * rows ("greedy"), and renames repeated headers (X, X__2, X__3) so no column
 * silently overwrites another.
 */
export function parseImportCsv(raw: string): ImportCsvParseResult {
  const seen = new Map<string, number>();
  const result = Papa.parse<Record<string, string>>(raw.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header: string) => {
      const clean = header.replace(/^﻿/, "").trim();
      const count = (seen.get(clean) ?? 0) + 1;
      seen.set(clean, count);
      return count === 1 ? clean : `${clean}__${count}`;
    },
  });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.map((error) => error.message),
  };
}

// ── Dates ────────────────────────────────────────────────────

export type ParsedImportDate =
  | { ok: true; day: string; instant: string }
  | { ok: false };

const NOT_OK: ParsedImportDate = { ok: false };

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function validCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  // Round trip: 02/30 would roll over into March and not match.
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;

const US_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?$/i;

function resolveLocal(
  day: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string | null,
): ParsedImportDate {
  const time = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
  const instant = zonedTimeToInstant(day, time, timeZone);
  if (!instant) return NOT_OK;
  return { ok: true, day, instant: instant.toISOString() };
}

/**
 * Parse an import date or date-time. Accepts ISO 8601 (an explicit offset or Z
 * is respected), mm/dd/yyyy and mm/dd/yy (two-digit years pivot at the current
 * year plus one), each with an optional time as `h:mm am`, `h:mmam` or
 * `HH:mm`. Times without an offset, and date-only values (noon), are read in
 * the church's time zone. `day` is the church-local calendar day.
 */
export function parseImportDate(
  raw: string | null | undefined,
  timeZone?: string | null,
  now: Date = new Date(),
): ParsedImportDate {
  const text = (raw ?? "").replace(/^﻿/, "").trim();
  if (!text) return NOT_OK;
  const zone = timeZone ?? null;

  const iso = ISO_PATTERN.exec(text);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const dayOfMonth = Number(iso[3]);
    if (!validCalendarDay(year, month, dayOfMonth)) return NOT_OK;
    const day = `${iso[1]}-${iso[2]}-${iso[3]}`;

    if (iso[4] === undefined) return resolveLocal(day, 12, 0, 0, zone);

    const hour = Number(iso[4]);
    const minute = Number(iso[5]);
    const second = iso[6] ? Number(iso[6]) : 0;
    if (hour > 23 || minute > 59 || second > 59) return NOT_OK;

    const offset = iso[7];
    if (!offset) return resolveLocal(day, hour, minute, second, zone);

    const offsetText = /^z$/i.test(offset)
      ? "Z"
      : `${offset.slice(0, 3)}:${offset.replace(":", "").slice(3, 5)}`;
    const parsed = Date.parse(`${day}T${pad(hour)}:${pad(minute)}:${pad(second)}${offsetText}`);
    if (Number.isNaN(parsed)) return NOT_OK;
    const instant = new Date(parsed);
    return { ok: true, day: todayInTimeZone(zone, instant), instant: instant.toISOString() };
  }

  const us = US_PATTERN.exec(text);
  if (us) {
    const month = Number(us[1]);
    const dayOfMonth = Number(us[2]);
    let year = Number(us[3]);
    if (us[3].length === 2) {
      const currentYY = now.getUTCFullYear() % 100;
      year = year <= currentYY + 1 ? 2000 + year : 1900 + year;
    }
    if (!validCalendarDay(year, month, dayOfMonth)) return NOT_OK;
    const day = `${pad(year, 4)}-${pad(month)}-${pad(dayOfMonth)}`;

    if (us[4] === undefined) return resolveLocal(day, 12, 0, 0, zone);

    let hour = Number(us[4]);
    const minute = Number(us[5]);
    const second = us[6] ? Number(us[6]) : 0;
    const meridiem = us[7]?.toLowerCase();
    if (minute > 59 || second > 59) return NOT_OK;
    if (meridiem) {
      if (hour < 1 || hour > 12) return NOT_OK;
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
    } else if (hour > 23) {
      return NOT_OK;
    }
    return resolveLocal(day, hour, minute, second, zone);
  }

  return NOT_OK;
}

// ── Source ids and emails ────────────────────────────────────

const ID_SEPARATOR = "␟";

/**
 * Stable id for a vendor row that has no id of its own: the same gift or
 * check-in hashes the same wherever it sits in the file. The dry run appends
 * `-<occurrence>` for the nth identical row.
 */
export function contentSourceId(prefix: string, parts: Array<string | null | undefined>): string {
  const material = parts.map((part) => (part ?? "").trim().toLowerCase()).join(ID_SEPARATOR);
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Breeze keeps several addresses in one cell ("a@x.org, b@y.org"). Returns the
 * first valid-looking one; when none looks valid, the first non-empty piece so
 * the caller can still reject it as malformed.
 */
export function splitFirstEmail(raw: string | null | undefined): string | null {
  const pieces = (raw ?? "")
    .split(/[,;]/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
  return pieces.find((piece) => EMAIL_PATTERN.test(piece)) ?? pieces[0] ?? null;
}
