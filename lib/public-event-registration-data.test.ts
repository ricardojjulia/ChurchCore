import { beforeEach, describe, expect, it, vi } from "vitest";

// The public registration page's loader (S10, PR #171 review): this church's
// own public events only, and registration counts counted in the database
// (fetching rows to count them was capped by PostgREST's row limit).

const { createTenantAdminClientMock } = vi.hoisted(() => ({ createTenantAdminClientMock: vi.fn() }));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
  hasTenantBackendEnv: () => true,
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: () => false,
}));
vi.mock("@/lib/supabase/config", () => ({ hasTenantDbUrl: () => true }));

import { getPublicEventRegistrationOptions } from "@/lib/public-event-registration-data";

type Query = { table: string; filters: Array<[string, unknown]>; head: boolean };

function fakeAdmin(counts: Record<string, number>) {
  const queries: Query[] = [];
  createTenantAdminClientMock.mockReturnValue({
    from(table: string) {
      const query: Query = { table, filters: [], head: false };
      queries.push(query);
      const result = () => {
        if (table === "event_registration_settings") {
          return {
            data: [
              {
                event_id: "event-1",
                price_cents: 0,
                currency: "usd",
                capacity: 5000,
                deadline: null,
                waitlist_enabled: true,
                approval_required: false,
                household_registration_enabled: false,
                events: { id: "event-1", title: "Picnic", starts_at: "2099-01-01T00:00:00Z", ends_at: "2099-01-01T02:00:00Z", category: "outreach", visibility: "public", church_id: "church-1" },
              },
            ],
            error: null,
          };
        }
        if (table === "event_registrations") {
          const waitlisted = query.filters.find(([column]) => column === "is_waitlisted")?.[1];
          return { data: null, error: null, count: counts[waitlisted ? "waitlisted" : "registered"] };
        }
        return { data: [], error: null };
      };
      const builder: Record<string, unknown> = {
        select: (_columns: string, options?: { head?: boolean }) => ((query.head = Boolean(options?.head)), builder),
        eq: (column: string, value: unknown) => (query.filters.push([column, value]), builder),
        neq: () => builder,
        in: () => builder,
        order: () => builder,
        then: (resolve: (value: unknown) => void) => resolve(result()),
      };
      return builder;
    },
  });
  return queries;
}

describe("getPublicEventRegistrationOptions (S10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads only this church's own public, open events", async () => {
    const queries = fakeAdmin({ registered: 0, waitlisted: 0 });
    await getPublicEventRegistrationOptions("church-1");

    const settings = queries.find((q) => q.table === "event_registration_settings")!;
    expect(settings.filters).toEqual([
      ["church_id", "church-1"],
      ["registration_open", true],
      ["events.visibility", "public"],
      ["events.church_id", "church-1"],
    ]);
  });

  it("counts registrations in the database, past any row limit, without reading registration rows", async () => {
    const queries = fakeAdmin({ registered: 1234, waitlisted: 7 });
    const [option] = await getPublicEventRegistrationOptions("church-1");

    expect(option).toMatchObject({ eventId: "event-1", registrationCount: 1234, waitlistCount: 7 });
    const registrationQueries = queries.filter((q) => q.table === "event_registrations");
    expect(registrationQueries).toHaveLength(2);
    expect(registrationQueries.every((q) => q.head)).toBe(true);
  });
});
