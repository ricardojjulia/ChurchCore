"use server";

// Family self check-in kiosk actions (G2.2). Every export authenticates itself:
// requireKioskSession checks the caller's own church-admin session AND the active
// kiosk session this admin started (cc_kiosk cookie). They never return a phone
// number, a family code, a surname or an age, and they never throw to the browser
// for an expected outcome: the UI branches on `status`.

import {
  auditKioskEvent,
  clearKioskCookie,
  endKioskSession,
  findCheckinService,
  displayChildName,
  getPauseSeconds,
  isUuid,
  KioskLockedError,
  loadHousehold,
  lookupHouseholdByCode,
  lookupHouseholdByPhone,
  recordKioskAttempt,
  recordKioskFailure,
  requireKioskSession,
  verifyAdminPassword,
  verifyHouseholdToken,
  type KioskContext,
  type KioskLookupResult,
} from "@/lib/ccm-kiosk-core";
import { performCheckin } from "@/lib/ccm-checkin-core";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

const MAX_CHILDREN_PER_CHECKIN = 10;
const ADMIN_HOME_PATH = "/app/church-admin/children";

async function withKiosk<T extends { status: string }>(
  run: (ctx: KioskContext) => Promise<T>,
): Promise<T | { status: "locked" } | { status: "error" }> {
  try {
    return await run(await requireKioskSession());
  } catch (error) {
    if (error instanceof KioskLockedError) return { status: "locked" };
    return { status: "error" };
  }
}

export async function lookupByPhoneAction(input: { phone: string }): Promise<KioskLookupResult> {
  return withKiosk((ctx) => lookupHouseholdByPhone(ctx, input?.phone));
}

export async function lookupByCodeAction(input: { code: string }): Promise<KioskLookupResult> {
  return withKiosk((ctx) => lookupHouseholdByCode(ctx, input?.code));
}

export type KioskOptionsResult =
  | {
      status: "ok";
      /** null when no service is open for check-in right now: show "please see a greeter". */
      service: { id: string; name: string } | null;
      rooms: Array<{ id: string; name: string }>;
    }
  | { status: "locked" }
  | { status: "error" };

export async function getKioskOptionsAction(): Promise<KioskOptionsResult> {
  return withKiosk(async (ctx): Promise<KioskOptionsResult> => {
    const admin = createTenantAdminClient();
    const service = await findCheckinService(admin, ctx.churchId);
    if (!service) return { status: "ok", service: null, rooms: [] };

    const { data, error } = await admin
      .from("children_rooms")
      .select("id, name")
      .eq("church_id", ctx.churchId)
      .eq("ministry_id", service.ministryId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw new Error("Kiosk could not read rooms.");

    return {
      status: "ok",
      service: { id: service.id, name: service.name },
      rooms: ((data ?? []) as Array<{ id: string; name: string }>).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    };
  });
}

export type KioskChildCheckinStatus = "checked_in" | "already" | "greeter" | "closed";

export type KioskCheckinResult =
  | {
      status: "done";
      results: Array<{
        childId: string;
        displayName: string;
        status: KioskChildCheckinStatus;
        /** Present only for "checked_in", and only in this response. */
        pin?: string;
        roomName?: string;
      }>;
    }
  | { status: "expired" }
  | { status: "invalid" }
  | { status: "locked" }
  | { status: "error" };

export async function kioskCheckinAction(input: {
  householdToken: string;
  childIds: string[];
  roomId: string;
  serviceId: string;
}): Promise<KioskCheckinResult> {
  return withKiosk(async (ctx): Promise<KioskCheckinResult> => {
    const childIds = Array.isArray(input?.childIds)
      ? [...new Set(input.childIds.filter(isUuid))]
      : [];
    if (
      childIds.length === 0 ||
      childIds.length > MAX_CHILDREN_PER_CHECKIN ||
      !isUuid(input?.roomId) ||
      !isUuid(input?.serviceId)
    ) {
      return { status: "invalid" };
    }

    const familyId = await verifyHouseholdToken(ctx, input.householdToken);
    if (!familyId) return { status: "expired" };

    // Rebuild the household from the database: eligibility (under 18 today),
    // custody and "already in" are decided here, never taken from the browser.
    const household = await loadHousehold(ctx, familyId);
    const byId = new Map(household.map((child) => [child.id, child]));

    const results: Extract<KioskCheckinResult, { status: "done" }>["results"] = [];
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child || child.needsGreeter) {
        // Not in this household, not a child, or a custody restriction: the same
        // answer, with no reason.
        results.push({ childId, displayName: child ? displayChildName(child.fullName) : "", status: "greeter" });
        continue;
      }
      const displayName = displayChildName(child.fullName);
      if (child.alreadyCheckedIn) {
        results.push({ childId, displayName, status: "already" });
        continue;
      }

      const outcome = await performCheckin({
        churchId: ctx.churchId,
        actorLoginId: ctx.adminLoginId,
        serviceId: input.serviceId,
        roomId: input.roomId,
        childProfileId: childId,
        source: "kiosk",
      });

      switch (outcome.status) {
        case "checked_in":
          results.push({
            childId,
            displayName,
            status: "checked_in",
            pin: outcome.pin,
            roomName: outcome.session.roomName,
          });
          await auditKioskEvent(ctx, {
            tableName: "ccm_checkin_sessions",
            recordId: outcome.session.id,
            operation: "INSERT",
            newValues: {
              event: "kiosk.checkin",
              source: "kiosk",
              serviceId: input.serviceId,
              roomId: input.roomId,
            },
          });
          break;
        case "already":
          results.push({ childId, displayName, status: "already" });
          break;
        case "closed":
        case "invalid_room":
          results.push({ childId, displayName, status: "closed" });
          break;
        case "invalid_child":
          results.push({ childId, displayName, status: "greeter" });
          break;
      }
    }

    return { status: "done", results };
  });
}

export type KioskExitResult =
  | { status: "exited"; redirectTo: string }
  | { status: "wrong_password" }
  | { status: "paused"; retryAfterSeconds: number }
  | { status: "locked" }
  | { status: "error" };

export async function exitKioskAction(input: { password: string }): Promise<KioskExitResult> {
  return withKiosk(async (ctx): Promise<KioskExitResult> => {
    const pause = await getPauseSeconds(ctx, ["exit"]);
    if (pause !== null) return { status: "paused", retryAfterSeconds: pause };

    const verified = await verifyAdminPassword(ctx, input?.password);
    if (!verified) {
      await recordKioskFailure(ctx, "exit");
      await auditKioskEvent(ctx, {
        tableName: "ccm_kiosk_sessions",
        recordId: ctx.kioskSessionId,
        operation: "UPDATE",
        newValues: { event: "kiosk.exit_failed" },
      });
      return { status: "wrong_password" };
    }

    await recordKioskAttempt(ctx, "exit", true);
    if (!(await endKioskSession(ctx))) return { status: "locked" };
    await clearKioskCookie();
    await auditKioskEvent(ctx, {
      tableName: "ccm_kiosk_sessions",
      recordId: ctx.kioskSessionId,
      operation: "UPDATE",
      newValues: { event: "kiosk.exit", endedAt: new Date().toISOString() },
    });
    return { status: "exited", redirectTo: ADMIN_HOME_PATH };
  });
}
