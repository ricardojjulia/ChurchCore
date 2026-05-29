import { describe, expect, it } from "vitest";

import { buildCommunicationsClosureGuidance } from "@/lib/communications-closure-guidance";

describe("buildCommunicationsClosureGuidance", () => {
  it("summarizes the unresolved lane in operator order", () => {
    const guidance = buildCommunicationsClosureGuidance({
      recentLogs: [
        {
          id: "log-retryable",
          sentByName: null,
          recipientName: "Retryable Member",
          channel: "email",
          subject: "Reminder",
          bodyPreview: "Hello",
          status: "failed",
          scheduledFor: null,
          sentAt: null,
          createdAt: "2026-05-29T12:00:00.000Z",
          retryCount: 0,
          errorCode: "timeout",
        },
        {
          id: "log-nonretryable",
          sentByName: null,
          recipientName: "Blocked Member",
          channel: "sms",
          subject: null,
          bodyPreview: "Check-in reminder",
          status: "bounced",
          scheduledFor: null,
          sentAt: null,
          createdAt: "2026-05-29T12:00:00.000Z",
          retryCount: 1,
          errorCode: null,
        },
      ],
      recipients: [
        {
          profileId: "profile-1",
          name: "Missing Contact",
          email: null,
          phone: null,
          role: "member",
          ministries: [],
          emailOptIn: true,
          smsOptIn: true,
        },
        {
          profileId: "profile-2",
          name: "Opted Out",
          email: "member@example.com",
          phone: "555-0100",
          role: "member",
          ministries: [],
          emailOptIn: false,
          smsOptIn: true,
        },
      ],
      suppressions: [
        {
          id: "suppression-1",
          channel: "email",
          contact: "blocked@example.com",
          reason: "manual",
          notes: null,
          suppressedByName: null,
          createdAt: "2026-05-29T12:00:00.000Z",
        },
      ],
    });

    expect(guidance).toMatchObject({
      unresolvedCount: 5,
      retryableCount: 1,
      nonRetryableCount: 1,
      suppressionCount: 1,
      contactGapCount: 1,
      consentGapCount: 1,
      steps: [
        expect.objectContaining({
          title: "Retry transient failures",
          actionLabel: "Open communications",
        }),
        expect.objectContaining({
          title: "Review suppression and consent",
          actionLabel: "Review messages",
        }),
        expect.objectContaining({
          title: "Close contact data gaps",
          actionLabel: "Open People",
        }),
      ],
    });

    expect(guidance.expectedResolvedState).toContain("retryable failures");
    expect(guidance.resolvedSummary).toContain("No queued sends");
  });

  it("returns a resolved state when no unresolved items remain", () => {
    const guidance = buildCommunicationsClosureGuidance({
      recentLogs: [],
      recipients: [],
      suppressions: [],
    });

    expect(guidance.resolved).toBe(true);
    expect(guidance.unresolvedCount).toBe(0);
    expect(guidance.steps).toHaveLength(0);
  });
});