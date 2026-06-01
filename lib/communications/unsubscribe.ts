import { createHmac, timingSafeEqual } from "node:crypto";

export type UnsubscribeTokenResult =
  | { valid: true; churchId: string; contactEmail: string; channel: "email" | "sms" }
  | { valid: false; reason: "missing_params" | "expired" | "invalid_signature" | "invalid_channel" };

export function generateUnsubscribeLink(
  churchId: string,
  contactEmail: string,
  channel: "email" | "sms",
): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET is not configured");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4200";
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${churchId}:${contactEmail}:${channel}:${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  return (
    `${appUrl}/api/unsubscribe` +
    `?t=${expiresAt}` +
    `&cid=${encodeURIComponent(churchId)}` +
    `&e=${encodeURIComponent(contactEmail)}` +
    `&ch=${encodeURIComponent(channel)}` +
    `&sig=${signature}`
  );
}

export function verifyUnsubscribeToken(params: {
  t: string;
  cid: string;
  e: string;
  ch: string;
  sig: string;
}): UnsubscribeTokenResult {
  if (!params.t || !params.cid || !params.e || !params.ch || !params.sig) {
    return { valid: false, reason: "missing_params" };
  }

  const expiresAt = parseInt(params.t, 10);
  if (isNaN(expiresAt)) {
    return { valid: false, reason: "missing_params" };
  }

  if (Date.now() > expiresAt) {
    return { valid: false, reason: "expired" };
  }

  if (params.ch !== "email" && params.ch !== "sms") {
    return { valid: false, reason: "invalid_channel" };
  }

  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    return { valid: false, reason: "invalid_signature" };
  }

  const payload = `${params.cid}:${params.e}:${params.ch}:${expiresAt}`;
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(params.sig, "hex");
    if (expectedBuf.length !== providedBuf.length || expectedBuf.length === 0) {
      return { valid: false, reason: "invalid_signature" };
    }
    if (!timingSafeEqual(expectedBuf, providedBuf)) {
      return { valid: false, reason: "invalid_signature" };
    }
  } catch {
    return { valid: false, reason: "invalid_signature" };
  }

  return {
    valid: true,
    churchId: params.cid,
    contactEmail: params.e,
    channel: params.ch as "email" | "sms",
  };
}
