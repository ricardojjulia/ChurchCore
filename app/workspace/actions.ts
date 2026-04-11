"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import {
  persistChurchAdminWorkspaceState,
} from "@/lib/application-state-store";
import type { ChurchAdminWorkspaceState } from "@/lib/application-state";

export async function persistChurchAdminWorkspaceStateAction(
  state: ChurchAdminWorkspaceState,
) {
  const session = await getSession();

  if (!session) {
    throw new Error("No active session.");
  }

  await persistChurchAdminWorkspaceState(session, state);
  revalidatePath("/app/church-admin");
}
