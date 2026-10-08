import "server-only";

// Family self check-in kiosk core (G2.2).
//
// A church admin signs in on a tablet and starts kiosk mode (a ccm_kiosk_sessions
// row plus the httpOnly `cc_kiosk` cookie holding the row id). Families then use
// the kiosk to look themselves up and check their children in. The kiosk can do
// two things only: look up a household and check its children in. Every kiosk
// server action re-authenticates through requireKioskSession; the proxy's
// redirect is only a convenience.
//
// server-only, not "use server": these functions trust the context they are given.
//
// Privacy: a lookup answers with children's first name + last initial only. A
// phone that matches nothing, a phone shared by several households, a code that
// matches nothing and a household with no child under 18 all give the identical
// neutral { status: "none" } and run the same sequence of queries.
//
// Cookie value: the ccm_kiosk_sessions row id. It is a random v4 uuid (122 bits),
// is useless without the starting admin's own Supabase session (checked on every
// call: same church, same login id), and is revocable server-side (ended_at), so a
// separate hashed token would add nothing.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { logAuditEvent } from "@/lib/actions/audit";
import { getSession, isChurchAppContext } from "@/lib/auth";
import { evaluateServiceGate, type ServiceGateRow } from "@/lib/ccm-checkin-core";
import { KIOSK_COOKIE_NAME, KIOSK_MAX_AGE_SECONDS } from "@/lib/ccm-kiosk-constants";
import { todayInTimeZone } from "@/lib/church-time";
import { normalizeFamilyCheckinCode } from "@/lib/family-checkin-code";
import { getTenantSupabaseEnv } from "@/lib/supabase/config";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

type AdminClient = ReturnType<typeof createTenantAdminClient>;

export const HOUSEHOLD_TOKEN_TTL_MS = 3 * 60 * 1000;
export const DEVICE_FAILURE_LIMIT = 5;
export const DEVICE_WINDOW_MS = 5 * 60 * 1000;
export const CHURCH_FAILURE_LIMIT = 50;
export const CHURCH_WINDOW_MS = 10 * 60 * 1000;
export const PAUSE_MS = 2 * 60 * 1000;
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_CHECKIN_STATUSES = ["checked_in", "late_pickup", "emergency", "transferred"];

export class KioskLockedError extends Error {
  constructor() {
    super("Kiosk needs a staff sign-in");
    this.name = "KioskLockedError";
  }
}

export type KioskContext = {
  churchId: string;
  churchTimeZone: string;
  /** auth.users id of the admin who started this kiosk (the audit actor). */
  adminLoginId: string;
  /** The starting admin's sign-in email, for re-checking their password on exit. Never logged. */
  adminEmail: string;
  kioskSessionId: string;
  deviceId: string;
};

export type KioskChild = {
  id: string;
  /** "Ana R." — first name and last initial only. */
  displayName: string;
  alreadyCheckedIn: boolean;
  /** Custody restriction or any other reason staff must handle this child by hand. */
  needsGreeter: boolean;
};

export type KioskLookupResult =
  | { status: "found"; householdToken: string; children: KioskChild[] }
  | { status: "none" }
  | { status: "paused"; retryAfterSeconds: number }
  | { status: "locked" }
  | { status: "error" };

// ── Session ──────────────────────────────────────────────────────────────────

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The kiosk's authorisation: the caller must be signed in as a church admin in the
 * church of an active kiosk session that this same login started. Throws
 * KioskLockedError otherwise; no family data is read before this passes.
 */
export async function requireKioskSession(): Promise<KioskContext> {
  const cookieStore = await cookies();
  const kioskSessionId = cookieStore.get(KIOSK_COOKIE_NAME)?.value ?? "";
  if (!UUID_PATTERN.test(kioskSessionId)) throw new KioskLockedError();

  const session = await getSession("/kiosk/children");
  if (
    !session ||
    !isChurchAppContext(session.appContext) ||
    session.appContext.roleId !== "church-admin"
  ) {
    throw new KioskLockedError();
  }

  const churchId = session.appContext.church.id;
  const earliestStart = new Date(Date.now() - KIOSK_MAX_AGE_SECONDS * 1000).toISOString();
  const { data, error } = await createTenantAdminClient()
    .from("ccm_kiosk_sessions")
    .select("id, device_id")
    .eq("id", kioskSessionId)
    .eq("church_id", churchId)
    .eq("admin_login_id", session.userId)
    .is("ended_at", null)
    .gte("started_at", earliestStart)
    .maybeSingle();

  if (error || !data) throw new KioskLockedError();

  return {
    churchId,
    churchTimeZone: session.appContext.church.timezone,
    adminLoginId: session.userId,
    adminEmail: session.profile.email,
    kioskSessionId,
    deviceId: String((data as { device_id: string }).device_id),
  };
}

