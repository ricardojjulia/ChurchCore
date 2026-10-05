import { describe, expect, it, vi } from "vitest";

import { resendUnsentReceipts } from "@/lib/stripe/resend-unsent-receipts";

function row(id: string, email: string | null = `${id}@example.org`) {
  return { id, church_id: "church-1", amount_cents: 5000, fund_designation: null, donor_name: "Donor", donor_email: email };
}

/** An admin client whose donations query returns `rows` once, recording the filters. */
function adminReturning(rows: ReturnType<typeof row>[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "order", "gt"]) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    });
  }
  chain.limit = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  return { admin: { from: vi.fn(() => chain) } as never, calls };
}

describe("resendUnsentReceipts", () => {
  it("selects succeeded gifts with no receipt_sent_at and a donor email", async () => {
    const { admin, calls } = adminReturning([]);
    await resendUnsentReceipts(admin, { apply: false });
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", "status", "succeeded"],
        ["is", "receipt_sent_at", null],
        ["not", "donor_email", "is", null],
      ]),
    );
  });

  it("dry run counts candidates and sends nothing", async () => {
    const { admin } = adminReturning([row("d1"), row("d2")]);
    const deliver = vi.fn();
    const result = await resendUnsentReceipts(admin, { apply: false, deliver });
    expect(result).toEqual({ candidates: 2, sent: 0, notConfigured: 0, failed: 0, dryRun: true });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("--apply delivers each receipt through the claim/lease code and counts outcomes", async () => {
    const { admin } = adminReturning([row("d1"), row("d2"), row("d3")]);
    const deliver = vi
      .fn()
      .mockResolvedValueOnce("sent")
      .mockResolvedValueOnce("not_configured")
      .mockRejectedValueOnce(new Error("Another attempt is sending this receipt; retry later."));
    const result = await resendUnsentReceipts(admin, { apply: true, deliver });
    expect(result).toEqual({ candidates: 3, sent: 1, notConfigured: 1, failed: 1, dryRun: false });
    expect(deliver).toHaveBeenCalledWith(admin, "church-1", expect.objectContaining({ id: "d1" }), "d1@example.org");
  });

  it("returns counts only, never an email or a name", async () => {
    const { admin } = adminReturning([row("d1")]);
    const result = await resendUnsentReceipts(admin, { apply: true, deliver: vi.fn().mockResolvedValue("sent") });
    expect(JSON.stringify(result)).not.toMatch(/@|Donor/);
  });

  it("surfaces a query error", async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "not", "order", "gt"]) chain[m] = () => chain;
    chain.limit = () => Promise.resolve({ data: null, error: { message: "boom" } });
    await expect(resendUnsentReceipts({ from: () => chain } as never, { apply: false })).rejects.toThrow("boom");
  });
});
