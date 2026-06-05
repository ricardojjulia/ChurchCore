import { NextRequest, NextResponse } from 'next/server';
import { createControlPlaneAdminClient } from '@/lib/supabase/control-plane';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

const VALID_CATEGORIES = ['BUG', 'ERROR', 'UNEXPECTED_RESULT', 'IMPROVEMENT'] as const;
type Category = typeof VALID_CATEGORIES[number];

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

  const b = body as Record<string, unknown>;
  const { session_id, route, category, error_message, note, breadcrumbs, user_email, user_role, demo_version, fingerprint } = b;

  if (!session_id || typeof session_id !== 'string' || !/^[0-9a-f-]{36}$/.test(session_id)) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 });
  }
  if (!route || typeof route !== 'string') {
    return NextResponse.json({ error: 'Missing route' }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  if (note && typeof note === 'string' && note.length > 2000) {
    return NextResponse.json({ error: 'Note exceeds 2000 characters' }, { status: 400 });
  }
  if (!fingerprint || typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)) {
    return NextResponse.json({ error: 'Invalid fingerprint' }, { status: 400 });
  }

  const now = Date.now();
  const existing = rateLimitMap.get(session_id);
  if (existing) {
    if (now - existing.windowStart < RATE_LIMIT_WINDOW_MS) {
      if (existing.count >= RATE_LIMIT_MAX) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
      existing.count++;
    } else {
      rateLimitMap.set(session_id, { count: 1, windowStart: now });
    }
  } else {
    rateLimitMap.set(session_id, { count: 1, windowStart: now });
  }

  try {
    const adminClient = createControlPlaneAdminClient();
    const { error } = await adminClient.rpc('upsert_demo_feedback', {
      p_fingerprint:   fingerprint as string,
      p_session_id:    session_id as string,
      p_route:         route as string,
      p_category:      category as string,
      p_error_message: (error_message as string | null) ?? null,
      p_note:          (note as string | null) ?? null,
      p_breadcrumbs:   JSON.stringify(Array.isArray(breadcrumbs) ? breadcrumbs : []),
      p_user_email:    (user_email as string | null) ?? null,
      p_user_role:     (user_role as string | null) ?? null,
      p_demo_version:  (demo_version as string) ?? '',
      p_metadata:      JSON.stringify({}),
    });
    if (error) {
      console.error('[demo/feedback] Supabase RPC error:', error.message);
      return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[demo/feedback] Unexpected error:', err);
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
  }
}