export async function setKioskCookie(kioskSessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(KIOSK_COOKIE_NAME, kioskSessionId, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KIOSK_MAX_AGE_SECONDS,
  });
}

export async function clearKioskCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(KIOSK_COOKIE_NAME);
}

// ── Audit (best effort for family-facing events; never carries phone/code/PIN) ─

export async function auditKioskEvent(
  ctx: KioskContext,
  input: {
    tableName: string;
    recordId: string;
    operation: "INSERT" | "UPDATE";
    newValues: Record<string, unknown>;
  },
) {
  try {
    await logAuditEvent({
      tableName: input.tableName,
      recordId: input.recordId,
      operation: input.operation,
      actorId: ctx.adminLoginId,
      churchId: ctx.churchId,
      actorRole: "church-admin",
      newValues: { ...input.newValues, kioskSessionId: ctx.kioskSessionId },
    });
  } catch {
    // The check-in itself is also audited by the table trigger; do not fail a
    // family's check-in over a secondary audit write, and never log its payload.
    console.error("kiosk audit write failed");
  }
}

// ── Rate limit ───────────────────────────────────────────────────────────────

type AttemptKind = "phone" | "code" | "exit";
const LOOKUP_KINDS: AttemptKind[] = ["phone", "code"];

function deviceHash(ctx: KioskContext): string {
  return sha256Hex(ctx.deviceId);
}

