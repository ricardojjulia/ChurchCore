import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTenantServerClientMock,
  hasTenantBackendEnvMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
} = vi.hoisted(() => {
  const createTenantServerClient = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  return {
    createTenantServerClientMock: createTenantServerClient,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import { getChurchAdminOperationsData } from "@/lib/church-admin-operations-data";
import type { ChurchAppSession } from "@/lib/auth";

const session = {
  source: "supabase",
  appContext: {
    kind: "church",
    roleId: "church-admin",
    church: { id: "church-1", name: "Grace Harbor", slug: "grace", timezone: "America/Detroit" },
    source: "membership",
    homePath: "/app/church-admin",
  },
} as ChurchAppSession;

describe("getChurchAdminOperationsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("returns preview operations when no tenant backend is configured", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const data = await getChurchAdminOperationsData(session);

    expect(data).toEqual({
      source: "preview",
      weekendItems: [],
      communicationItems: [],
      givingItems: [],
    });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("builds weekend operations from actionable upcoming events", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "event-1",
            title: "Sunday Service",
            starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            location: "Sanctuary",
            approval_status: "pending",
            roster_count: 0,
            registration_count: 20,
            waitlist_count: 0,
            capacity: 100,
            registration_open: true,
          },
          {
            id: "event-2",
            title: "Later Training",
            starts_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            location: null,
            approval_status: "approved",
            roster_count: 3,
            registration_count: 8,
            waitlist_count: 0,
            capacity: 40,
            registration_open: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            missing_email_count: 0,
            missing_phone_count: 0,
            contact_private_count: 0,
            email_opt_out_count: 0,
            sms_opt_out_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            pending_count: 0,
            failed_count: 0,
            unsent_receipts_count: 0,
            unposted_gl_count: 0,
            unmapped_fund_count: 0,
            giving_page_count: 1,
            live_giving_page_count: 1,
          },
        ],
      });

    const data = await getChurchAdminOperationsData(session);

    expect(data.source).toBe("live");
    expect(data.weekendItems).toHaveLength(1);
    expect(data.weekendItems[0]).toMatchObject({
      id: "event-event-1",
      eventId: "event-1",
      title: "Sunday Service",
      status: "blocked",
      href: "/app/church-admin/events/event-1",
      badges: expect.arrayContaining(["pending", "no roster", "next 14 days"]),
    });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("from public.events event"),
      ["church-1"],
    );
  });

  it("builds communication operations from logs and consent/contact gaps", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            channel: "email",
            subject: "Weekend Update",
            status: "failed",
            scheduled_for: null,
            created_at: "2026-05-08T12:00:00.000Z",
          },
          {
            id: "log-2",
            channel: "sms",
            subject: null,
            status: "sent",
            scheduled_for: null,
            created_at: "2026-05-08T11:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            missing_email_count: 2,
            missing_phone_count: 3,
            contact_private_count: 1,
            email_opt_out_count: 4,
            sms_opt_out_count: 5,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            pending_count: 0,
            failed_count: 0,
            unsent_receipts_count: 0,
            unposted_gl_count: 0,
            unmapped_fund_count: 0,
            giving_page_count: 1,
            live_giving_page_count: 1,
          },
        ],
      });

    const data = await getChurchAdminOperationsData(session);

    expect(data.source).toBe("live");
    expect(data.communicationItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "communication-log-log-1",
          title: "EMAIL: Weekend Update",
          status: "blocked",
          href: "/app/communications",
          badges: ["failed", "email"],
        }),
        expect.objectContaining({
          id: "communication-contact-gaps",
          status: "blocked",
          href: "/app/church-admin/people",
        }),
        expect.objectContaining({
          id: "communication-consent-gaps",
          status: "in-progress",
          href: "/app/communications",
        }),
      ]),
    );
    expect(data.communicationItems.some((item) => item.id === "communication-log-log-2")).toBe(false);
  });

  it("builds giving operations from payment, receipt, GL, and giving page signals", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            missing_email_count: 0,
            missing_phone_count: 0,
            contact_private_count: 0,
            email_opt_out_count: 0,
            sms_opt_out_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            pending_count: 2,
            failed_count: 1,
            unsent_receipts_count: 3,
            unposted_gl_count: 4,
            unmapped_fund_count: 1,
            giving_page_count: 1,
            live_giving_page_count: 0,
          },
        ],
      });

    const data = await getChurchAdminOperationsData(session);

    expect(data.source).toBe("live");
    expect(data.givingItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "giving-payment-exceptions",
          status: "blocked",
          href: "/app/church-admin/giving",
          badges: ["payments", "donations"],
        }),
        expect.objectContaining({
          id: "giving-unsent-receipts",
          status: "in-progress",
          href: "/app/church-admin/giving",
        }),
        expect.objectContaining({
          id: "giving-gl-reconciliation",
          status: "blocked",
          href: "/app/church-admin/finance/journals",
        }),
        expect.objectContaining({
          id: "giving-page-configuration",
          status: "blocked",
          href: "/app/church-admin/giving",
        }),
      ]),
    );
  });
});
