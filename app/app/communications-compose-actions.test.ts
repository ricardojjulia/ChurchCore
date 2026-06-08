import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  resolveRecipientsMock,
  sendWithSuppressionMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const resolveRecipients = vi.fn();
  const sendWithSuppression = vi.fn(async () => ({ sent: true, skipped: false }));

  const createTenantServerClient = vi.fn(async () => ({
    from: vi.fn(),
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    resolveRecipientsMock: resolveRecipients,
    sendWithSuppressionMock: sendWithSuppression,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: vi.fn(),
  hasTenantBackendEnv: vi.fn(() => true),
  hasTenantAdminBackendEnv: vi.fn(() => true),
  shouldUseLocalTenantFallback: vi.fn(() => false),
  queryTenantLocalDb: vi.fn(),
}));

vi.mock("@/lib/communications/recipient-resolver", () => ({
  resolveRecipients: resolveRecipientsMock,
}));

vi.mock("@/lib/communications/send-with-suppression", () => ({
  sendWithSuppression: sendWithSuppressionMock,
}));

vi.mock("@/lib/communications/provider-adapter", () => ({
  shouldRetryDelivery: vi.fn(() => true),
}));

vi.mock("@/lib/communications/retry-eligible", () => ({
  retryEligibleCommunications: vi.fn(async () => ({
    selected: 0,
    succeeded: 0,
    failedAgain: 0,
    skipped: 0,
  })),
}));

vi.mock("@/lib/communications-data", () => ({
  getCommunicationDeliveryEvents: vi.fn(async () => []),
}));

vi.mock("@/lib/consent-log", () => ({
  insertConsentLogEntries: vi.fn(async () => undefined),
}));

import {
  previewRecipientsAction,
  composeAndSendMessageAction,
  cancelScheduledMessageAction,
  createTemplateAction,
  updateTemplateAction,
  getMessageAnalyticsAction,
  listCommunicationLogsAction,
  deleteTemplateAction,
  listTemplatesAction,
} from "@/app/app/communications-actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(roleId: string, churchId = "church-1") {
  return {
    appContext: { roleId, church: { id: churchId } },
    profile: { id: "profile-actor" },
    source: "supabase" as const,
    userId: "user-actor",
  };
}

function makeRecipients(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    profileId: `profile-${i}`,
    name: `Member ${i}`,
    contact: `member${i}@example.com`,
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("previewRecipientsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
    resolveRecipientsMock.mockResolvedValue(makeRecipients(3));
  });

  it("returns masked email sample and count for email channel", async () => {
    const result = await previewRecipientsAction({ role: "member" }, "email");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.count).toBe(3);
      expect(result.result.sample).toHaveLength(3);
      // emails must be masked
      for (const s of result.result.sample) {
        expect(s.contact).toContain("***");
        expect(s.contact).not.toMatch(/^member\d@/);
      }
    }
  });

  it("applies segment role filter by passing it to resolveRecipients", async () => {
    resolveRecipientsMock.mockResolvedValue(makeRecipients(2));
    await previewRecipientsAction({ role: "pastor" }, "email");
    expect(resolveRecipientsMock).toHaveBeenCalledWith(
      "church-1",
      "email",
      expect.objectContaining({ role: "pastor" }),
    );
  });

  it("returns masked phone sample for sms channel", async () => {
    resolveRecipientsMock.mockResolvedValue([
      { profileId: "p1", name: "Alice", contact: "5551234567" },
    ]);
    const result = await previewRecipientsAction({}, "sms");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.sample[0].contact).toBe("***-***-4567");
    }
  });

  it("limits sample to 5 even when more recipients exist", async () => {
    resolveRecipientsMock.mockResolvedValue(makeRecipients(10));
    const result = await previewRecipientsAction({}, "email");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.sample.length).toBeLessThanOrEqual(5);
      expect(result.result.count).toBe(10);
    }
  });

  it("denies ministry_leader role", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("ministry-leader"));
    const result = await previewRecipientsAction({}, "email");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
    expect(resolveRecipientsMock).not.toHaveBeenCalled();
  });

  it("allows secretary role", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("secretary"));
    resolveRecipientsMock.mockResolvedValue([]);
    const result = await previewRecipientsAction({}, "email");
    expect(result.ok).toBe(true);
  });

  it("allows pastor role", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("pastor"));
    resolveRecipientsMock.mockResolvedValue([]);
    const result = await previewRecipientsAction({}, "email");
    expect(result.ok).toBe(true);
  });
});

