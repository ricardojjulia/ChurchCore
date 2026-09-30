import "server-only";

import type { ChurchAppSession } from "@/lib/auth";

/**
 * The signed-in person's profiles.id in the church in context, or null.
 *
 * One source of truth (S9): this is `session.churchProfileId`, resolved once
 * when the session is built (lib/auth.ts). It used to run its own query,
 * which could disagree with the session. `profiles.user_id` is unique, so a
 * login has at most one profile; merged profiles don't count.
 */
export async function resolveActiveChurchProfileId(session: ChurchAppSession): Promise<string | null> {
  return session.churchProfileId;
}
