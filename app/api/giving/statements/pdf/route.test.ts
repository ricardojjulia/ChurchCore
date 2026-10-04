// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireChurchSessionMock, adminHolder, auditMock, renderSpy } = vi.hoisted(() => ({
  renderSpy: vi.fn(),
  requireChurchSessionMock: vi.fn(),
  adminHolder: { client: null as unknown },
  auditMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => adminHolder.client }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: auditMock }));
vi.mock("@/lib/giving-statements/pdf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/giving-statements/pdf")>("@/lib/giving-statements/pdf");
  return {
    ...actual,
    renderStatementPdf: (input: Parameters<typeof actual.renderStatementPdf>[0]) => {
      renderSpy(input);
      return actual.renderStatementPdf(input);
    },
  };
});

import { donorRef } from "@/lib/giving-statements/build";
import { createFakeAdmin, type Row } from "@/lib/giving-statements/fake-admin.testutil";

import { GET } from "./route";

const sessionFor = (roleId: string) => ({
  userId: "login-user-1",
  churchProfileId: "00000000-0000-4000-8000-000000000009",
  appContext: { kind: "church", roleId, church: { id: "c1", name: "Grace", slug: "g", timezone: "America/New_York" } },
});

const P1 = "11111111-1111-4111-8111-111111111111";
const ANON_ONLY = "55555555-5555-4555-8555-555555555555";
const OTHER_CHURCH_PROFILE = "22222222-2222-4222-8222-222222222222";
const gift = (id: string, extra: Row): Row => ({
  id, church_id: "c1", profile_id: null, donor_name: null, donor_email: null, is_anonymous: false,
  amount_cents: 1000, currency: "usd", fund_designation: "General", status: "succeeded", created_at: "2025-05-01T12:00:00.000Z", ...extra,
});

const url = (donor: string | null, extra = "start=2025-01-01&end=2025-12-31") =>
  new Request(`http://localhost/api/giving/statements/pdf?${donor === null ? "" : `donor=${encodeURIComponent(donor)}&`}${extra}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireChurchSessionMock.mockResolvedValue(sessionFor("church-admin"));
  auditMock.mockResolvedValue(undefined);
  adminHolder.client = createFakeAdmin({
    churches: [{ id: "c1", name: "Grace", legal_name: null, mailing_address: null, contact_email: null, contact_phone: null, website_url: null }],
    donations: [
      gift("1", { profile_id: P1, amount_cents: 1000 }),
      gift("1b", { profile_id: P1, is_anonymous: true, amount_cents: 4242 }),
      gift("1c", { profile_id: ANON_ONLY, is_anonymous: true, amount_cents: 777 }),
      gift("1d", { donor_email: "anonguest@x.org", donor_name: null, is_anonymous: true, amount_cents: 321 }),
      gift("2", { donor_email: "guest@x.org", donor_name: "Gus" }),
      gift("3", { church_id: "c2", profile_id: OTHER_CHURCH_PROFILE }),
    ],
    profiles: [
      { id: P1, church_id: "c1", full_name: "Pat", email: "pat@x.org" },
      { id: ANON_ONLY, church_id: "c1", full_name: "Hidden Hannah", email: "hannah@x.org" },
      { id: OTHER_CHURCH_PROFILE, church_id: "c2", full_name: "Elsewhere", email: "e@y.org" },
    ],
  }).client;
});

describe("GET /api/giving/statements/pdf", () => {
  it.each(["secretary", "pastor", "ministry-leader", "member"])("denies %s with 403", async (role) => {
    requireChurchSessionMock.mockResolvedValue(sessionFor(role));
    const response = await GET(url(`p:${P1}`));
    expect(response.status).toBe(403);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("lets a signed-out caller's redirect through", async () => {
    requireChurchSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(GET(url(`p:${P1}`))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("returns an attachment PDF with no-store, and audits it", async () => {
    const response = await GET(url(`p:${P1}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="giving-statement-2025-01-01-to-2025-12-31\.pdf"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      tableName: "giving_statements",
      actorId: "login-user-1",
      churchId: "c1",
      newValues: { action: "pdf_download", donorRef: `p:${P1}`, start: "2025-01-01", end: "2025-12-31" },
    });
  });

  it("renders ONLY the donor's named gifts for staff, omitting anonymous gifts", async () => {
    await GET(url(`p:${P1}`));
    const input = renderSpy.mock.calls[0][0];
    expect(input.statement.lines.map((l: { giftId: string }) => l.giftId)).toEqual(["1"]);
    expect(input.statement.totalCents).toBe(1000);
    expect(JSON.stringify(input.statement)).not.toContain("4242");
  });

  it("404s for a donor with only anonymous gifts, never rendering or auditing", async () => {
    const response = await GET(url(`p:${ANON_ONLY}`));
    expect(response.status).toBe(404);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("Hannah");
  });

  it("404s for a guest whose gifts are all anonymous", async () => {
    expect((await GET(url(donorRef("e:anonguest@x.org")))).status).toBe(404);
  });

  it("rejects raw e: donor keys with 400 and anything not p:/h:", async () => {
    expect((await GET(url("e:guest@x.org"))).status).toBe(400);
    expect((await GET(url("guest@x.org"))).status).toBe(400);
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("accepts a guest's hashed ref and audits the hash, not the email", async () => {
    adminHolder.client = createFakeAdmin({
      churches: [{ id: "c1", name: "Grace", legal_name: null, mailing_address: null, contact_email: null, contact_phone: null, website_url: null }],
      donations: [gift("g1", { donor_email: "guest@x.org", donor_name: "Gus" })],
    }).client;
    const ref = donorRef("e:guest@x.org");
    const response = await GET(url(ref));
    expect(response.status).toBe(200);
    const audit = JSON.stringify(auditMock.mock.calls[0][0]);
    expect(audit).toContain(ref);
    expect(audit).not.toContain("guest@x.org");
  });

  it("404s for a donor key from another church", async () => {
    const response = await GET(url(`p:${OTHER_CHURCH_PROFILE}`));
    expect(response.status).toBe(404);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("404s for an unknown donor and a malformed profile id", async () => {
    expect((await GET(url("h:0000000000000000"))).status).toBe(404);
    expect((await GET(url("p:not-a-uuid"))).status).toBe(404);
  });

  it("400s without a donor or with an invalid range", async () => {
    expect((await GET(url(null))).status).toBe(400);
    expect((await GET(url(`p:${P1}`, "start=2025-12-31&end=2025-01-01"))).status).toBe(400);
    expect((await GET(url(`p:${P1}`, "start=2025-01-01"))).status).toBe(400);
  });

  it("still serves the PDF when the audit write fails", async () => {
    auditMock.mockRejectedValue(new Error("audit down"));
    expect((await GET(url(`p:${P1}`))).status).toBe(200);
  });
});
