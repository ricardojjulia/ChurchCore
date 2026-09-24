#!/usr/bin/env node
/**
 * Encrypts legacy plaintext pastoral fields at rest
 * (docs/setup/production-deployment.md §12).
 *
 * Fields: pastoral_notes.content, care_assignments.summary, and
 * church_documents.body for elder_council_notes documents. All use the same
 * AES-256-GCM format as lib/crypto/pastoral.ts (base64 of iv[12] | tag[16] |
 * ciphertext).
 *
 * Dry run by default: it prints the target host and what it would change.
 * Pass --apply to write. It is idempotent: values already encrypted with
 * PASTORAL_ENCRYPTION_KEY are left alone, so re-running is safe.
 *
 * Safety:
 * - Aborts before writing anything if a value looks like ciphertext but
 *   won't decrypt with the given key. That almost always means the wrong key,
 *   and encrypting that ciphertext again would need both keys to recover.
 * - Each update is guarded on the value it read, so an edit saved by the app
 *   between the read and the write is never overwritten.
 * - Reads every row in pages (PostgREST caps a single response at 1000 rows).
 *
 *   TENANT_SUPABASE_URL=... TENANT_SUPABASE_SERVICE_ROLE_KEY=... \
 *   PASTORAL_ENCRYPTION_KEY=<base64 32-byte key> \
 *   node scripts/backfill-pastoral-encryption.mjs [--apply]
 *
 * Also run by supabase/scripts/setup-e2e.sh after seeding, because
 * supabase/seed.sql inserts these fields as plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PAGE_SIZE = 500;

export const PASTORAL_FIELDS = [
  { table: "pastoral_notes", column: "content" },
  { table: "care_assignments", column: "summary" },
  { table: "church_documents", column: "body", filter: { column: "doc_type", value: "elder_council_notes" } },
];

export function parseKey(raw) {
  if (!raw) throw new Error("PASTORAL_ENCRYPTION_KEY is required.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(`PASTORAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key. Got ${key.length} bytes.`);
  }
  return key;
}

export function encryptValue(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** True when `stored` is valid ciphertext under `key`. */
export function isEncryptedWith(stored, key) {
  const raw = Buffer.from(stored, "base64");
  if (raw.length < IV_LENGTH + TAG_LENGTH + 1) return false;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_LENGTH));
    decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH));
    decipher.final();
    return true;
  } catch {
    return false;
  }
}

/**
 * True when `stored` has the shape of ciphertext (canonical base64 that
 * decodes to at least iv + tag + 1 byte). Plaintext prose almost never
 * round-trips as canonical base64, so a value like this that doesn't decrypt
 * under the given key signals a wrong key rather than legacy plaintext.
 */
export function looksLikeCiphertext(stored) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stored) || stored.length % 4 !== 0) return false;
  const raw = Buffer.from(stored, "base64");
  return raw.length >= IV_LENGTH + TAG_LENGTH + 1 && raw.toString("base64") === stored;
}

/**
 * Plans one field's updates: [{ id, original, value }]. Throws if any value
 * looks like ciphertext under a different key.
 */
export function planBackfill(rows, column, key, label = column) {
  const suspicious = rows.filter(
    (row) =>
      typeof row[column] === "string" &&
      row[column].length > 0 &&
      !isEncryptedWith(row[column], key) &&
      looksLikeCiphertext(row[column]),
  );
  if (suspicious.length > 0) {
    throw new Error(
      `${label}: ${suspicious.length} value(s) look encrypted but don't decrypt with this PASTORAL_ENCRYPTION_KEY ` +
        `(e.g. id ${suspicious[0].id}). This is almost always the wrong key. Nothing was written.`,
    );
  }
  return rows
    .filter((row) => typeof row[column] === "string" && row[column].length > 0)
    .filter((row) => !isEncryptedWith(row[column], key))
    .map((row) => ({ id: row.id, original: row[column], value: encryptValue(row[column], key) }));
}

async function readAllRows(supabase, { table, column, filter }) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(`id, ${column}`).order("id").range(from, from + PAGE_SIZE - 1);
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.TENANT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("TENANT_SUPABASE_URL and TENANT_SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  const key = parseKey(process.env.PASTORAL_ENCRYPTION_KEY);

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log(`Target: ${new URL(url).host}${apply ? "" : " (dry run; pass --apply to write)"}`);

  // Plan everything first, so a wrong-key signal on any field stops the run
  // before a single row is written.
  const plans = [];
  for (const field of PASTORAL_FIELDS) {
    const label = `${field.table}.${field.column}${field.filter ? ` (${field.filter.column}=${field.filter.value})` : ""}`;
    const rows = await readAllRows(supabase, field);
    const updates = planBackfill(rows, field.column, key, label);
    console.log(`${label}: ${rows.length} rows, ${updates.length} to encrypt`);
    plans.push({ field, label, updates });
  }
  if (!apply) return;

  for (const { field, label, updates } of plans) {
    let written = 0;
    for (const { id, original, value } of updates) {
      const { data, error } = await supabase
        .from(field.table)
        .update({ [field.column]: value })
        .eq("id", id)
        .eq(field.column, original)
        .select("id");
      if (error) throw new Error(`Failed to update ${field.table} ${id}: ${error.message}`);
      if (data?.length) written++;
      else console.warn(`${label}: row ${id} changed since it was read; skipped (re-run to pick it up).`);
    }
    console.log(`${label}: encrypted ${written}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
