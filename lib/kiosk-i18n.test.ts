import { describe, expect, it } from "vitest";

import { messages } from "@/lib/i18n";

// G2.2: every kiosk and family-code string exists in en, es and es-PR.
const en = messages.en.kiosk as Record<string, string>;

describe("kiosk i18n namespace", () => {
  for (const locale of ["es", "es-PR"] as const) {
    const other = messages[locale].kiosk as Record<string, string>;

    it(`${locale} has exactly the en keys`, () => {
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    });

    it(`${locale} has no empty values and keeps every {placeholder}`, () => {
      for (const [key, value] of Object.entries(other)) {
        expect(value.trim().length, key).toBeGreaterThan(0);
        const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
        expect(placeholders(value), key).toEqual(placeholders(en[key]));
      }
    });
  }

  it("es differs from en for every key (no untranslated copy)", () => {
    const es = messages.es.kiosk as Record<string, string>;
    const same = Object.keys(en).filter((key) => es[key] === en[key]);
    expect(same).toEqual([]);
  });
});
