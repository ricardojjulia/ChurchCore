import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/send-email", () => ({ sendEmail: sendEmailMock }));

import { escapeHtml, postDonationToGl, sendDonationReceipt } from "@/lib/stripe/donation-completion";

describe("donation completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ ok: true });
  });

  it("escapes client-supplied donor names and fund labels in the receipt HTML (Council Review 22)", async () => {
    await sendDonationReceipt({
      to: "maya@example.org",
      donorName: `<a href="https://evil.example">Click</a>`,
      amountCents: 2500,
      fundDesignation: "<img src=x onerror=alert(1)>",
      donationId: "don-1",
      churchName: "Grace & Harbor",
    });

    const { html, idempotencyKey } = sendEmailMock.mock.calls[0][0] as { html: string; idempotencyKey: string };
    expect(html).not.toContain("<a href");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    expect(html).toContain("Grace &amp; Harbor");
    expect(idempotencyKey).toBe("don-1");
  });

  it("escapeHtml covers the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("posts a balanced journal once, and skips a gift already posted", async () => {
    const inserts: Array<{ table: string; row: unknown }> = [];
    let posted = false;
    const client = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq"]) chain[m] = () => chain;
        chain.maybeSingle = async () => {
          if (table === "donation_gl_posts") return { data: posted ? { id: "post-1" } : null };
          if (table === "giving_fund_accounts") return { data: { asset_account_id: "asset-1", income_account_id: "income-1" } };
          return { data: null };
        };
        chain.insert = (row: unknown) => {
          inserts.push({ table, row });
          if (table === "donation_gl_posts") posted = true;
          const result = Promise.resolve({ error: null });
          return Object.assign(result, { select: () => ({ single: async () => ({ data: { id: "journal-1" } }) }) });
        };
        return chain;
      },
    };

    await postDonationToGl(client as never, "don-1", "church-1", 2500, "General");
    await postDonationToGl(client as never, "don-1", "church-1", 2500, "General");

    expect(inserts.filter((i) => i.table === "finance_journals")).toHaveLength(1);
    const lines = inserts.find((i) => i.table === "finance_journal_lines")?.row as Array<{ side: string; amount_cents: number }>;
    expect(lines.map((l) => [l.side, l.amount_cents])).toEqual([
      ["debit", 2500],
      ["credit", 2500],
    ]);
  });
});
