"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  clearAppContextSelection,
  getDemoProfile,
  sanitizeRedirectTarget,
  sessionCookieName,
} from "@/lib/auth";
import {
  getPreferredSupabaseSurfaceForRedirect,
  hasSupabaseEnvForSurface,
  hasControlPlaneSupabaseEnv,
  hasTenantSupabaseEnv,
} from "@/lib/supabase/config";
import { toFriendlySupabaseErrorMessage } from "@/lib/supabase/postgrest";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

function isCsrfMismatchError(message: string | null | undefined) {
  return message?.toLowerCase().includes("csrf token mismatch") === true;
}

async function clearStaleSupabaseAuthCookies() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  for (const cookie of allCookies) {
    if (
      cookie.name.startsWith("sb-") &&
      (cookie.name.includes("auth-token") || cookie.name.includes("code-verifier"))
    ) {
      cookieStore.delete(cookie.name);
    }
  }
}

export async function signInAction(formData: FormData) {
  const redirectTo = sanitizeRedirectTarget(
    String(formData.get("redirectTo") ?? "/workspace"),
  );
  const errorRedirect = (message: string) =>
    redirect(
      `/sign-in?error=${encodeURIComponent(message)}&redirectTo=${encodeURIComponent(
        redirectTo,
      )}`,
    );

  const authSurface = getPreferredSupabaseSurfaceForRedirect(redirectTo);

  if (hasSupabaseEnvForSurface(authSurface)) {
    const intent = String(formData.get("intent") ?? "sign-in");
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      errorRedirect("Enter both email and password.");
    }

    const supabase = await createSupabaseServerClient(authSurface);

    if (intent === "sign-up") {
      if (authSurface === "control-plane") {
        errorRedirect("Control-plane accounts must be provisioned by ChurchCore Ops staff.");
      }

      const headerStore = await headers();
      const origin =
        headerStore.get("origin") ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:4200";
      const emailRedirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(
        redirectTo,
      )}`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        errorRedirect(toFriendlySupabaseErrorMessage(error.message));
      }

      redirect(
        `/sign-in?message=${encodeURIComponent(
          "Check your email to confirm your account.",
        )}&redirectTo=${encodeURIComponent(redirectTo)}`,
      );
    }

    let { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Stale PKCE/session cookies can trigger CSRF mismatch on self-hosted
    // or proxied environments. Clear stale auth cookies and retry once.
    if (isCsrfMismatchError(error?.message)) {
      await clearStaleSupabaseAuthCookies();

      const retryClient = await createSupabaseServerClient(authSurface);
      const retry = await retryClient.auth.signInWithPassword({
        email,
        password,
      });
      error = retry.error;
    }

    if (error) {
      errorRedirect(toFriendlySupabaseErrorMessage(error.message));
    }

    revalidatePath("/", "layout");
    redirect(redirectTo);
  }

  const profileId = String(formData.get("profileId") ?? "");
  const profile = getDemoProfile(profileId);

  if (!profile) {
    redirect("/sign-in?error=profile");
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, profile.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect(redirectTo);
}

export async function signOutAction() {
  if (hasTenantSupabaseEnv()) {
    const supabase = await createSupabaseServerClient("tenant");
    await supabase.auth.signOut();
  }

  if (hasControlPlaneSupabaseEnv()) {
    const supabase = await createSupabaseServerClient("control-plane");
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  await clearAppContextSelection();

  revalidatePath("/", "layout");
  redirect("/sign-in");
}
