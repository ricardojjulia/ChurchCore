export type ReadinessStatus = "ready" | "attention" | "blocked";

export type ReadinessSeverity = "none" | "notice" | "warning" | "critical";

export type ReadinessCompletionState =
  | "complete"
  | "needs_review"
  | "blocked"
  | "unavailable";

export type ReadinessTarget = {
  route: string;
  query?: Record<string, string>;
};

export type ReadinessSummary = {
  id: string;
  module: string;
  title: string;
  description: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  issueCount: number;
  completionState: ReadinessCompletionState;
  recommendedAction: string;
  target: ReadinessTarget;
  href: string;
  detail: string;
};

export function buildReadinessHref(target: ReadinessTarget) {
  const query = new URLSearchParams(target.query ?? {});
  const queryString = query.toString();
  return queryString ? `${target.route}?${queryString}` : target.route;
}

export function createReadinessSummary(
  summary: Omit<ReadinessSummary, "href">,
): ReadinessSummary {
  return {
    ...summary,
    href: buildReadinessHref(summary.target),
  };
}
