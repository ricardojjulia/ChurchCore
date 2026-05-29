import { describe, expect, it } from "vitest";

import {
  buildProviderWebhookIdempotencyKey,
  shouldRetryDelivery,
} from "@/lib/communications/provider-adapter";

describe("provider adapter helpers", () => {
  it("marks transient failures as retryable", () => {
    expect(shouldRetryDelivery("failed", "timeout")).toBe(true);
    expect(shouldRetryDelivery("failed", "network_error")).toBe(true);
  });

  it("does not retry permanent delivery states", () => {
    expect(shouldRetryDelivery("sent", "timeout")).toBe(false);
    expect(shouldRetryDelivery("bounced", "provider_unavailable")).toBe(false);
    expect(shouldRetryDelivery("suppressed", "temporary_failure")).toBe(false);
    expect(shouldRetryDelivery("unsubscribed", "temporary_failure")).toBe(false);
    expect(shouldRetryDelivery("queued", "temporary_failure")).toBe(false);
    expect(shouldRetryDelivery("scheduled", "temporary_failure")).toBe(false);
    expect(shouldRetryDelivery("sending", "temporary_failure")).toBe(false);
  });

  it("does not retry failed sends without a known transient code", () => {
    expect(shouldRetryDelivery("failed")).toBe(false);
    expect(shouldRetryDelivery("failed", "invalid_recipient")).toBe(false);
  });

  it("builds deterministic webhook idempotency keys", () => {
    const key = buildProviderWebhookIdempotencyKey({
      provider: "sendgrid",
      eventId: "event-123",
      occurredAtIso: "2026-05-27T20:00:00.000Z",
    });

    expect(key).toBe("sendgrid:event-123:2026-05-27T20:00:00.000Z");
  });
});
