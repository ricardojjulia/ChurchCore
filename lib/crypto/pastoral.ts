import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MIN_ENCRYPTED_BYTE_LENGTH = IV_LENGTH + TAG_LENGTH + 1; // at least 1 byte of ciphertext

function getKey(): Buffer | null {
  const raw = process.env.PASTORAL_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `PASTORAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key. Got ${key.length} bytes.`
    );
  }
  return key;
}

export function encryptPastoralField(plaintext: string): string {
  if (!plaintext) throw new Error("encryptPastoralField: plaintext must not be empty");

  const key = getKey();

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PASTORAL_ENCRYPTION_KEY is not set. Cannot encrypt pastoral data in production."
      );
    }
    console.warn(
      "[ChurchCore] WARNING: PASTORAL_ENCRYPTION_KEY is not set. " +
        "Pastoral data is stored unencrypted. Set the key before loading real data."
    );
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptPastoralField(stored: string): string {
  if (!stored) return stored;

  const raw = Buffer.from(stored, "base64");

  if (raw.length < MIN_ENCRYPTED_BYTE_LENGTH) {
    console.warn(
      "[ChurchCore] decryptPastoralField: value appears to be plaintext (too short to be encrypted). " +
        "Run the backfill script to encrypt existing rows."
    );
    return stored;
  }

  const key = getKey();

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PASTORAL_ENCRYPTION_KEY is not set. Cannot decrypt pastoral data in production."
      );
    }
    console.warn(
      "[ChurchCore] WARNING: PASTORAL_ENCRYPTION_KEY is not set. Returning raw stored value."
    );
    return stored;
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final("utf8");
  } catch (err) {
    throw new Error(
      `decryptPastoralField: decryption failed — bad key or corrupted ciphertext. ${(err as Error).message}`
    );
  }
}
