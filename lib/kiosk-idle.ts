// Idle timing for the children's check-in kiosk (G2.2). Pure and edge-safe.

/** A kiosk that nobody touches for this long returns to its start screen. */
export const KIOSK_IDLE_MS = 60_000;
/** The "are you still there?" warning shows for the last part of that time. */
export const KIOSK_IDLE_WARNING_MS = 10_000;

/**
 * The idle time the page passes to the kiosk. KIOSK_IDLE_MS_OVERRIDE (a server
 * environment variable, for tests and demos) is honoured only outside
 * production, and only for a sensible positive number; otherwise 60 seconds.
 */
export function resolveKioskIdleMs(env: {
  NODE_ENV?: string;
  KIOSK_IDLE_MS_OVERRIDE?: string;
}): number {
  if (env.NODE_ENV === "production") return KIOSK_IDLE_MS;
  const parsed = Number(env.KIOSK_IDLE_MS_OVERRIDE);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > KIOSK_IDLE_MS) return KIOSK_IDLE_MS;
  return Math.floor(parsed);
}

/** The warning is the last 10 seconds, or the last half of a shortened idle time. */
export function kioskWarningMs(idleMs: number): number {
  return Math.min(KIOSK_IDLE_WARNING_MS, Math.floor(idleMs / 2));
}
