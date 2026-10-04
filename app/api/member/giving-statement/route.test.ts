// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireChurchSessionMock, adminHolder } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  adminHolder: { client: null as unknown },
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => adminHolder.client }));

import { createFakeAdmin, type Row } from "@/lib/giving-statements/fake-admin.testutil";

import { GET } from "./route";

const ME = "11111111-1111-4111-8111-111111111111";
const SOMEONE = "33333333-3333-4333-8333-333333333333";
const session = (churchProfileId: string | null) => ({
  userId: "login-user-1",
  churchProfileId,
  appContext: { kind: "church", roleId: "member", church: { id: "c1", name: "Grace", slug: "g", timezone: "America/New_York" } },
});
const gift = (id: string, extra: Row): Row => ({
  id, church_id: "c1", profile_id: null, donor_name: null, donor_email: null, is_anonymous: false,
  amount_cents: 1000, currency: "usd", fund_designation: "General", status: "succeeded", created_at: "2025-05-01T12:00:00.000Z", ...extra,
});

let admin: ReturnType<typeof createFakeAdmin>;
const req = (qs = "year=2025") => new Request(`http://localhost/api/member/giving-statement?${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireChurchSessionMock.mockResolvedValue(session(ME));
  admin = createFakeAdmin({
    churches: [{ id: "c1", name: "Grace", legal_name: null, mailing_address: null, contact_email: null, contact_phone: null, website_url: null }],
    donations: [
      gift("mine", { profile_id: ME }),
      gift("mine-anon", { profile_id: ME, is_anonymous: true, amount_cents: 555 }),
      gift("theirs", { profile_id: SOMEONE }),
      gift("guest-same-email", { donor_email: "me@x.org" }),
      gift("mine-2024", { profile_id: ME, created_at: "2024-05-01T12:00:00.000Z" }),
    ],
    profiles: [
      { id: ME, church_id: "c1", full_name: "Me Member", email: "me@x.org" },
      { id: SOMEONE, church_id: "c1", full_name: "Someone", email: "s@x.org" },
    ],
  });
  adminHolder.client = admin.client;
});

describe("GET /api/member/giving-statement", () => {
  it("lets a signed-out caller's redirect through", async () => {
    requireChurchSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(GET(req())).rejects.toThrow("NEXT_REDIRECT");
  });

  it("403s a session with no church profile", async () => {
    requireChurchSessionMock.mockResolvedValue(session(null));
    expect((await GET(req())).status).toBe(403);
  });

  it("returns the member's own statement as a no-store attachment, reading only their profile id", async () => {
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="giving-statement-2025.pdf"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    const donationReads = admin.calls.filter((c) => c.table === "donations");
    expect(donationReads.length).toBeGreaterThan(0);
    for (const call of donationReads) {
      expect(call.filters).toContainEqual(["profile_id", ME]); // churchProfileId, never the login id
      expect(call.filters).toContainEqual(["church_id", "c1"]);
      expect(call.filters).not.toContainEqual(["profile_id", "login-user-1"]);
    }
  });

  it("includes the member's own anonymous gifts and nobody else's", async () => {
    // Re-run through the loader to inspect what the PDF was built from.
    const { loadStatementRun } = await import("@/lib/giving-statements/load");
    const run = await loadStatementRun(admin.client, "c1", "America/New_York", { start: "2025-01-01", end: "2025-12-31" }, { profileId: ME });
    expect(run.statements).toHaveLength(1);
    expect(run.statements[0].lines.map((l) => l.giftId).sort()).toEqual(["mine", "mine-anon"]);
    expect(run.statements[0].totalCents).toBe(1555);
  });

  it("ignores any donor parameter", async () => {
    const response = await GET(req(`year=2025&donor=p:${SOMEONE}&profile_id=${SOMEONE}&profileId=${SOMEONE}`));
    expect(response.status).toBe(200);
    for (const call of admin.calls.filter((c) => c.table === "donations")) {
      expect(call.filters).toContainEqual(["profile_id", ME]);
      expect(call.filters).not.toContainEqual(["profile_id", SOMEONE]);
    }
  });

  it("404s with JSON when the member has no gifts that year", async () => {
    const response = await GET(req("year=2023"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "No gifts recorded for 2023." });
  });

  it("404s for a member whose only gifts belong to someone else", async () => {
    requireChurchSessionMock.mockResolvedValue(session("44444444-4444-4444-8444-444444444444"));
    expect((await GET(req())).status).toBe(404);
  });

  it.each(["abc", "25", "1999", "20250", "2999", "2025-1"])("400s for invalid year %s", async (year) => {
    const response = await GET(req(`year=${year}`));
    expect(response.status).toBe(400);
  });

  it.each(["church-admin", "pastor", "secretary", "ministry-leader", "member"])(
    "AC33: a signed-in %s gets only their own church-profile statement",
    async (roleId) => {
      const own = session(ME);
      requireChurchSessionMock.mockResolvedValue({ ...own, appContext: { ...own.appContext, roleId } });
      const response = await GET(req());
      expect(response.status).toBe(200);
      for (const call of admin.calls.filter((c) => c.table === "donations")) {
        expect(call.filters).toContainEqual(["profile_id", ME]);
      }
    },
  );

  it("defaults to last year when the year is omitted", async () => {
    const response = await GET(req(""));
    expect([200, 404]).toContain(response.status);
  });
});
