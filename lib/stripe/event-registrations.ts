import { hasStripeConfig, stripeRequest } from "./client";

export type CreateEventRegistrationPaymentIntentInput = {
  amountCents: number;
  currency?: string | null;
  churchId: string;
  eventId: string;
  registrationId: string;
  registrantEmail?: string | null;
  registrantName?: string | null;
};

export type CreateEventRegistrationPaymentIntentResult = {
  clientSecret: string;
  paymentIntentId: string;
  isStub: boolean;
};

export async function createEventRegistrationPaymentIntent(
  input: CreateEventRegistrationPaymentIntentInput,
): Promise<CreateEventRegistrationPaymentIntentResult> {
  if (!hasStripeConfig()) {
    return {
      clientSecret: `pi_event_registration_stub_${input.registrationId}_secret_test`,
      paymentIntentId: `pi_event_registration_stub_${input.registrationId}`,
      isStub: true,
    };
  }

  const body: Record<string, unknown> = {
    amount: input.amountCents,
    currency: input.currency ?? "usd",
    automatic_payment_methods: "enabled",
    "metadata[church_id]": input.churchId,
    "metadata[event_id]": input.eventId,
    "metadata[event_registration_id]": input.registrationId,
    "metadata[registration_id]": input.registrationId,
    "metadata[purpose]": "event_registration",
  };

  if (input.registrantEmail) body.receipt_email = input.registrantEmail;
  if (input.registrantName) body.description = `Event registration for ${input.registrantName}`;

  const paymentIntent = await stripeRequest<{ id: string; client_secret: string }>(
    "POST",
    "/payment_intents",
    body,
  );

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    isStub: false,
  };
}
