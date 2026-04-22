import { describe, expect, it } from "vitest";

import {
  csvRowsToPreview,
  iifToPreview,
  normalizeDate,
  ofxToPreview,
  parseDollarsToCents,
  parseIif,
  parseOfx,
} from "@/lib/finance-import";

describe("finance import helpers", () => {
  it("parses dollar strings into integer cents", () => {
    expect(parseDollarsToCents("$1,234.56")).toBe(123456);
    expect(parseDollarsToCents("-19.99")).toBe(-1999);
    expect(parseDollarsToCents("not-a-number")).toBe(0);
  });

  it("normalizes common date formats", () => {
    expect(normalizeDate("2026-04-21T14:00:00Z")).toBe("2026-04-21");
    expect(normalizeDate("4/7/2026")).toBe("2026-04-07");
    expect(normalizeDate("04-07-2026")).toBe("2026-04-07");
    expect(normalizeDate("20260421")).toBe("2026-04-21");
    expect(normalizeDate("April 7, 2026")).toBeNull();
  });

  it("maps CSV rows into preview rows with validation", () => {
    const preview = csvRowsToPreview(
      [
        {
          Posted: "04/21/2026",
          Description: "Sunday giving",
          Amount: "$125.00",
          Ref: "DEP-42",
        },
        {
          Posted: "bad-date",
          Description: "Broken row",
          Amount: "$0.00",
          Ref: "DEP-43",
        },
      ],
      {
        date: "Posted",
        description: "Description",
        amount: "Amount",
        reference: "Ref",
        debitAccount: null,
        creditAccount: null,
      },
    );

    expect(preview[0]).toMatchObject({
      date: "2026-04-21",
      description: "Sunday giving",
      amountCents: 12500,
      reference: "DEP-42",
      error: null,
    });
    expect(preview[1]?.error).toBe("Invalid date");
  });

  it("parses QuickBooks IIF transactions and converts them to preview rows", () => {
    const { transactions, errors } = parseIif([
      "!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO",
      "!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO",
      "TRNS\tDEPOSIT\t04/20/2026\tChecking\tGeneral Fund\t125.50\t1001\tOnline giving",
      "SPL\tDEPOSIT\t04/20/2026\tTithes Income\tGeneral Fund\t-125.50\t1001\tOnline giving",
      "ENDTRNS",
    ].join("\n"));

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      date: "2026-04-20",
      accountName: "Checking",
      splitAccountName: "Tithes Income",
      amountCents: 12550,
    });

    expect(iifToPreview(transactions)[0]).toMatchObject({
      amountCents: 12550,
      debitAccountCode: "Tithes Income",
      creditAccountCode: "Checking",
      error: null,
    });
  });

  it("parses OFX transactions and converts debit or credit directions", () => {
    const { transactions, errors } = parseOfx([
      "OFXHEADER:100",
      "<OFX>",
      "<BANKTRANLIST>",
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260421",
      "<TRNAMT>-42.15",
      "<FITID>abc-123",
      "<NAME>Coffee Fellowship",
      "<MEMO>Hospitality",
      "</STMTTRN>",
      "</BANKTRANLIST>",
      "</OFX>",
    ].join("\n"));

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(1);

    expect(ofxToPreview(transactions)[0]).toMatchObject({
      date: "2026-04-21",
      amountCents: 4215,
      description: "Coffee Fellowship — Hospitality",
      creditAccountCode: "BANK",
      debitAccountCode: null,
      error: null,
    });
  });
});