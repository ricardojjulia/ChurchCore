import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  computeServerFeedbackFingerprint,
  DemoFeedbackValidationError,
  hashDemoFeedbackSession,
  parseDemoFeedbackPayload,
} from '@/lib/demo/feedback';
import { createControlPlaneAdminClient } from '@/lib/supabase/control-plane';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let payload;
  try {
    payload = parseDemoFeedbackPayload(body);
  } catch (error) {
    if (error instanceof DemoFeedbackValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const session = await getSession(payload.route);
    const fingerprint = computeServerFeedbackFingerprint({
      route: payload.route,
      category: payload.category,
      errorMessage: payload.error_message,
      note: payload.note,
    });
    const adminClient = createControlPlaneAdminClient();
    const { data, error } = await adminClient.rpc('submit_demo_feedback', {
      p_session_key_hash: hashDemoFeedbackSession(payload.session_id),
      p_fingerprint: fingerprint,
      p_session_id: payload.session_id,
      p_route: payload.route,
      p_category: payload.category,
      p_error_message: payload.error_message,
      p_note: payload.note,
      p_breadcrumbs: payload.breadcrumbs,
      p_user_email: session?.profile.email ?? null,
      p_user_role: session?.profile.roleId ?? null,
      p_demo_version: payload.demo_version,
      p_session_duration_seconds: payload.session_duration,
      p_metadata: {},
    });
    if (error) {
      console.error('[demo/feedback] Supabase RPC error:', error.message);
      return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
    }
    if (data !== true) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[demo/feedback] Unexpected error:', err);
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
  }
}
