import "server-only";

import { cookies } from "next/headers";

import type { AuthSession } from "@/lib/auth";
import {
  buildDefaultCalendarBoardState,
  buildDefaultChurchAdminWorkspaceState,
  type CalendarBoardState,
  type ChurchAdminWorkspaceState,
} from "@/lib/application-state";

const cookieMaxAge = 60 * 60 * 24 * 14;

function scopedCookieName(scope: string, session: AuthSession) {
  const safeUserId = session.userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeChurchId =
    session.appContext.kind === "church"
      ? session.appContext.church.id.replace(/[^a-zA-Z0-9_-]/g, "_")
      : "platform";

  return `churchforge_${scope}_${safeUserId}_${safeChurchId}`;
}

async function readJsonCookie<T>(name: string): Promise<T | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(name)?.value;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonCookie(name: string, value: unknown) {
  const cookieStore = await cookies();

  cookieStore.set(name, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: cookieMaxAge,
  });
}

export async function getChurchAdminWorkspaceState(
  session: AuthSession,
): Promise<ChurchAdminWorkspaceState> {
  const cookieName = scopedCookieName("church_admin_state", session);

  return (
    (await readJsonCookie<ChurchAdminWorkspaceState>(cookieName)) ??
    buildDefaultChurchAdminWorkspaceState()
  );
}

export async function persistChurchAdminWorkspaceState(
  session: AuthSession,
  state: ChurchAdminWorkspaceState,
) {
  const cookieName = scopedCookieName("church_admin_state", session);
  await writeJsonCookie(cookieName, state);
}

export async function getCalendarBoardState(
  session: AuthSession,
): Promise<CalendarBoardState> {
  const cookieName = scopedCookieName("calendar_board_state", session);

  return (
    (await readJsonCookie<CalendarBoardState>(cookieName)) ??
    buildDefaultCalendarBoardState()
  );
}

export async function persistCalendarBoardState(
  session: AuthSession,
  state: CalendarBoardState,
) {
  const cookieName = scopedCookieName("calendar_board_state", session);
  await writeJsonCookie(cookieName, state);
}