describe("composeAndSendMessageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
    resolveRecipientsMock.mockResolvedValue(makeRecipients(2));
    sendWithSuppressionMock.mockResolvedValue({ sent: true, skipped: false });

    // Default Supabase: insert returns a logId
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: "log-new" }, error: null })),
          })),
        })),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        single: vi.fn(async () => ({ data: { id: "log-new" }, error: null })),
      })),
    });
  });

  it("immediate send calls broadcastMessageAction and returns logId", async () => {
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Sunday Bulletin",
      body: "Hello congregation",
      segment: {},
      scheduledFor: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.logId).toBe("log-new");
    // sendWithSuppression is called for each recipient by broadcastMessageAction
    expect(sendWithSuppressionMock).toHaveBeenCalled();
  });

  it("scheduled send does NOT call sendWithSuppression and returns logId", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Sunday Bulletin",
      body: "Hello congregation",
      segment: {},
      scheduledFor: future,
    });
    expect(result.ok).toBe(true);
    // No sending happens until cron fires
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("returns error when zero recipients match", async () => {
    resolveRecipientsMock.mockResolvedValue([]);
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Test",
      body: "Hello",
      segment: {},
      scheduledFor: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No contactable recipients");
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("returns error for past scheduledFor", async () => {
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Test",
      body: "Hello",
      segment: {},
      scheduledFor: "2000-01-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("future");
  });

  it("returns error for email without subject", async () => {
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: null,
      body: "Hello",
      segment: {},
      scheduledFor: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("subject");
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("returns error for empty email subject string", async () => {
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "   ",
      body: "Hello",
      segment: {},
      scheduledFor: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("subject");
  });

  it("allows secretary role to send", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("secretary"));
    const result = await composeAndSendMessageAction({
      channel: "sms",
      subject: null,
      body: "Hi!",
      segment: {},
      scheduledFor: null,
    });
    expect(result.ok).toBe(true);
    // sendWithSuppression called per recipient via broadcastMessageAction
    expect(sendWithSuppressionMock).toHaveBeenCalled();
  });

  it("allows pastor role to send", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("pastor"));
    const result = await composeAndSendMessageAction({
      channel: "sms",
      subject: null,
      body: "Hi!",
      segment: {},
      scheduledFor: null,
    });
    expect(result.ok).toBe(true);
    expect(sendWithSuppressionMock).toHaveBeenCalled();
  });

  it("denies ministry_leader role", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("ministry-leader"));
    const result = await composeAndSendMessageAction({
      channel: "email",
      subject: "Test",
      body: "Hello",
      segment: {},
      scheduledFor: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });
});

describe("cancelScheduledMessageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
  });

  it("cancels a scheduled message successfully", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { id: "log-1", status: "scheduled", church_id: "church-1" },
          error: null,
        })),
      })),
    });

    const result = await cancelScheduledMessageAction("log-1");
    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/communications/history");
  });

  it("returns error if message status is not scheduled", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { id: "log-1", status: "sent", church_id: "church-1" },
          error: null,
        })),
      })),
    });

    const result = await cancelScheduledMessageAction("log-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("scheduled");
  });

  it("returns error for cross-church log (log not found)", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    });

    const result = await cancelScheduledMessageAction("foreign-log");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });
});

describe("createTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: "tmpl-1" }, error: null })),
          })),
        })),
      })),
    });
  });

  it("creates a template and returns its id", async () => {
    const result = await createTemplateAction({
      name: "Welcome Email",
      channel: "email",
      subject: "Welcome!",
      body: "Hi there",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe("tmpl-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/communications/templates");
  });

  it("denies ministry_leader role", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("ministry-leader"));
    const result = await createTemplateAction({
      name: "Test",
      channel: "email",
      subject: null,
      body: "Body",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
  });
});

describe("updateTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
  });

  it("updates name, subject, body but not channel", async () => {
    let updatePayload: Record<string, unknown> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createTenantServerClientMock as any).mockResolvedValue({
      from: (table: string) => {
        if (table === "communication_templates") {
          return {
            select: vi.fn().mockReturnThis(),
            update: vi.fn((payload: Record<string, unknown>) => {
              updatePayload = payload;
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: { id: "tmpl-1", church_id: "church-1" },
              error: null,
            })),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      },
    });

    const result = await updateTemplateAction({
      id: "tmpl-1",
      name: "Updated Name",
      subject: "New Subject",
      body: "New body",
    });
    expect(result.ok).toBe(true);
    expect(updatePayload).not.toHaveProperty("channel");
    expect(updatePayload).toMatchObject({
      name: "Updated Name",
      subject: "New Subject",
      body: "New body",
    });
  });

  it("returns error for cross-church template (not found)", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    });

    const result = await updateTemplateAction({
      id: "foreign-tmpl",
      name: "X",
      subject: null,
      body: "Y",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });
});

