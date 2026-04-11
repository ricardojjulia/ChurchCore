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
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { toFriendlySupabaseErrorMessage } from "@/lib/supabase/postgrest";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

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

  if (hasSupabaseEnv()) {
    const intent = String(formData.get("intent") ?? "sign-in");
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      errorRedirect("Enter both email and password.");
    }

    const supabase = await createSupabaseServerClient();

    if (intent === "sign-up") {
      const headerStore = await headers();
      const origin =
        headerStore.get("origin") ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000";
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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
  if (hasSupabaseEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  await clearAppContextSelection();

  revalidatePath("/", "layout");
  redirect("/sign-in");
}
