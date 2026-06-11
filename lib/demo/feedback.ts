import { createHash } from "node:crypto";

export const DEMO_FEEDBACK_CATEGORIES = [
  "BUG",
  "ERROR",
  "UNEXPECTED_RESULT",
  "IMPROVEMENT",
] as const;

export type DemoFeedbackCategory = (typeof DEMO_FEEDBACK_CATEGORIES)[number];

export type DemoFeedbackPayload = {
  session_id: string;
  route: string;
  category: DemoFeedbackCategory;
  error_message: string | null;
  note: string | null;
  breadcrumbs: string[];
  demo_version: string;
  session_duration: number;
};

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

export class DemoFeedbackValidationError extends Error {}

export function normalizeFeedbackText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function optionalBoundedString(
  value: unknown,
  maxLength: number,
  errorMessage: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new DemoFeedbackValidationError(errorMessage);
  if (value.length > maxLength) throw new DemoFeedbackValidationError(errorMessage);
  return value;
}

export function parseDemoFeedbackPayload(value: unknown): DemoFeedbackPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DemoFeedbackValidationError("Invalid body");
  }

  const body = value as Record<string, unknown>;

  if (typeof body.session_id !== "string" || !SESSION_ID_PATTERN.test(body.session_id)) {
    throw new DemoFeedbackValidationError("Invalid session_id");
  }
  if (typeof body.route !== "string" || body.route.length === 0) {
    throw new DemoFeedbackValidationError("Missing route");
  }
  if (body.route.length > 500) {
    throw new DemoFeedbackValidationError("Route exceeds 500 characters");
  }
  if (
    typeof body.category !== "string" ||
    !DEMO_FEEDBACK_CATEGORIES.includes(body.category as DemoFeedbackCategory)
  ) {
    throw new DemoFeedbackValidationError("Invalid category");
  }

  const note = optionalBoundedString(body.note, 2000, "Note exceeds 2000 characters");
  const errorMessage = optionalBoundedString(
    body.error_message,
    4000,
    "Error message exceeds 4000 characters",
  );

  if (
    !Array.isArray(body.breadcrumbs) ||
    body.breadcrumbs.length > 5 ||
    body.breadcrumbs.some(
      (breadcrumb) => typeof breadcrumb !== "string" || breadcrumb.length > 500,
    )
  ) {
    throw new DemoFeedbackValidationError("Invalid breadcrumbs");
  }

  const demoVersion = body.demo_version ?? "";
  if (typeof demoVersion !== "string" || demoVersion.length > 100) {
    throw new DemoFeedbackValidationError("Demo version exceeds 100 characters");
  }

  const sessionDuration = body.session_duration ?? 0;
  if (
    typeof sessionDuration !== "number" ||
    !Number.isInteger(sessionDuration) ||
    sessionDuration < 0 ||
    sessionDuration > MAX_SESSION_DURATION_SECONDS
  ) {
    throw new DemoFeedbackValidationError("Invalid session_duration");
  }

  return {
    session_id: body.session_id,
    route: body.route,
    category: body.category as DemoFeedbackCategory,
    error_message: errorMessage,
    note,
    breadcrumbs: body.breadcrumbs as string[],
    demo_version: demoVersion,
    session_duration: sessionDuration,
  };
}

export function computeServerFeedbackFingerprint(input: {
  route: string;
  category: DemoFeedbackCategory;
  errorMessage: string | null;
  note: string | null;
}): string {
  const detail =
    input.category === "ERROR" && input.errorMessage
      ? input.errorMessage
      : (input.note ?? input.errorMessage ?? "");
  const normalizedInput = [
    normalizeFeedbackText(input.route),
    input.category,
    normalizeFeedbackText(detail),
  ].join("::");

  return createHash("sha256").update(normalizedInput).digest("hex");
}

export function hashDemoFeedbackSession(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}
