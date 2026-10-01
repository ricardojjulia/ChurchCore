import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe's default tolerance: a signed event older (or newer) than this is a
// replay and is rejected (S2).
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  // Stripe-Signature: t=timestamp,v1=hash[,v1=hash...]
  const parts = sigHeader.split(",");
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));

  if (!tPart || v1Parts.length === 0) return false;

  const timestamp = tPart.slice(2);
  const signedAt = Number(timestamp);
  if (!Number.isInteger(signedAt) || Math.abs(nowSeconds - signedAt) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return v1Parts.some((v) => {
    const received = v.slice(3);
    try {
      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(received, "hex"),
      );
    } catch {
      return false;
    }
  });
}
