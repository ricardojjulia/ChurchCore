/**
 * The single reviewed list of console.error / pageerror messages the page×role
 * sweep tolerates. Every other console error fails the sweep.
 *
 * Add an entry only for genuinely benign noise (browser or framework chatter
 * that doesn't reflect an app defect), with a reason and date. A real app error
 * is a bug to fix or to mark with test.fail() in the sweep, never an allowlist
 * entry.
 */
export interface ConsoleAllowlistEntry {
  pattern: RegExp;
  reason: string;
  added: string;
}

export const consoleAllowlist: ConsoleAllowlistEntry[] = [
  {
    // Chromium logs a console error for every non-2xx subresource or document
    // response. Denied-role and not-found checks intentionally produce 3xx/404
    // responses; the sweep asserts status codes directly, so the duplicate
    // browser log adds nothing.
    pattern: /Failed to load resource: the server responded with a status of (401|403|404)/,
    reason: "Browser log for intentional 401/403/404 responses; status is asserted directly.",
    added: "2026-09-23",
  },
];

export function isAllowlisted(message: string): boolean {
  return consoleAllowlist.some((entry) => entry.pattern.test(message));
}
