import type {
  CommunicationLogEntry,
  CommunicationsHubData,
} from "@/lib/communications-data";
import { shouldRetryDelivery } from "@/lib/communications/provider-adapter";

export type CommunicationsClosureGuidanceStep = {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
};

export type CommunicationsClosureGuidance = {
  unresolvedCount: number;
  retryableCount: number;
  nonRetryableCount: number;
  suppressionCount: number;
  contactGapCount: number;
  consentGapCount: number;
  resolved: boolean;
  expectedResolvedState: string;
  resolvedSummary: string;
  steps: CommunicationsClosureGuidanceStep[];
};

function isRetryableLog(log: CommunicationLogEntry) {
  return (
    log.status === "failed" &&
    log.retryCount < 3 &&
    shouldRetryDelivery(log.status, log.errorCode ?? undefined)
  );
}

function isNonRetryableLog(log: CommunicationLogEntry) {
  if (log.status === "bounced" || log.status === "suppressed" || log.status === "unsubscribed") {
    return true;
  }

  if (log.status !== "failed") {
    return false;
  }

  return log.retryCount >= 3 || !shouldRetryDelivery(log.status, log.errorCode ?? undefined);
}

export function buildCommunicationsClosureGuidance(
  data: Pick<CommunicationsHubData, "recentLogs" | "recipients" | "suppressions">,
): CommunicationsClosureGuidance {
  const retryableCount = data.recentLogs.filter(isRetryableLog).length;
  const nonRetryableCount = data.recentLogs.filter(isNonRetryableLog).length;
  const suppressionCount = data.suppressions.length;
  const contactGapCount = data.recipients.filter((recipient) => !recipient.email && !recipient.phone)
    .length;
  const consentGapCount = data.recipients.filter(
    (recipient) => !recipient.emailOptIn || !recipient.smsOptIn,
  ).length;

  const unresolvedCount =
    retryableCount + nonRetryableCount + suppressionCount + contactGapCount + consentGapCount;

  const steps: CommunicationsClosureGuidanceStep[] = [];

  if (retryableCount > 0) {
    steps.push({
      title: "Retry transient failures",
      detail: `${retryableCount} log${retryableCount === 1 ? "" : "s"} can be retried now. Clear these before sending new messages.`,
      actionLabel: "Open communications",
      href: "/app/communications",
    });
  }

  if (nonRetryableCount > 0 || suppressionCount > 0) {
    steps.push({
      title: "Review suppression and consent",
      detail: `${nonRetryableCount} delivery issue${nonRetryableCount === 1 ? "" : "s"} are not retryable. ${suppressionCount} suppression record${suppressionCount === 1 ? "" : "s"} are on file and may need consent follow-up.`,
      actionLabel: "Review messages",
      href: "/app/communications",
    });
  }

  if (contactGapCount > 0 || consentGapCount > 0) {
    steps.push({
      title: "Close contact data gaps",
      detail: `${contactGapCount} recipient${contactGapCount === 1 ? "" : "s"} are missing contact details and ${consentGapCount} have opt-out gaps. Resolve People records before the next send.`,
      actionLabel: "Open People",
      href: "/app/church-admin/people",
    });
  }

  return {
    unresolvedCount,
    retryableCount,
    nonRetryableCount,
    suppressionCount,
    contactGapCount,
    consentGapCount,
    resolved: unresolvedCount === 0,
    expectedResolvedState:
      "Resolved when there are no queued sends, retryable failures, non-retryable delivery issues, suppressions needing review, contact gaps, or consent gaps.",
    resolvedSummary:
      "No queued sends, retryable failures, non-retryable delivery issues, suppressions needing review, contact gaps, or consent gaps remain.",
    steps,
  };
}