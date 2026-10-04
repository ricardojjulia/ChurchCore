// PII scrubbing applied before any text reaches a model (moved from app/api/ai/route.ts, ADR 0027).
// Pure: no server-only needed.

export function scrubPII(text: string): string {
  if (!text) return "";
  
  // 1. Scrub email addresses. Quantifiers are bounded (RFC 5321-ish limits)
  // rather than unbounded `+` to avoid polynomial backtracking (ReDoS) on
  // adversarial input -- this runs on user-controlled prompt text.
  let scrubbed = text.replace(
    /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}/g,
    "[EMAIL]"
  );

  // 2. Scrub UUIDs (typically matches user_id, auth_id, record IDs)
  scrubbed = scrubbed.replace(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    "[ID]"
  );

  // 3. Scrub phone numbers: North American (incl. 787/939) and "+"-prefixed
  // international. Shaped, so dates like 2026-10-03 survive.
  scrubbed = scrubbed
    .replace(/\+\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,4}\d{2,4}\b/g, "[PHONE]")
    .replace(/(?:\b1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[PHONE]");

  return scrubbed;
}
