"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { persistCalendarBoardState } from "@/lib/application-state-store";
import type { CalendarBoardState } from "@/lib/application-state";

export async function persistCalendarBoardStateAction(
  state: CalendarBoardState,
) {
  const session = await getSession();

  if (!session) {
    throw new Error("No active session.");
  }

  await persistCalendarBoardState(session, state);
  revalidatePath("/app/calendar");
}
