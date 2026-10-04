import { describe, expect, it } from "vitest";

import { createFakeAdmin, type Row } from "./fake-admin.testutil";
import { listStatementYears, loadChurchHeader, loadGifts, loadStatementRun } from "./load";

const NY = "America/New_York";
const range = { start: "2025-01-01", end: "2025-12-31" };
const d = (id: string, extra: Row): Row => ({
  id, church_id: "c1", profile_id: null, donor_name: null, donor_email: null, is_anonymous: false,
  amount_cents: 100, currency: "usd", fund_designation: null, status: "succeeded", created_at: "2025-05-01T12:00:00.000Z", ...extra,
});

describe("loadGifts / loadStatementRun", () => {
  const seed = {
    donations: [
      d("in", { profile_id: "p1" }),
      d("edge-in", { profile_id: "p1", created_at: "2026-01-01T04:59:59.000Z" }),
      d("edge-out", { profile_id: "p1", created_at: "2026-01-01T05:00:00.000Z" }),
      d("before", { profile_id: "p1", created_at: "2025-01-01T04:59:59.000Z" }),
      d("refunded", { profile_id: "p1", status: "refunded" }),
      d("other-church", { church_id: "c2", profile_id: "p1" }),
      d("other-profile", { profile_id: "p2" }),
    ],
    profiles: [
      { id: "p1", church_id: "c1", full_name: "Pat", email: "pat@x.org" },
      { id: "p2", church_id: "c1", full_name: "Quinn", email: null },
      { id: "p1", church_id: "c2", full_name: "Evil Twin", email: "evil@x.org" },
    ],
  };

  it("reads only this church's succeeded gifts in the local-day range", async () => {
    const { client, calls } = createFakeAdmin(seed);
    const gifts = await loadGifts(client, "c1", NY, range);
    expect(gifts.map((g) => g.id).sort()).toEqual(["edge-in", "in", "other-profile"]);
    expect(calls.every((c) => c.filters.some(([col, v]) => col === "church_id" && v === "c1"))).toBe(true);
  });

  it("narrows to one profile when asked", async () => {
    const { client } = createFakeAdmin(seed);
    expect((await loadGifts(client, "c1", NY, range, { profileId: "p1" })).map((g) => g.id).sort()).toEqual(["edge-in", "in"]);
  });

  it("pages past 1000 rows", async () => {
    const many = Array.from({ length: 1500 }, (_, i) => d(`g${String(i).padStart(4, "0")}`, { profile_id: "p1" }));
    const { client } = createFakeAdmin({ donations: many });
    expect(await loadGifts(client, "c1", NY, range)).toHaveLength(1500);
  });

  it("builds statements with the church's own profile names", async () => {
    const { client } = createFakeAdmin(seed);
    const run = await loadStatementRun(client, "c1", NY, range);
    expect(run.statements.map((s) => s.name)).toEqual(["Pat", "Quinn"]);
    expect(JSON.stringify(run)).not.toContain("Evil Twin");
  });

  it("throws on a read error rather than returning partial data", async () => {
    const { client } = createFakeAdmin(seed, { failOn: (_o, t) => (t === "donations" ? { message: "nope" } : undefined) });
    await expect(loadGifts(client, "c1", NY, range)).rejects.toThrow(/nope/);
  });

  it("rejects a malformed range", async () => {
    const { client } = createFakeAdmin(seed);
    await expect(loadGifts(client, "c1", NY, { start: "x", end: "y" })).rejects.toThrow(/Invalid statement range/);
  });
});

describe("listStatementYears", () => {
  it("lists church-local years newest first for the profile only", async () => {
    const { client } = createFakeAdmin({
      donations: [
        d("a", { profile_id: "p1", created_at: "2026-01-01T04:30:00.000Z" }), // Dec 31 2025 local
        d("b", { profile_id: "p1", created_at: "2023-03-01T12:00:00.000Z" }),
        d("c", { profile_id: "p1", created_at: "2024-03-01T12:00:00.000Z", status: "failed" }),
        d("d", { profile_id: "p2", created_at: "2022-03-01T12:00:00.000Z" }),
        d("e", { church_id: "c2", profile_id: "p1", created_at: "2021-03-01T12:00:00.000Z" }),
      ],
    });
    expect(await listStatementYears(client, "c1", "p1", NY)).toEqual([2025, 2023]);
  });
});

describe("loadChurchHeader", () => {
  it("reads the header fields from churches", async () => {
    const { client } = createFakeAdmin({
      churches: [{ id: "c1", name: "Grace", legal_name: " Grace Inc ", mailing_address: "1 Main", contact_email: "a@b.c", contact_phone: null, website_url: null }],
    });
    expect(await loadChurchHeader(client, "c1")).toEqual({
      name: "Grace", legalName: "Grace Inc", mailingAddress: "1 Main", contactEmail: "a@b.c", contactPhone: null, websiteUrl: null,
    });
  });
  it("throws when the church is missing", async () => {
    const { client } = createFakeAdmin({ churches: [] });
    await expect(loadChurchHeader(client, "c1")).rejects.toThrow();
  });
});
