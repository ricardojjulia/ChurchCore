import { describe, expect, it, vi } from "vitest";

// Mock server-only so the import doesn't fail in test environment
// (already handled by vitest.setup.ts global mock)

import { encryptPastoralField, decryptPastoralField } from "@/lib/crypto/pastoral";

// A valid 32-byte key, base64-encoded
const VALID_KEY_32_BYTES = Buffer.alloc(32, 0xab).toString("base64");

function withKey(fn: () => void) {
  const original = process.env.PASTORAL_ENCRYPTION_KEY;
  process.env.PASTORAL_ENCRYPTION_KEY = VALID_KEY_32_BYTES;
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env.PASTORAL_ENCRYPTION_KEY;
    } else {
      process.env.PASTORAL_ENCRYPTION_KEY = original;
    }
  }
}

function withoutKey(fn: () => void) {
  const original = process.env.PASTORAL_ENCRYPTION_KEY;
  delete process.env.PASTORAL_ENCRYPTION_KEY;
  try {
    fn();
  } finally {
    if (original !== undefined) {
      process.env.PASTORAL_ENCRYPTION_KEY = original;
    }
  }
}

describe("encryptPastoralField + decryptPastoralField", () => {
  describe("round-trip with valid key", () => {
    it("returns the original plaintext after encrypt then decrypt", () => {
      withKey(() => {
        const plaintext = "Pastor confidential note about John Smith.";
        const ciphertext = encryptPastoralField(plaintext);
        expect(decryptPastoralField(ciphertext)).toBe(plaintext);
      });
    });

    it("handles unicode characters in round-trip", () => {
      withKey(() => {
        const plaintext = "Care note: José García — follow up próximamente.";
        const ciphertext = encryptPastoralField(plaintext);
        expect(decryptPastoralField(ciphertext)).toBe(plaintext);
      });
    });
  });

  describe("random IV", () => {
    it("produces different ciphertexts for the same input (random IV)", () => {
      withKey(() => {
        const plaintext = "Same input produces different ciphertext each time.";
        const ct1 = encryptPastoralField(plaintext);
        const ct2 = encryptPastoralField(plaintext);
        expect(ct1).not.toBe(ct2);
      });
    });
  });

  describe("corrupted ciphertext", () => {
    it("throws on decrypt when ciphertext is corrupted", () => {
      withKey(() => {
        const plaintext = "Sensitive note.";
        const ciphertext = encryptPastoralField(plaintext);
        // Flip a few bytes deep in the ciphertext portion
        const buf = Buffer.from(ciphertext, "base64");
        buf[buf.length - 1] ^= 0xff;
        const corrupted = buf.toString("base64");
        expect(() => decryptPastoralField(corrupted)).toThrow(
          "decryptPastoralField: decryption failed"
        );
      });
    });
  });

  describe("missing key — production mode", () => {
    it("throws on encrypt when key is missing in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PASTORAL_ENCRYPTION_KEY", "");
      try {
        // Empty string key resolves to null in getKey() since Buffer.from("","base64") has length 0
        // But we need key to truly be absent (getKey returns null), not wrong length (throws).
        // Delete it so getKey returns null.
        delete process.env.PASTORAL_ENCRYPTION_KEY;
        expect(() => encryptPastoralField("sensitive")).toThrow(
          "PASTORAL_ENCRYPTION_KEY is not set"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("throws on decrypt when key is missing in production", () => {
      // Encrypt first with valid key
      process.env.PASTORAL_ENCRYPTION_KEY = VALID_KEY_32_BYTES;
      const ciphertext = encryptPastoralField("some note");

      vi.stubEnv("NODE_ENV", "production");
      delete process.env.PASTORAL_ENCRYPTION_KEY;
      try {
        expect(() => decryptPastoralField(ciphertext)).toThrow(
          "PASTORAL_ENCRYPTION_KEY is not set"
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe("missing key — development mode", () => {
    it("returns plaintext and calls console.warn on encrypt when key is missing", () => {
      withoutKey(() => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const plaintext = "dev note";
        const result = encryptPastoralField(plaintext);
        expect(result).toBe(plaintext);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("PASTORAL_ENCRYPTION_KEY is not set")
        );
        warnSpy.mockRestore();
      });
    });

    it("returns stored value and calls console.warn on decrypt when key is missing", () => {
      withoutKey(() => {
        // First encrypt with a valid key to get a long-enough ciphertext
        process.env.PASTORAL_ENCRYPTION_KEY = VALID_KEY_32_BYTES;
        const ciphertext = encryptPastoralField("some note");
        delete process.env.PASTORAL_ENCRYPTION_KEY;

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = decryptPastoralField(ciphertext);
        expect(result).toBe(ciphertext);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("PASTORAL_ENCRYPTION_KEY is not set")
        );
        warnSpy.mockRestore();
      });
    });
  });

  describe("key wrong length", () => {
    it("throws when key decodes to wrong length", () => {
      const shortKey = Buffer.alloc(16, 0xab).toString("base64"); // 16 bytes, not 32
      process.env.PASTORAL_ENCRYPTION_KEY = shortKey;
      try {
        expect(() => encryptPastoralField("test")).toThrow(
          "PASTORAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
        );
      } finally {
        delete process.env.PASTORAL_ENCRYPTION_KEY;
      }
    });
  });

  describe("plaintext detection on decrypt", () => {
    it("returns stored value as-is with a warn when value is too short to be encrypted", () => {
      withKey(() => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        // A short ASCII string — definitely not a valid encrypted blob
        const short = "hello";
        const result = decryptPastoralField(short);
        expect(result).toBe(short);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("appears to be plaintext")
        );
        warnSpy.mockRestore();
      });
    });
  });

  describe("empty input", () => {
    it("throws when plaintext is empty string", () => {
      withKey(() => {
        expect(() => encryptPastoralField("")).toThrow(
          "encryptPastoralField: plaintext must not be empty"
        );
      });
    });

    it("returns empty string unchanged on decrypt", () => {
      withKey(() => {
        expect(decryptPastoralField("")).toBe("");
      });
    });
  });
});
