// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { TAX_SENTENCE, type DonorStatement } from "./build";
import type { ChurchHeader } from "./load";
import { layoutStatement, renderStatementPdf, sanitizeWinAnsi } from "./pdf";

const church: ChurchHeader = {
  name: "Grace Harbor Church",
  legalName: "Grace Harbor Ministries Inc.",
  mailingAddress: "12 Harbor Rd\nSan Juan, PR 00901",
  contactEmail: "office@graceharbor.church",
  contactPhone: "555-0100",
  websiteUrl: null,
};
const range = { start: "2025-01-01", end: "2025-12-31" };
const measure = (text: string, size: number) => text.length * size * 0.5;

function statement(count: number, name = "Pat Giver", fund = "General"): DonorStatement {
  const lines = Array.from({ length: count }, (_, i) => ({
    giftId: `g${i}`,
    date: `2025-${String((i % 12) + 1).padStart(2, "0")}-15`,
    fund,
    amountCents: 1000 + i,
    currency: "usd",
    anonymous: false,
  }));
  const total = lines.reduce((sum, l) => sum + l.amountCents, 0);
  return {
    donorKey: "p:p1",
    profileId: "p1",
    name,
    staffName: name,
    email: "pat@x.org",
    lines,
    fundSubtotals: [{ fund, currency: "usd", cents: total, count }],
    grandTotals: [{ currency: "usd", cents: total }],
    giftCount: count,
    totalCents: total,
    anonymousGiftCount: 0,
  };
}

const textOf = (pages: ReturnType<typeof layoutStatement>) => pages.flatMap((p) => p.items.map((i) => i.text));

describe("sanitizeWinAnsi", () => {
  it("keeps Spanish accents, ñ and WinAnsi punctuation", () => {
    expect(sanitizeWinAnsi("María Núñez-Peña ¿Dónde? €5 “ok” – ü")).toBe("María Núñez-Peña ¿Dónde? €5 “ok” – ü");
  });
  it("replaces emoji and CJK without throwing", () => {
    expect(sanitizeWinAnsi("Joy 😀 教会")).toBe("Joy ? ??");
    expect(sanitizeWinAnsi("👨‍👩‍👧")).toBe("???");
    expect(sanitizeWinAnsi("a\nb\t")).toBe("a b ");
  });
  it("never throws on odd input", () => {
    expect(() => sanitizeWinAnsi(undefined as unknown as string)).not.toThrow();
    expect(sanitizeWinAnsi("\ud800")).toBe("?");
  });
});

describe("layoutStatement", () => {
  it("shows the header, donor, period, gifts, totals and the tax sentence", () => {
    const text = textOf(layoutStatement({ church, statement: statement(3), range }, measure));
    expect(text).toContain("Grace Harbor Church");
    expect(text).toContain("Grace Harbor Ministries Inc.");
    expect(text).toContain("12 Harbor Rd");
    expect(text).toContain("office@graceharbor.church  |  555-0100");
    expect(text).toContain("Donor: Pat Giver");
    expect(text).toContain("Period: Jan 1, 2025 - Dec 31, 2025");
    expect(text).toContain("Jan 15, 2025");
    expect(text).toContain("$10.00");
    expect(text).toContain("Total");
    expect(text.join(" ")).toContain(TAX_SENTENCE.split(" ").slice(0, 4).join(" "));
    expect(text.join(" ").replace(/\s+/g, " ")).toContain(TAX_SENTENCE);
    expect(text.join(" ")).not.toMatch(/EIN|Tax ID|tax id/);
  });

  it("goes multi-page for many gifts, repeating the header and numbering pages", () => {
    const pages = layoutStatement({ church, statement: statement(150), range }, measure);
    expect(pages.length).toBeGreaterThan(2);
    for (const [i, page] of pages.entries()) {
      const text = page.items.map((p) => p.text);
      expect(text).toContain("Grace Harbor Church");
      expect(text).toContain(`Page ${i + 1} of ${pages.length}`);
      if (i > 0) expect(text).toContain("Giving statement (continued)");
    }
    const all = textOf(pages);
    expect(all.filter((t) => t.startsWith("Period:"))).toHaveLength(1);
    expect(all.filter((t) => t === "$10.00").length).toBeGreaterThan(0);
    // Every item sits inside the page.
    for (const item of pages.flatMap((p) => p.items)) expect(item.y).toBeLessThan(792);
  });

  it("replaces unsupported characters and keeps accents in the model", () => {
    const text = textOf(layoutStatement({ church, statement: statement(1, "José Núñez 😀 教", "Misiones 🌍"), range }, measure)).join("|");
    expect(text).toContain("José Núñez ? ?");
    expect(text).toContain("Misiones ?");
  });

  it("labels totals per currency when mixed", () => {
    const s = statement(1);
    s.grandTotals = [{ currency: "eur", cents: 5 }, { currency: "usd", cents: 7 }];
    const text = textOf(layoutStatement({ church, statement: s, range }, measure));
    expect(text).toContain("Total (EUR)");
    expect(text).toContain("Total (USD)");
  });
});

describe("renderStatementPdf", () => {
  it("produces a valid PDF with the right page count", async () => {
    const bytes = await renderStatementPdf({ church, statement: statement(3), range });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("is multi-page for about 150 gifts", async () => {
    const bytes = await renderStatementPdf({ church, statement: statement(150), range });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });

  it("renders emoji, CJK, accents and a long fund name without throwing", async () => {
    const s = statement(2, "María 😀 教会 Núñez", `${"Fondo ".repeat(30)}ñ`);
    const bytes = await renderStatementPdf({ church: { ...church, name: "Iglesia Ñandú 🙏" }, statement: s, range });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
