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

export type RegistrationPaymentLedgerStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "cancelled";

export function paymentStatusToLedgerStatus(
  paymentStatus: RegistrationPaymentStatus,
): RegistrationPaymentLedgerStatus {
  switch (paymentStatus) {
    case "paid":
      return "succeeded";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    case "not_required":
      return "cancelled";
    case "pending":
    default:
      return "pending";
  }
}

export function ledgerStatusToPaymentStatus(
  ledgerStatus: RegistrationPaymentLedgerStatus,
): RegistrationPaymentStatus {
  switch (ledgerStatus) {
    case "succeeded":
      return "paid";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    case "cancelled":
      return "not_required";
    case "pending":
    default:
      return "pending";
  }
}

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
