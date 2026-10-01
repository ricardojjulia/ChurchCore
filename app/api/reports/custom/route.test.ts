import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireChurchSessionMock, createTenantServerClientMock, logAuditEventMock } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantServerClient: createTenantServerClientMock }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: logAuditEventMock }));

import { GET, jsonToCsv, neutralizeFormulaInjection } from "@/app/api/reports/custom/route";

describe("neutralizeFormulaInjection", () => {
  it.each(["=CMD('/c calc')", "+1+1", "-1+1", "@SUM(A1:A2)", "\ttab", "\rcr"])(
    "prefixes %s with a single quote so it is not treated as a formula",
    (dangerous) => {
      expect(neutralizeFormulaInjection(dangerous)).toBe(`'${dangerous}`);
    },
  );

  it("leaves ordinary values untouched", () => {
    expect(neutralizeFormulaInjection("Jane Doe")).toBe("Jane Doe");
    expect(neutralizeFormulaInjection("jane@example.com")).toBe("jane@example.com");
  });
});

describe("jsonToCsv", () => {
  it("neutralizes formula-injection-prone fields in exported rows", () => {
    const csv = jsonToCsv([
      { full_name: "=1+1", email: "attacker@example.com" },
    ]);

    expect(csv).toBe("full_name,email\n'=1+1,attacker@example.com");
  });

  it("still quotes commas and embedded quotes correctly", () => {
    const csv = jsonToCsv([{ note: 'Smith, "the" pastor' }]);
    expect(csv).toBe('note\n"Smith, ""the"" pastor"');
  });

  it("returns an empty string for no rows", () => {
    expect(jsonToCsv([])).toBe("");
  });
});

// S3 (Council Review 20): the export reads through the caller's own Supabase
// client (RLS applies), pages past Supabase's 1,000-row cap, uses the real
// events columns, and lets a signed-out caller's redirect through.
describe("GET /api/reports/custom", () => {
  type Call = { table: string; select: string; filters: Array<[string, string, unknown]>; range: [number, number] };

  function fakeClient(pages: Record<string, Array<Record<string, unknown>[]>>) {
    const calls: Call[] = [];
    return {
      calls,
      client: {
        from(table: string) {
          const call: Call = { table, select: "", filters: [], range: [0, 0] };
          const builder = {
            select: (columns: string) => ((call.select = columns), builder),
            eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), builder),
            is: (column: string, value: unknown) => (call.filters.push(["is", column, value]), builder),
            order: () => builder,
            range: async (from: number, to: number) => {
              call.range = [from, to];
              calls.push(call);
              const page = pages[table]?.[from / 1000] ?? [];
              return { data: page, error: null };
            },
          };
          return builder;
        },
      },
    };
  }

  function session(roleId: string) {
    return { userId: "login-1", appContext: { roleId, church: { id: "church-1" } } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets requireChurchSession's sign-in redirect through instead of turning it into a 500", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    requireChurchSessionMock.mockRejectedValue(redirect);
    await expect(GET(new Request("http://localhost/api/reports/custom"))).rejects.toBe(redirect);
  });

  it.each(["secretary", "ministry-leader", "member"])("a %s gets 403 and nothing is read", async (roleId) => {
    requireChurchSessionMock.mockResolvedValue(session(roleId));
    const response = await GET(new Request("http://localhost/api/reports/custom?entity=people"));
    expect(response.status).toBe(403);
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown entity before reading", async () => {
    requireChurchSessionMock.mockResolvedValue(session("pastor"));
    const response = await GET(new Request("http://localhost/api/reports/custom?entity=constructor"));
    expect(response.status).toBe(400);
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });

  it("exports events with the real starts_at/ends_at columns, scoped to the caller's church", async () => {
    requireChurchSessionMock.mockResolvedValue(session("church-admin"));
    const fake = fakeClient({ events: [[{ id: "e1", title: "Sunday", starts_at: "2026-10-04T15:00:00Z" }]] });
    createTenantServerClientMock.mockResolvedValue(fake.client);

    const response = await GET(new Request("http://localhost/api/reports/custom?entity=events"));

    expect(response.status).toBe(200);
    expect(fake.calls[0].select).toContain("starts_at, ends_at");
    expect(fake.calls[0].filters).toEqual([["eq", "church_id", "church-1"]]);
    expect(await response.text()).toBe("id,title,starts_at\ne1,Sunday,2026-10-04T15:00:00Z");
  });

  it("pages past Supabase's 1,000-row cap and leaves merged duplicates out of people", async () => {
    requireChurchSessionMock.mockResolvedValue(session("pastor"));
    const page = (offset: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `p${offset + i}`, full_name: `Person ${offset + i}` }));
    const fake = fakeClient({ profiles: [page(0, 1000), page(1000, 3)] });
    createTenantServerClientMock.mockResolvedValue(fake.client);

    const response = await GET(new Request("http://localhost/api/reports/custom?entity=people"));
    const lines = (await response.text()).split("\n");

    expect(lines).toHaveLength(1 + 1003);
    expect(fake.calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(fake.calls[0].filters).toContainEqual(["is", "merged_at", null]);
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({ newValues: { entity: "people", rowCount: 1003 } }));
  });

  it("labels anonymous gifts in the giving export", async () => {
    requireChurchSessionMock.mockResolvedValue(session("church-admin"));
    const fake = fakeClient({ donations: [[]] });
    createTenantServerClientMock.mockResolvedValue(fake.client);
    await GET(new Request("http://localhost/api/reports/custom?entity=giving"));
    expect(fake.calls[0].select).toContain("is_anonymous");
  });
});
