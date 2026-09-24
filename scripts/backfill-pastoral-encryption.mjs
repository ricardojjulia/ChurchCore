#!/usr/bin/env node
/**
 * Encrypts legacy plaintext pastoral fields at rest
 * (docs/setup/production-deployment.md §12).
 *
 * Fields: pastoral_notes.content and care_assignments.summary, using the same
 * AES-256-GCM format as lib/crypto/pastoral.ts (base64 of iv[12] | tag[16] |
 * ciphertext).
 *
 * Idempotent: a value that already decrypts with PASTORAL_ENCRYPTION_KEY is
 * left alone, so re-running is safe. Pass --dry-run to report without writing.
 *
 *   TENANT_SUPABASE_URL=... TENANT_SUPABASE_SERVICE_ROLE_KEY=... \
 *   PASTORAL_ENCRYPTION_KEY=<base64 32-byte key> \
 *   node scripts/backfill-pastoral-encryption.mjs [--dry-run]
 *
 * Also run by the e2e CI job after seeding, because supabase/seed.sql inserts
 * these fields as plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export const PASTORAL_FIELDS = [
  { table: "pastoral_notes", column: "content" },
  { table: "care_assignments", column: "summary" },
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

/** Returns the updates needed for one table's rows: [{ id, value }]. */
export function planBackfill(rows, column, key) {
  return rows
    .filter((row) => typeof row[column] === "string" && row[column].length > 0)
    .filter((row) => !isEncryptedWith(row[column], key))
    .map((row) => ({ id: row.id, value: encryptValue(row[column], key) }));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.TENANT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("TENANT_SUPABASE_URL and TENANT_SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  const key = parseKey(process.env.PASTORAL_ENCRYPTION_KEY);

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  for (const { table, column } of PASTORAL_FIELDS) {
    const { data, error } = await supabase.from(table).select(`id, ${column}`);
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);

    const updates = planBackfill(data ?? [], column, key);
    console.log(`${table}.${column}: ${data?.length ?? 0} rows, ${updates.length} to encrypt${dryRun ? " (dry run)" : ""}`);
    if (dryRun) continue;

    for (const { id, value } of updates) {
      const { error: updateError } = await supabase.from(table).update({ [column]: value }).eq("id", id);
      if (updateError) throw new Error(`Failed to update ${table} ${id}: ${updateError.message}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
