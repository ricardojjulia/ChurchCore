import "server-only";

import { createControlPlaneServerClient } from "@/lib/supabase/control-plane";
import { hasControlPlaneSupabaseEnv } from "@/lib/supabase/config";

export type DemoFeedbackAction =
  | "code_fixed"
  | "update_applied"
  | "suggestion_not_implemented"
  | "suggestion_implemented"
  | "bug_fixed"
  | "error_fixed"
  | "received_and_closed";

export type DemoFeedbackRow = {
  id: string;
  fingerprint: string;
  session_id: string;
  route: string;
  category: "BUG" | "ERROR" | "UNEXPECTED_RESULT" | "IMPROVEMENT";
  error_message: string | null;
  note: string | null;
  breadcrumbs: unknown[];
  user_email: string | null;
  user_role: string | null;
  demo_version: string;
  session_duration_seconds: number | null;
  hit_count: number;
  metadata: Record<string, unknown>;
  processed: boolean;
  action: DemoFeedbackAction | null;
  created_at: string;
  updated_at: string;
};

export type DemoFeedbackResult =
  | { status: "ready"; rows: DemoFeedbackRow[] }
  | { status: "unavailable"; rows: []; message: string }
  | { status: "error"; rows: []; message: string };

export async function loadDemoFeedback(): Promise<DemoFeedbackResult> {
  if (!hasControlPlaneSupabaseEnv()) {
    return {
      status: "unavailable",
      rows: [],
      message: "Control-plane feedback storage is not configured for this environment.",
    };
  }

  const supabase = await createControlPlaneServerClient();
  const { data, error } = await supabase
    .from("demo_feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[demo-feedback] Failed to load demo_feedback:", error.message);
    return {
      status: "error",
      rows: [],
      message: "Feedback could not be loaded. Try again after checking control-plane health.",
    };
  }
  return { status: "ready", rows: (data ?? []) as DemoFeedbackRow[] };
}