describe("getMessageAnalyticsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
  });

  it("aggregates delivery events correctly", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createTenantServerClientMock as any).mockResolvedValue({
      from: (table: string) => {
        if (table === "communication_logs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: { id: "log-1", channel: "email" },
              error: null,
            })),
          };
        }
        // communication_delivery_events — includes suppressed event
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [
                { event_type: "sent" },
                { event_type: "delivered" },
                { event_type: "delivered" },
                { event_type: "open" },
                { event_type: "bounce" },
                { event_type: "failed" },
                { event_type: "suppressed" },
                { event_type: "suppressed" },
              ],
              error: null,
            })),
          })),
        };
      },
    });

    const result = await getMessageAnalyticsAction("log-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analytics.logId).toBe("log-1");
      expect(result.analytics.sentCount).toBe(1);
      expect(result.analytics.deliveredCount).toBe(2);
      expect(result.analytics.bouncedCount).toBe(1);
      expect(result.analytics.failedCount).toBe(1);
      expect(result.analytics.suppressedCount).toBe(2);
      // open rate: 1 opened / 2 delivered
      expect(result.analytics.openRate).toBeCloseTo(0.5);
      // No individual contact data in the return shape
      expect(result.analytics).not.toHaveProperty("recipients");
      expect(result.analytics).not.toHaveProperty("emails");
      expect(result.analytics).not.toHaveProperty("contacts");
    }
  });

  it("returns null open rate for sms channel", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createTenantServerClientMock as any).mockResolvedValue({
      from: (table: string) => {
        if (table === "communication_logs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: { id: "log-sms", channel: "sms" },
              error: null,
            })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [{ event_type: "delivered" }], error: null })),
          })),
        };
      },
    });

    const result = await getMessageAnalyticsAction("log-sms");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analytics.openRate).toBeNull();
    }
  });

  it("returns error for cross-church log", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    });

    const result = await getMessageAnalyticsAction("foreign-log");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });

  it("denies ministry_leader role", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("ministry-leader"));
    const result = await getMessageAnalyticsAction("log-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Access denied.");
  });
});

describe("listCommunicationLogsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
  });

  it("returns only session-church logs and maps fields correctly", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(async () => ({
          data: [
            {
              id: "log-1",
              channel: "email",
              subject: "Hello",
              body_preview: "Hi",
              status: "sent",
              scheduled_for: null,
              sent_at: "2026-01-01T10:00:00.000Z",
              created_at: "2026-01-01T09:00:00.000Z",
              retry_count: 0,
              segment_criteria: { role: "member" },
              profiles: { full_name: "Pastor John" },
            },
          ],
          error: null,
        })),
      })),
    });

    const result = await listCommunicationLogsAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toBe("log-1");
      expect(result.logs[0].sentByName).toBe("Pastor John");
      expect(result.logs[0].segmentCriteria).toEqual({ role: "member" });
    }
  });

  it("allows secretary role", async () => {
    requireChurchSessionMock.mockResolvedValue(makeSession("secretary"));
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(async () => ({ data: [], error: null })),
      })),
    });

    const result = await listCommunicationLogsAction();
    expect(result.ok).toBe(true);
  });
});

describe("deleteTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
  });

  it("deletes template for correct church", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { id: "tmpl-1", church_id: "church-1" },
          error: null,
        })),
      })),
    });

    const result = await deleteTemplateAction({ id: "tmpl-1" });
    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/communications/templates");
  });

  it("returns error for cross-church template", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    });

    const result = await deleteTemplateAction({ id: "foreign-tmpl" });
    expect(result.ok).toBe(false);
  });
});

describe("listTemplatesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue(makeSession("church-admin"));
  });

  it("returns templates for session church", async () => {
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(async () => ({
          data: [
            {
              id: "tmpl-1",
              church_id: "church-1",
              name: "Welcome",
              channel: "email",
              subject: "Welcome!",
              body: "Hi",
              created_by: "profile-actor",
              updated_by: "profile-actor",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        })),
      })),
    });

    const result = await listTemplatesAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].churchId).toBe("church-1");
    }
  });

  it("passes channel filter when provided", async () => {
    const capturedEqCalls: string[] = [];
    createTenantServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string) => {
          capturedEqCalls.push(col);
          return {
            eq: vi.fn((col2: string) => {
              capturedEqCalls.push(col2);
              return {
                order: vi.fn(async () => ({ data: [], error: null })),
              };
            }),
            order: vi.fn(async () => ({ data: [], error: null })),
          };
        }),
        order: vi.fn(async () => ({ data: [], error: null })),
      })),
    });

    await listTemplatesAction("sms");
    // The query should include both church_id and channel filters
    expect(capturedEqCalls).toContain("church_id");
    expect(capturedEqCalls).toContain("channel");
  });
});
