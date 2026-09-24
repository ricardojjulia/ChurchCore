import { createDecipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  encryptValue,
  isEncryptedWith,
  looksLikeCiphertext,
  parseKey,
  planBackfill,
} from "../../scripts/backfill-pastoral-encryption.mjs";

const key = randomBytes(32);

function decrypt(stored: string, k: Buffer): string {
  const raw = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return decipher.update(raw.subarray(28)) + decipher.final("utf8");
}

describe("backfill-pastoral-encryption", () => {
  it("encrypts in the lib/crypto/pastoral.ts format (iv|tag|ciphertext, base64)", () => {
    const stored = encryptValue("Hospital visit follow-up", key);
    expect(decrypt(stored, key)).toBe("Hospital visit follow-up");
  });

  it("recognises values already encrypted with the key, and nothing else", () => {
    expect(isEncryptedWith(encryptValue("note", key), key)).toBe(true);
    expect(isEncryptedWith(encryptValue("note", randomBytes(32)), key)).toBe(false);
    expect(isEncryptedWith("A long plaintext pastoral summary that base64-decodes to junk", key)).toBe(false);
    expect(isEncryptedWith("short", key)).toBe(false);
  });

  it("plans updates only for non-empty plaintext rows, so re-runs are no-ops", () => {
    const rows = [
      { id: "a", summary: "Plaintext summary needing encryption" },
      { id: "b", summary: encryptValue("already encrypted", key) },
      { id: "c", summary: null },
      { id: "d", summary: "" },
    ];

    const plan = planBackfill(rows, "summary", key);
    expect(plan.map((u: { id: string }) => u.id)).toEqual(["a"]);
    expect(decrypt(plan[0].value, key)).toBe("Plaintext summary needing encryption");

    const afterFirstRun = rows.map((row) => (row.id === "a" ? { ...row, summary: plan[0].value } : row));
    expect(planBackfill(afterFirstRun, "summary", key)).toEqual([]);
  });

  it("keeps each row's original value so the update can be guarded against concurrent edits", () => {
    const plan = planBackfill([{ id: "a", summary: "Plaintext summary" }], "summary", key);
    expect(plan[0].original).toBe("Plaintext summary");
  });

  it("refuses the whole plan when a value looks encrypted under a different key", () => {
    const otherKey = randomBytes(32);
    const rows = [
      { id: "a", summary: "Plaintext summary needing encryption" },
      { id: "b", summary: encryptValue("encrypted elsewhere", otherKey) },
    ];
    expect(() => planBackfill(rows, "summary", key)).toThrow("wrong key");
  });

  it("tells ciphertext-shaped values apart from plaintext prose", () => {
    expect(looksLikeCiphertext(encryptValue("note", key))).toBe(true);
    expect(looksLikeCiphertext("Hospital visit follow-up with Elena")).toBe(false);
    expect(looksLikeCiphertext("short")).toBe(false);
  });

  it("rejects a missing or wrong-length key", () => {
    expect(() => parseKey(undefined)).toThrow("PASTORAL_ENCRYPTION_KEY is required");
    expect(() => parseKey(Buffer.alloc(16).toString("base64"))).toThrow("32-byte key");
    expect(parseKey(key.toString("base64"))).toHaveLength(32);
  });
});
