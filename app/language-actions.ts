"use server";

import { cookies } from "next/headers";

import { localeCookieName, normalizeLocale } from "@/lib/i18n";

export async function setLocaleAction(locale: string) {
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, normalizeLocale(locale), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
