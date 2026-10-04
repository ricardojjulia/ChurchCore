import { describe, expect, it } from "vitest";

import { TAX_SENTENCE, type DonorStatement } from "./build";
import { escapeHtml, renderStatementEmail } from "./email";
import type { ChurchHeader } from "./load";

const church: ChurchHeader = {
  name: "Grace <Harbor> & Co",
  legalName: null,
  mailingAddress: "12 Harbor Rd\nSan Juan",
  contactEmail: "o@g.org",
  contactPhone: null,
  websiteUrl: null,
};
const statement: DonorStatement = {
  donorKey: "p:p1",
  profileId: "p1",
  name: `Pat "<script>alert(1)</script>"`,
  staffName: "Pat",
  email: "p@x.org",
  lines: [
    { giftId: "1", date: "2025-03-02", fund: "Missions & <b>Relief</b>", amountCents: 12345, currency: "usd", anonymous: false },
    { giftId: "2", date: "2025-04-02", fund: "General", amountCents: 100, currency: "usd", anonymous: false },
  ],
  fundSubtotals: [
    { fund: "General", currency: "usd", cents: 100, count: 1 },
    { fund: "Missions & <b>Relief</b>", currency: "usd", cents: 12345, count: 1 },
  ],
  grandTotals: [{ currency: "usd", cents: 12445 }],
  giftCount: 2,
  totalCents: 12445,
  anonymousGiftCount: 0,
};
const range = { start: "2025-01-01", end: "2025-12-31" };

describe("renderStatementEmail", () => {
  const email = renderStatementEmail({ church, statement, range });

  it("carries the statement content in plain text", () => {
    expect(email.subject).toContain("Grace <Harbor> & Co");
    expect(email.text).toContain("Donor: ");
    expect(email.text).toContain("Period: Jan 1, 2025 - Dec 31, 2025");
    expect(email.text).toContain("Mar 2, 2025  Missions & <b>Relief</b>  $123.45");
    expect(email.text).toContain("General (1 gift): $1.00");
    expect(email.text).toContain("Total: $124.45");
    expect(email.text).toContain(TAX_SENTENCE);
    expect(email.text).toContain("12 Harbor Rd");
  });

  it("keeps the subject on one line whatever the church name holds", () => {
    const evil = renderStatementEmail({ church: { ...church, name: "Evil\r\nBcc: x@y.z" }, statement, range });
    expect(evil.subject).toBe("Your giving statement from Evil Bcc: x@y.z");
  });

  it("carries the same content as escaped HTML", () => {
    expect(email.html).toContain("$123.45");
    expect(email.html).toContain("$124.45");
    expect(email.html).toContain(TAX_SENTENCE);
    expect(email.html).toContain("Missions &amp; &lt;b&gt;Relief&lt;/b&gt;");
    expect(email.html).toContain("Grace &lt;Harbor&gt; &amp; Co");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>Relief");
  });

  it("never invents a tax id", () => {
    expect(`${email.text}${email.html}`).not.toMatch(/\bEIN\b|Tax ID/i);
  });

  it("escapes html", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
});