/** Seconds left on a pause, or null when the kiosk may go on. Fails closed on a read error. */
export async function getPauseSeconds(
  ctx: KioskContext,
  kinds: AttemptKind[],
  now: number = Date.now(),
): Promise<number | null> {
  const admin = createTenantAdminClient();

  const [device, church] = await Promise.all([
    admin
      .from("ccm_kiosk_lookup_attempts")
      .select("created_at")
      .eq("church_id", ctx.churchId)
      .eq("device_id_hash", deviceHash(ctx))
      .eq("success", false)
      .in("kind", kinds)
      .gte("created_at", new Date(now - DEVICE_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(DEVICE_FAILURE_LIMIT),
    admin
      .from("ccm_kiosk_lookup_attempts")
      .select("created_at")
      .eq("church_id", ctx.churchId)
      .eq("success", false)
      .in("kind", kinds)
      .gte("created_at", new Date(now - CHURCH_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(CHURCH_FAILURE_LIMIT),
  ]);

  if (device.error || church.error) return PAUSE_MS / 1000;

  const remaining = (rows: Array<{ created_at: string }> | null, limit: number) => {
    if (!rows || rows.length < limit) return 0;
    const newest = new Date(rows[0].created_at).getTime();
    return Math.max(0, newest + PAUSE_MS - now);
  };

  const wait = Math.max(
    remaining(device.data as Array<{ created_at: string }> | null, DEVICE_FAILURE_LIMIT),
    remaining(church.data as Array<{ created_at: string }> | null, CHURCH_FAILURE_LIMIT),
  );
  return wait > 0 ? Math.ceil(wait / 1000) : null;
}

/** Records an attempt and prunes day-old rows. Throws when it cannot, so a lookup fails closed. */
export async function recordKioskAttempt(ctx: KioskContext, kind: AttemptKind, success: boolean) {
  const admin = createTenantAdminClient();
  const { error } = await admin.from("ccm_kiosk_lookup_attempts").insert({
    church_id: ctx.churchId,
    device_id_hash: deviceHash(ctx),
    kind,
    success,
  });
  if (error) throw new Error("Kiosk attempt could not be recorded.");

  // Opportunistic prune; losing it is harmless.
  await admin
    .from("ccm_kiosk_lookup_attempts")
    .delete()
    .eq("church_id", ctx.churchId)
    .lt("created_at", new Date(Date.now() - ATTEMPT_RETENTION_MS).toISOString());
}

/** Records a failed attempt; audits (once) the attempt that tripped the pause. */
export async function recordKioskFailure(ctx: KioskContext, kind: AttemptKind) {
  await recordKioskAttempt(ctx, kind, false);
  const pause = await getPauseSeconds(ctx, kind === "exit" ? ["exit"] : LOOKUP_KINDS);
  if (pause !== null) {
    await auditKioskEvent(ctx, {
      tableName: "ccm_kiosk_lookup_attempts",
      recordId: ctx.kioskSessionId,
      operation: "INSERT",
      newValues: { event: "kiosk.rate_limited", kind },
    });
  }
}

// ── Phone, names, age ────────────────────────────────────────────────────────

/** Digit strings that mean the same phone number as `input`, or null if it is not a plausible one. */
export function phoneDigitCandidates(input: unknown): string[] | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  const candidates = new Set([digits]);
  if (digits.length === 10) candidates.add(`1${digits}`);
  if (digits.length === 11 && digits.startsWith("1")) candidates.add(digits.slice(1));
  return [...candidates];
}

/** "Ana Rivera" -> "Ana R."; a single name stays as it is. Never a surname. */
export function displayChildName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0];
  if (parts.length === 1) return first;
  const initial = [...parts[parts.length - 1]][0]?.toUpperCase() ?? "";
  return initial ? `${first} ${initial}.` : first;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Under 18 on `today` (a church-local YYYY-MM-DD). Two birth-date fields exist
 * (children_sensitive_data.dob and profile_sensitive_fields.date_of_birth): both null means the
 * child is not shown; if they disagree the later (younger) date decides. Pure
 * string comparison on dates, so no timezone arithmetic can shift a birthday.
 */
export function isUnder18(
  dobs: Array<string | null | undefined>,
  today: string,
): boolean {
  const valid = dobs.filter((d): d is string => typeof d === "string" && DATE_ONLY.test(d));
  if (valid.length === 0) return false;
  const youngest = valid.reduce((a, b) => (a > b ? a : b));
  if (youngest > today) return false; // a birth date in the future is bad data
  const eighteenth = `${Number(youngest.slice(0, 4)) + 18}${youngest.slice(4)}`;
  return today < eighteenth;
}

// ── Household ────────────────────────────────────────────────────────────────

type OpenService = { id: string; ministryId: string; name: string };

/** The service the kiosk checks into: open, enabled, inside its window. Newest first. */
export async function findCheckinService(
  admin: AdminClient,
  churchId: string,
): Promise<OpenService | null> {
  const { data, error } = await admin
    .from("ccm_services")
    .select(
      "id, service_name, ministry_id, status, checkin_session_status, checkin_session_starts_at, checkin_session_ends_at",
    )
    .eq("church_id", churchId)
    .eq("status", "open")
    .eq("checkin_session_status", "enabled")
    .order("service_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(5);
  if (error) throw new Error("Kiosk could not read services.");
  const row = ((data ?? []) as Array<ServiceGateRow & { id: string; service_name: string }>).find(
    (service) => evaluateServiceGate(service) === null,
  );
  return row ? { id: row.id, ministryId: row.ministry_id, name: row.service_name } : null;
}

type HouseholdChild = {
  id: string;
  fullName: string;
  alreadyCheckedIn: boolean;
  needsGreeter: boolean;
};

/**
 * Children (under 18 today) of one family, with custody and already-checked-in
 * flags. Always runs the same queries, with a nil id when there is no family, so
 * a miss is indistinguishable from a hit by what the server did.
 */
export async function loadHousehold(
  ctx: KioskContext,
  familyId: string | null,
): Promise<HouseholdChild[]> {
  const admin = createTenantAdminClient();
  const today = todayInTimeZone(ctx.churchTimeZone);

  const { data: members, error: membersError } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("church_id", ctx.churchId)
    .eq("family_id", familyId ?? NIL_UUID)
    .is("merged_at", null);
  if (membersError) throw new Error("Kiosk could not read the household.");

  const people = (members ?? []) as Array<{ id: string; full_name: string | null }>;
  const ids = people.length > 0 ? people.map((p) => p.id) : [NIL_UUID];

  const [sensitive, personal, custody, service] = await Promise.all([
    admin
      .from("children_sensitive_data")
      .select("child_profile_id, dob")
      .eq("church_id", ctx.churchId)
      .in("child_profile_id", ids),
    admin
      .from("profile_sensitive_fields")
      .select("profile_id, date_of_birth")
      .eq("church_id", ctx.churchId)
      .in("profile_id", ids),
    admin
      .from("ccm_custody_restrictions")
      .select("child_profile_id")
      .eq("church_id", ctx.churchId)
      .in("child_profile_id", ids),
    findCheckinService(admin, ctx.churchId),
  ]);
  if (sensitive.error || personal.error || custody.error) throw new Error("Kiosk could not read the household.");

  const checkedIn = new Set<string>();
  {
    const { data, error } = await admin
      .from("ccm_checkin_sessions")
      .select("child_profile_id")
      .eq("church_id", ctx.churchId)
      .eq("service_id", service?.id ?? NIL_UUID)
      .in("child_profile_id", ids)
      .in("status", ACTIVE_CHECKIN_STATUSES);
    if (error) throw new Error("Kiosk could not read the household.");
    for (const row of (data ?? []) as Array<{ child_profile_id: string }>) {
      checkedIn.add(row.child_profile_id);
    }
  }

  const dobByChild = new Map<string, string | null>();
  for (const row of (sensitive.data ?? []) as Array<{ child_profile_id: string; dob: string | null }>) {
    dobByChild.set(row.child_profile_id, row.dob);
  }
  const profileDobById = new Map<string, string | null>();
  for (const row of (personal.data ?? []) as Array<{ profile_id: string; date_of_birth: string | null }>) {
    profileDobById.set(row.profile_id, row.date_of_birth);
  }
  const restricted = new Set(
    ((custody.data ?? []) as Array<{ child_profile_id: string }>).map((r) => r.child_profile_id),
  );

  return people
    .filter((person) => isUnder18([dobByChild.get(person.id), profileDobById.get(person.id)], today))
    .map((person) => ({
      id: person.id,
      fullName: person.full_name ?? "",
      alreadyCheckedIn: checkedIn.has(person.id),
      needsGreeter: restricted.has(person.id),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function issueHouseholdToken(
  ctx: KioskContext,
  familyId: string | null,
): Promise<string | null> {
  const token = familyId ? randomBytes(24).toString("base64url") : null;
  const { data, error } = await createTenantAdminClient()
    .from("ccm_kiosk_sessions")
    .update({
      household_token_hash: token ? sha256Hex(token) : null,
      household_family_id: familyId,
      household_token_expires_at: token
        ? new Date(Date.now() + HOUSEHOLD_TOKEN_TTL_MS).toISOString()
        : null,
    })
    .eq("id", ctx.kioskSessionId)
    .eq("church_id", ctx.churchId)
    .is("ended_at", null)
    .select("id");
  if (error || !data || data.length !== 1) throw new KioskLockedError();
  return token;
}

/**
 * Turns a resolved family (or none) into the neutral lookup answer, records the
 * attempt, and (re)issues or clears the kiosk's one household token.
 */
async function answerLookup(
  ctx: KioskContext,
  kind: "phone" | "code",
  familyId: string | null,
): Promise<KioskLookupResult> {
  const household = await loadHousehold(ctx, familyId);
  const found = familyId !== null && household.length > 0;
  const token = await issueHouseholdToken(ctx, found ? familyId : null);

  if (!found || !token) {
    await recordKioskFailure(ctx, kind);
    return { status: "none" };
  }

  await recordKioskAttempt(ctx, kind, true);
  return {
    status: "found",
    householdToken: token,
    children: household.map((child) => ({
      id: child.id,
      displayName: displayChildName(child.fullName),
      alreadyCheckedIn: child.alreadyCheckedIn,
      needsGreeter: child.needsGreeter,
    })),
  };
}

export async function lookupHouseholdByPhone(
  ctx: KioskContext,
  phone: unknown,
): Promise<KioskLookupResult> {
  const pause = await getPauseSeconds(ctx, LOOKUP_KINDS);
  if (pause !== null) return { status: "paused", retryAfterSeconds: pause };

  const candidates = phoneDigitCandidates(phone);
  const { data, error } = await createTenantAdminClient()
    .from("profiles")
    .select("family_id")
    .eq("church_id", ctx.churchId)
    .in("phone_digits", candidates ?? ["x"])
    .not("family_id", "is", null)
    .is("merged_at", null);
  if (error) throw new Error("Kiosk lookup failed.");

  const families = new Set(
    ((data ?? []) as Array<{ family_id: string }>).map((row) => row.family_id),
  );
  // A phone on more than one household identifies nobody: neutral answer.
  const familyId = candidates && families.size === 1 ? [...families][0] : null;
  return answerLookup(ctx, "phone", familyId);
}

export async function lookupHouseholdByCode(
  ctx: KioskContext,
  code: unknown,
): Promise<KioskLookupResult> {
  const pause = await getPauseSeconds(ctx, LOOKUP_KINDS);
  if (pause !== null) return { status: "paused", retryAfterSeconds: pause };

  const normalized = normalizeFamilyCheckinCode(code);
  const { data, error } = await createTenantAdminClient()
    .from("families")
    .select("id")
    .eq("church_id", ctx.churchId)
    .eq("checkin_code", normalized ?? "")
    .limit(2);
  if (error) throw new Error("Kiosk lookup failed.");

  const rows = (data ?? []) as Array<{ id: string }>;
  return answerLookup(ctx, "code", normalized && rows.length === 1 ? rows[0].id : null);
}

/**
 * Validates the household token against this kiosk's row (hash match, unexpired)
 * and returns the family it was issued for, or null.
 */
export async function verifyHouseholdToken(
  ctx: KioskContext,
  token: unknown,
): Promise<string | null> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return null;
  const { data, error } = await createTenantAdminClient()
    .from("ccm_kiosk_sessions")
    .select("household_token_hash, household_family_id, household_token_expires_at")
    .eq("id", ctx.kioskSessionId)
    .eq("church_id", ctx.churchId)
    .is("ended_at", null)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as {
    household_token_hash: string | null;
    household_family_id: string | null;
    household_token_expires_at: string | null;
  };
  if (!row.household_token_hash || !row.household_family_id || !row.household_token_expires_at) {
    return null;
  }
  if (new Date(row.household_token_expires_at).getTime() <= Date.now()) return null;

  const given = Buffer.from(sha256Hex(token), "hex");
  const stored = Buffer.from(row.household_token_hash, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;
  return row.household_family_id;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// ── Leaving kiosk mode ───────────────────────────────────────────────────────

/**
 * True only when `password` is the password of the admin who started this kiosk.
 * A throwaway supabase-js client (no persisted session, no refresh) signs in with
 * the email from the SERVER session and the typed password; the returned user must
 * be that same login. The result is discarded: the real session cookie is never
 * touched, and the throwaway session is revoked (scope "local" ends only that
 * one). An account without password sign-in (e.g. magic-link only) cannot pass.
 */
export async function verifyAdminPassword(ctx: KioskContext, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || password.length > 1024) return false;
  if (!ctx.adminEmail) return false;

  const { url, publishableKey } = getTenantSupabaseEnv();
  const throwaway = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { data, error } = await throwaway.auth.signInWithPassword({
      email: ctx.adminEmail,
      password,
    });
    if (error || !data.user || data.user.id !== ctx.adminLoginId) return false;
    await throwaway.auth.signOut({ scope: "local" }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Ends the kiosk session row; false when it was not active. */
export async function endKioskSession(ctx: KioskContext): Promise<boolean> {
  const { data, error } = await createTenantAdminClient()
    .from("ccm_kiosk_sessions")
    .update({
      ended_at: new Date().toISOString(),
      household_token_hash: null,
      household_family_id: null,
      household_token_expires_at: null,
    })
    .eq("id", ctx.kioskSessionId)
    .eq("church_id", ctx.churchId)
    .is("ended_at", null)
    .select("id");
  if (error) throw new Error("Kiosk could not be ended.");
  return Boolean(data && data.length === 1);
}
