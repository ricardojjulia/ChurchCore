import "server-only";

// Family check-in codes (G2.2): 8 characters of Crockford base32 (no I, L, O,
// U), generated with node:crypto. Stored in plain text in families.checkin_code
// because the kiosk matches by equality and the family sees it on their Family
// page; column-level SELECT is revoked from authenticated, so it is only read
// by server code through the service-role client. A code is a bearer lookup
// key, not a credential: it never appears in a log, an audit row, or an error.
// Server-only, not "use server": these take a trusted church id.

import { randomInt } from "node:crypto";

import { createTenantAdminClient } from "@/lib/supabase/tenant";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const FAMILY_CHECKIN_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const MAX_ATTEMPTS = 6;

export function generateFamilyCheckinCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * What a family typed or a scanner read, reduced to the stored alphabet:
 * upper-cased, spaces and hyphens dropped, and the look-alikes O -> 0 and
 * I/L -> 1 folded. Null when it is not a valid 8-character code.
 */
export function normalizeFamilyCheckinCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const folded = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return FAMILY_CHECKIN_CODE_PATTERN.test(folded) ? folded : null;
}

type AssignResult = { ok: true; code: string } | { ok: false; reason: "not_found" | "failed" };

/**
 * Writes a fresh code to one family of one church. With `onlyIfMissing` it is a
 * compare-and-set (a concurrent first view wins and the loser reads the winner's
 * code), otherwise it rotates: the old code stops matching at once.
 */
export async function assignFamilyCheckinCode(input: {
  churchId: string;
  familyId: string;
  onlyIfMissing: boolean;
}): Promise<AssignResult> {
  const admin = createTenantAdminClient();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateFamilyCheckinCode();
    let query = admin
      .from("families")
      .update({ checkin_code: code, checkin_code_rotated_at: new Date().toISOString() })
      .eq("id", input.familyId)
      .eq("church_id", input.churchId);
    if (input.onlyIfMissing) query = query.is("checkin_code", null);

    const { data, error } = await query.select("id");

    if (error) {
      // 23505: another family in this church already holds that code. Draw again.
      if (error.code === "23505") continue;
      return { ok: false, reason: "failed" };
    }
    if (data && data.length === 1) return { ok: true, code };
    if (!data || data.length === 0) {
      return input.onlyIfMissing
        ? readFamilyCheckinCode(input.churchId, input.familyId)
        : { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "failed" };
  }

  return { ok: false, reason: "failed" };
}

export async function readFamilyCheckinCode(
  churchId: string,
  familyId: string,
): Promise<AssignResult> {
  const { data, error } = await createTenantAdminClient()
    .from("families")
    .select("checkin_code")
    .eq("id", familyId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (error) return { ok: false, reason: "failed" };
  if (!data) return { ok: false, reason: "not_found" };
  const code = (data as { checkin_code: string | null }).checkin_code;
  return code ? { ok: true, code } : { ok: false, reason: "failed" };
}
