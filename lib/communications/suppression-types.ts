/** Shared (server and client) types and wording for the suppressions page (S11). */

export type SuppressionChannel = "email" | "sms";
export type SuppressionReason = "manual" | "unsubscribe" | "bounce" | "complaint";

export interface SuppressionRow {
  id: string;
  channel: SuppressionChannel;
  contact: string;
  reason: SuppressionReason;
  notes: string | null;
  /** The member whose email or phone matches the contact, within this church. */
  memberName: string | null;
  /** Who added it; only set for manual suppressions. */
  addedByName: string | null;
  createdAt: string;
}

/** Only bounce and manual suppressions may be lifted by staff (owner decision, 2026-10-06). */
export const REMOVABLE_SUPPRESSION_REASONS: readonly SuppressionReason[] = ["bounce", "manual"];

export function isRemovableSuppressionReason(reason: string): boolean {
  return (REMOVABLE_SUPPRESSION_REASONS as readonly string[]).includes(reason);
}

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
  bounce: "Bounced",
  unsubscribe: "Unsubscribed (link or STOP)",
  complaint: "Marked as spam",
  manual: "Added by staff",
};

export const MIN_REMOVAL_REASON_LENGTH = 5;
