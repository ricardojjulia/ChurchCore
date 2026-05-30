import "server-only";

export type RegistrationLifecycleStatus =
  | "pending_approval"
  | "confirmed"
  | "waitlisted";

export type RegistrationPaymentStatus =
  | "not_required"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

export function resolveRegistrationLifecycle(input: {
  isWaitlisted: boolean;
  approvalRequired: boolean;
  priceCents: number;
}): {
  status: RegistrationLifecycleStatus;
  paymentStatus: RegistrationPaymentStatus;
} {
  const status: RegistrationLifecycleStatus = input.isWaitlisted
    ? "waitlisted"
    : input.approvalRequired
      ? "pending_approval"
      : "confirmed";

  const paymentStatus: RegistrationPaymentStatus =
    !input.isWaitlisted && input.priceCents > 0 ? "pending" : "not_required";

  return { status, paymentStatus };
}

export function normalizeRegistrationPaymentStatus(input: {
  status: string;
  isWaitlisted: boolean;
  amountPaidCents: number;
  storedPaymentStatus: string | null;
  priceCents: number;
}): RegistrationPaymentStatus {
  if (input.amountPaidCents > 0) {
    return "paid";
  }

  const allowed = new Set<RegistrationPaymentStatus>([
    "not_required",
    "pending",
    "paid",
    "failed",
    "refunded",
  ]);

  const status = input.storedPaymentStatus as RegistrationPaymentStatus | null;
  if (status && allowed.has(status)) {
    if (input.status === "cancelled") {
      return status === "paid" || status === "refunded" ? status : "not_required";
    }
    if (input.isWaitlisted && status === "pending") {
      return "not_required";
    }
    return status;
  }

  return resolveRegistrationLifecycle({
    isWaitlisted: input.isWaitlisted,
    approvalRequired: input.status === "pending_approval",
    priceCents: input.priceCents,
  }).paymentStatus;
}
