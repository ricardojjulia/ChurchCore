import "server-only";

import { createControlPlaneServerClient } from "@/lib/supabase/control-plane";

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
  hit_count: number;
  metadata: Record<string, unknown>;
  processed: boolean;
  action: DemoFeedbackAction | null;
  created_at: string;
  updated_at: string;
};

export async function loadDemoFeedback(): Promise<DemoFeedbackRow[]> {
  const supabase = await createControlPlaneServerClient();
  const { data, error } = await supabase
    .from("demo_feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[demo-feedback] Failed to load demo_feedback:", error.message);
    return [];
  }
  return (data ?? []) as DemoFeedbackRow[];
}
