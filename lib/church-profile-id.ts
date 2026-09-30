import type { AuthSession } from "@/lib/auth";

/**
 * The signed-in person's church profile id (public.profiles.id), or an error
 * when they have none in the church in context (e.g. a platform admin viewing
 * a tenant). Use it where an action needs to act *as* the person.
 *
 * `session.profile.id` is the auth (login) user id, not a profiles id (S7).
 * The session resolves `churchProfileId` once, at sign-in, and every other
 * helper (`resolveActiveChurchProfileId` included) returns that value (S9).
 */
export function requireChurchProfileId(session: Pick<AuthSession, "churchProfileId">): string {
  if (!session.churchProfileId) {
    throw new Error("Your account has no profile in this church.");
  }
  return session.churchProfileId;
}
