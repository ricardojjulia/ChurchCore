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
 * NOTE: ChurchCore has NO platform subscription tiers.
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
export type StripeRequestOptions = {
  /**
   * The connected (church) account the call acts on, sent as `Stripe-Account`
   * (ADR 0025: every church payment is a direct charge on the church's own
   * account). Omitted only for platform calls: Connect OAuth and reading a
   * connected account itself.
   */
  stripeAccount?: string;
  /** Defaults to the API; Connect OAuth uses https://connect.stripe.com. */
  baseUrl?: string;
};

export async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  options: StripeRequestOptions = {},
): Promise<T> {
  const key = getStripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");

  const url = `${options.baseUrl ?? "https://api.stripe.com/v1"}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": "2024-04-10",
  };
  if (options.stripeAccount) headers["Stripe-Account"] = options.stripeAccount;

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
  const json = (await res.json()) as T;

  if (!res.ok) {
    // The API nests errors ({ error: { message } }); Connect OAuth returns
    // them flat ({ error: "invalid_client", error_description }).
    const error = (json as { error?: string | { message?: string }; error_description?: string }).error;
    const msg =
      typeof error === "string"
        ? ((json as { error_description?: string }).error_description ?? error)
        : (error?.message ?? `Stripe ${res.status}`);
    throw new Error(msg);
  }

  return json;
}
