import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { sanitizeRedirectTarget } from "@/lib/auth";
import { hasTenantSupabaseEnv } from "@/lib/supabase/config";
import { createTenantServerClient } from "@/lib/supabase/tenant";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeRedirectTarget(searchParams.get("next"));

  if (!hasTenantSupabaseEnv()) {
    return NextResponse.redirect(new URL("/sign-in?error=supabase-not-configured", origin));
  }

  if (tokenHash && type) {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/sign-in?error=confirm", origin));
}
