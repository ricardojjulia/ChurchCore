import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import {
  TAX_SENTENCE,
  formatLocalDate,
  formatMoney,
  type DonorStatement,
  type StatementRange,
} from "./build";
import type { ChurchHeader } from "./load";

// The statement PDF (G3.3). Standard Helvetica (WinAnsi) only: no font files,
// no new assets. Layout is a pure model of positioned text items so the content
// can be asserted without parsing a compressed PDF stream.

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const RIGHT = PAGE_WIDTH - MARGIN;
const BOTTOM = MARGIN + 18; // footer sits below this
const DATE_X = MARGIN;
const FUND_X = 170;

// Code points WinAnsi (cp1252) encodes outside the Latin-1 printable range.
const WIN_ANSI_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split("").map((c) => c.codePointAt(0)),
);

/**
 * Replaces anything Helvetica's WinAnsi encoding cannot draw (emoji, CJK) with
 * "?", keeps Spanish accents and ñ, and never throws. Line breaks become spaces.
 */
export function sanitizeWinAnsi(text: string): string {
  let out = "";
  for (const char of String(text ?? "")) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0x300 && code <= 0x36f)) {
      // ZWJ, variation selectors and combining marks: dropped, never a stray "?".
      continue;
    }
    if (code < 0x20 || code === 0x7f) out += " ";
    else if (code <= 0x7e || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(code)) out += char;
    else out += "?";
  }
  return out;
}

export type PdfItem = {
  text: string;
  x: number;
  /** Distance from the top of the page. */
  y: number;
  size: number;
  bold: boolean;
  align: "left" | "right" | "center";
};

export type PdfPage = { items: PdfItem[] };

export type Measure = (text: string, size: number, bold: boolean) => number;

export type StatementPdfInput = {
  church: ChurchHeader;
  statement: DonorStatement;
  range: StatementRange;
};

function wrap(text: string, maxWidth: number, size: number, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, size, false) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fit(text: string, maxWidth: number, size: number, bold: boolean, measure: Measure): string {
  if (measure(text, size, bold) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}...`, size, bold) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}...`;
}

export function rangeLabel(range: StatementRange): string {
  return `${formatLocalDate(range.start)} - ${formatLocalDate(range.end)}`;
}

export function layoutStatement(input: StatementPdfInput, measure: Measure): PdfPage[] {
  const { church, statement, range } = input;
  const pages: PdfPage[] = [];
  let page: PdfPage = { items: [] };
  let y = MARGIN;

  const put = (text: string, x: number, size: number, bold = false, align: "left" | "right" = "left") => {
    page.items.push({ text: sanitizeWinAnsi(text), x, y, size, bold, align });
  };

  const headerBlock = (first: boolean) => {
    y = MARGIN;
    put(church.name, MARGIN, first ? 16 : 12, true);
    y += first ? 18 : 15;
    if (first) {
      const detail = [
        church.legalName && church.legalName !== church.name ? church.legalName : null,
        ...(church.mailingAddress ? church.mailingAddress.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []),
        [church.contactEmail, church.contactPhone].filter(Boolean).join("  |  ") || null,
        church.websiteUrl,
      ].filter((l): l is string => Boolean(l));
      for (const line of detail) {
        put(line, MARGIN, 10);
        y += 13;
      }
      y += 8;
    } else {
      put("Giving statement (continued)", MARGIN, 10);
      y += 18;
    }
  };

  const tableHeader = () => {
    put("Date", DATE_X, 10, true);
    put("Fund", FUND_X, 10, true);
    put("Amount", RIGHT, 10, true, "right");
    y += 14;
  };

  const newPage = (withTable: boolean) => {
    page = { items: [] };
    pages.push(page);
    headerBlock(false);
    if (withTable) tableHeader();
  };

  // Page 1.
  pages.push(page);
  headerBlock(true);
  put("Giving Statement", MARGIN, 18, true);
  y += 24;
  put(`Donor: ${statement.name}`, MARGIN, 11);
  y += 15;
  put(`Period: ${rangeLabel(range)}`, MARGIN, 11);
  y += 24;
  tableHeader();

  const ensure = (height: number, withTable: boolean) => {
    if (y + height > PAGE_HEIGHT - BOTTOM) newPage(withTable);
  };

  for (const line of statement.lines) {
    ensure(14, true);
    put(formatLocalDate(line.date), DATE_X, 10);
    put(fit(line.fund, RIGHT - 90 - FUND_X, 10, false, measure), FUND_X, 10);
    put(formatMoney(line.amountCents, line.currency), RIGHT, 10, false, "right");
    y += 14;
  }

  ensure(40, false);
  y += 10;
  put("Totals by fund", MARGIN, 11, true);
  y += 16;
  for (const sub of statement.fundSubtotals) {
    ensure(14, false);
    put(`${fit(sub.fund, RIGHT - 120 - MARGIN, 10, false, measure)} (${sub.count} gift${sub.count === 1 ? "" : "s"})`, MARGIN, 10);
    put(formatMoney(sub.cents, sub.currency), RIGHT, 10, false, "right");
    y += 14;
  }
  y += 4;
  const multi = statement.grandTotals.length > 1;
  for (const total of statement.grandTotals) {
    ensure(18, false);
    put(multi ? `Total (${total.currency.toUpperCase()})` : "Total", MARGIN, 11, true);
    put(formatMoney(total.cents, total.currency), RIGHT, 11, true, "right");
    y += 18;
  }

  y += 10;
  const taxLines = wrap(sanitizeWinAnsi(TAX_SENTENCE), RIGHT - MARGIN, 10, measure);
  ensure(taxLines.length * 13, false);
  for (const line of taxLines) {
    put(line, MARGIN, 10);
    y += 13;
  }

  // Footer on every page.
  pages.forEach((p, index) => {
    p.items.push({
      text: `Page ${index + 1} of ${pages.length}`,
      x: PAGE_WIDTH / 2,
      y: PAGE_HEIGHT - MARGIN,
      size: 9,
      bold: false,
      align: "center",
    });
  });
  return pages;
}

export async function renderStatementPdf(input: StatementPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const measure: Measure = (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(sanitizeWinAnsi(text), size);

  doc.setTitle(sanitizeWinAnsi(`Giving statement - ${rangeLabel(input.range)}`));
  doc.setProducer("ChurchCore");

  for (const layout of layoutStatement(input, measure)) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    for (const item of layout.items) {
      const font = item.bold ? bold : regular;
      const width = font.widthOfTextAtSize(item.text, item.size);
      const x = item.align === "center" ? item.x - width / 2 : item.align === "right" ? item.x - width : item.x;
      page.drawText(item.text, {
        x,
        y: PAGE_HEIGHT - item.y - item.size,
        size: item.size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }
  return doc.save();
}
