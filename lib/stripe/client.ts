/**
 * Stripe server-side client.
 *
 * Requires env vars:
 *   STRIPE_SECRET_KEY   — sk_live_… or sk_test_…
 *   STRIPE_WEBHOOK_SECRET — whsec_… for webhook signature verification
 *
 * When STRIPE_SECRET_KEY is absent (local dev without Stripe),
 * the stub guard in each action returns a safe fallback so the
 * app doesn't blow up.
 *
 * NOTE: ChurchCore Ops has NO platform subscription tiers.
 * Stripe is used exclusively for voluntary donations to local churches.
 * The platform never takes a cut — 100% goes to the church.
 */

export function getStripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY ?? null;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}

export function hasStripeConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Minimal Stripe API caller — avoids importing the full Stripe SDK
 * so we don't add a large dependency until the church opts in.
 * Replace with `import Stripe from 'stripe'` once stripe is installed.
 */
export async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const key = getStripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");

  const url = `https://api.stripe.com/v1${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": "2024-04-10",
  };

  let fetchBody: string | undefined;
  if (body && method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    fetchBody = new URLSearchParams(
      Object.entries(body)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
  }

  const res = await fetch(url, { method, headers, body: fetchBody });
  const json = (await res.json()) as T & { error?: { message?: string } };

  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `Stripe ${res.status}`;
    throw new Error(msg);
  }

  return json;
}
