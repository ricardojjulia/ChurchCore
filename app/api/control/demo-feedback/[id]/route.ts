import { NextRequest, NextResponse } from "next/server";
import { requireControlPlaneSession } from "@/lib/auth";
import { createControlPlaneAdminClient } from "@/lib/supabase/control-plane";
import type { DemoFeedbackAction } from "@/lib/control-plane-demo-feedback";

const VALID_ACTIONS = new Set<string>([
  "code_fixed",
  "update_applied",
  "suggestion_not_implemented",
  "suggestion_implemented",
  "bug_fixed",
  "error_fixed",
  "received_and_closed",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireControlPlaneSession("/control/demo-feedback");

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: { processed?: boolean; action?: DemoFeedbackAction | null } = {};

  if ("processed" in body) {
    if (typeof body.processed !== "boolean") {
      return NextResponse.json({ error: "processed must be boolean" }, { status: 400 });
    }
    patch.processed = body.processed;
  }

  if ("action" in body) {
    if (body.action !== null && !VALID_ACTIONS.has(body.action)) {
      return NextResponse.json({ error: "Invalid action value" }, { status: 400 });
    }
    patch.action = body.action;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createControlPlaneAdminClient();
  const { error } = await supabase
    .from("demo_feedback")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[demo-feedback] Failed to update triage:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
