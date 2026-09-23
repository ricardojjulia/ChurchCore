import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  createTenantAdminClientMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  supabaseFromMock,
  supabaseInsertMock,
  supabaseBuilderMock,
  logAuditEventMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const logAuditEvent = vi.fn();

  const supabaseInsert = vi.fn();
  const supabaseFrom = vi.fn(() => ({
    insert: supabaseInsert,
  }));
  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  const supabaseMaybeSingle = vi.fn();
  const supabaseSingle = vi.fn();
  const supabaseOrder = vi.fn();
  const supabaseGte = vi.fn();
  const supabaseUpdate = vi.fn();
  const supabaseEq = vi.fn();
  const supabaseSelect = vi.fn();

  const supabaseBuilder = {
    select: supabaseSelect,
    update: supabaseUpdate,
    eq: supabaseEq,
    gte: supabaseGte,
    order: supabaseOrder,
    single: supabaseSingle,
    maybeSingle: supabaseMaybeSingle,
  };

  supabaseSelect.mockReturnValue(supabaseBuilder);
  supabaseUpdate.mockReturnValue(supabaseBuilder);
  supabaseEq.mockReturnValue(supabaseBuilder);
  supabaseGte.mockReturnValue(supabaseBuilder);
  supabaseOrder.mockReturnValue(supabaseBuilder);

  const createTenantAdminClient = vi.fn(() => ({
    from: vi.fn(() => supabaseBuilder),
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    createTenantAdminClientMock: createTenantAdminClient,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    supabaseFromMock: supabaseFrom,
    supabaseInsertMock: supabaseInsert,
    supabaseBuilderMock: supabaseBuilder,
    logAuditEventMock: logAuditEvent,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: createTenantAdminClientMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

vi.mock("@/lib/actions/audit", () => ({
  logAuditEvent: logAuditEventMock,
}));

import {
  addRunOfServiceItemAction,
  assignVolunteerAction,
  createServicePlanAction,
  reorderServicePlanItemsAction,
  respondToShiftAction,
  saveServicePlanTemplateAction,
  sendVolunteerReminderAction,
  updateServicePlanDetailsAction,
  getPublicVolunteerShiftByToken,
  getPublicVolunteerScheduleByToken,
  respondToPublicShiftAction,
} from "@/app/app/volunteer-actions";

describe("volunteer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockImplementation(async (path: string) => {
      if (path === "/app/member/schedule") {
        return {
          appContext: { roleId: "member", church: { id: "church-1" } },
          profile: { id: "member-1" },
        };
      }
      return {
        appContext: { roleId: "church-admin", church: { id: "church-1" } },
        profile: { id: "admin-1" },
      };
    });
    supabaseInsertMock.mockResolvedValue({ error: { message: "insert failed" } });
  });

  it("rejects create service plan for non-admin roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "member-1" },
    });

    await expect(
      createServicePlanAction({
        name: "Sunday Morning",
        serviceDate: "2026-04-21",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("validates required service plan name and date", async () => {
    const result = await createServicePlanAction({
      name: "   ",
      serviceDate: "",
    });

    expect(result).toEqual({ ok: false, error: "Name and service date are required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("creates service plan and applies template positions in local mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ positions: JSON.stringify([{ roleName: "Greeter", quantity: 2 }]) }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await createServicePlanAction({
      eventId: "event-1",
      name: "Sunday Morning",
      serviceDate: "2026-04-21",
      templateId: "template-1",
    });

    expect(result).toEqual({ ok: true, id: "plan-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      "select id from public.events where id = $1 and church_id = $2 limit 1",
      ["event-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.service_plan_positions"),
      ["plan-1", "church-1", "Greeter", 2, 0],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/volunteers/schedules");
  });

  it("rejects create service plan when linked event is out of scope", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await createServicePlanAction({
      eventId: "event-2",
      name: "Sunday Morning",
      serviceDate: "2026-04-21",
    });

    expect(result).toEqual({ ok: false, error: "Linked event must belong to this church." });
  });

  it("returns conflict when volunteer already assigned on same date", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Burnout query
      .mockResolvedValueOnce({ rows: [{ event_id: "event-1" }] }) // Event query
      .mockResolvedValueOnce({ rows: [{ id: "existing-shift" }] }); // Conflict query

    const result = await assignVolunteerAction({
      planId: "plan-1",
      positionId: "position-1",
      profileId: "member-2",
      roleName: "Usher",
      startsAt: "2026-04-21T09:00:00.000Z",
      endsAt: "2026-04-21T10:30:00.000Z",
    });

    expect(result).toEqual({
      ok: false,
      error: "This volunteer is already assigned on this service date.",
    });
  });

  it("writes linked event id when assigning a volunteer", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Burnout query
      .mockResolvedValueOnce({ rows: [{ event_id: "event-9" }] }) // Event query
      .mockResolvedValueOnce({ rows: [] }) // Conflict query
      .mockResolvedValueOnce({ rows: [] }); // Insert query

    const result = await assignVolunteerAction({
      planId: "plan-1",
      positionId: "position-1",
      profileId: "member-2",
      roleName: "Usher",
      startsAt: "2026-04-21T09:00:00.000Z",
      endsAt: "2026-04-21T10:30:00.000Z",
    });

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.volunteer_shifts"),
      [
        "church-1",
        "event-9",
        "plan-1",
        "position-1",
        "member-2",
        "Usher",
        "2026-04-21T09:00:00.000Z",
        "2026-04-21T10:30:00.000Z",
      ],
    );
  });

  it("updates member response for assigned shift", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await respondToShiftAction("shift-1", "confirmed");

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.volunteer_shifts"),
      ["shift-1", "member-1", "confirmed", null, "church-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/schedule");
  });

  it("logs reminder audit records for pending assignments", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [{
          assigned_user_id: "member-2",
          confirmation_status: "pending",
          confirmation_token: "mock-token-123",
          confirmation_token_expires_at: new Date(
            Date.now() + 14 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }],
      })
      .mockResolvedValueOnce({ rows: [{ sent_at: "2026-05-01T15:00:00.000Z" }] });

    const result = await sendVolunteerReminderAction({
      planId: "plan-1",
      shiftId: "shift-1",
      channel: "email",
      note: "Please confirm by Thursday.",
    });

    expect(result).toEqual({ ok: true, sentAt: "2026-05-01T15:00:00.000Z" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("from public.volunteer_shifts"),
      ["shift-1", "church-1", "plan-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.volunteer_shift_reminders"),
      [
        "church-1",
        "shift-1",
        "member-2",
        "email",
        "Please confirm by Thursday.\n\nConfirm here: http://localhost:3000/portal/volunteer/confirm/mock-token-123",
        "admin-1",
      ],
    );
  });

  it("rejects reminder when shift is no longer pending", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [{ assigned_user_id: "member-2", confirmation_status: "confirmed" }],
    });

    const result = await sendVolunteerReminderAction({
      planId: "plan-1",
      shiftId: "shift-1",
    });

    expect(result).toEqual({
      ok: false,
      error: "Only pending volunteer responses can be reminded.",
    });
  });

  it("returns supabase insert errors for template save", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseInsertMock.mockResolvedValueOnce({ error: { message: "insert failed" } });

    const result = await saveServicePlanTemplateAction({
      name: "Sunday Core Team",
      positions: [{ roleName: "Greeter", quantity: 2 }],
    });

    expect(result).toEqual({ ok: false, error: "insert failed" });
    expect(createTenantServerClientMock).toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("service_plan_templates");
  });

  it("updates service plan details in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await updateServicePlanDetailsAction({
      planId: "plan-1",
      name: "Sunday Worship",
      eventId: "event-1",
      serviceType: "worship",
      serviceDate: "2026-04-21",
      serviceTime: "09:00",
      scriptureReference: "Romans 12:1-2",
      sermonTitle: "Living Sacrifice",
      sermonSpeaker: "Pastor Nate",
      notes: "Focus on volunteer prayer team before service.",
    });

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.service_plans"),
      [
        "plan-1",
        "church-1",
        "event-1",
        "Sunday Worship",
        "worship",
        "2026-04-21",
        "09:00",
        "Romans 12:1-2",
        "Living Sacrifice",
        "Pastor Nate",
        "Focus on volunteer prayer team before service.",
      ],
    );
  });

  it("rejects service plan detail updates when linked event is out of scope", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await updateServicePlanDetailsAction({
      planId: "plan-1",
      name: "Sunday Worship",
      eventId: "event-2",
      serviceType: "worship",
      serviceDate: "2026-04-21",
    });

    expect(result).toEqual({ ok: false, error: "Linked event must belong to this church." });
  });

  it("adds a run-of-service item in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });

    const result = await addRunOfServiceItemAction({
      planId: "plan-1",
      title: "Welcome and prayer",
      itemType: "prayer",
      startsAt: "2026-04-21T09:00:00.000Z",
      endsAt: "2026-04-21T09:05:00.000Z",
      leaderName: "Deacon Sarah",
      notes: "Invite congregation to stand.",
      sortOrder: 0,
    });

    expect(result).toEqual({ ok: true, id: "item-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.service_plan_items"),
      [
        "plan-1",
        "church-1",
        "2026-04-21T09:00:00.000Z",
        "2026-04-21T09:05:00.000Z",
        "Welcome and prayer",
        "prayer",
        "Deacon Sarah",
        "Invite congregation to stand.",
        null,
        0,
        null,
        null,
        null,
      ],
    );
  });

  it("persists song fields when item type is song", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ next_sort: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-2" }] });

    const result = await addRunOfServiceItemAction({
      planId: "plan-1",
      title: "How Great Is Our God",
      itemType: "song",
      songKey: "G",
      durationSeconds: 195,
      artist: "Hillsong",
    });

    expect(result).toEqual({ ok: true, id: "item-2" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.service_plan_items"),
      [
        "plan-1",
        "church-1",
        null,
        null,
        "How Great Is Our God",
        "song",
        null,
        null,
        null,
        4,
        "G",
        195,
        "Hillsong",
      ],
    );
  });

  it("computes sort_order as MAX + 1 from DB", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ next_sort: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-3" }] });

    await addRunOfServiceItemAction({ planId: "plan-1", title: "Offering" });

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(MAX(sort_order), -1) + 1"),
      ["plan-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.service_plan_items"),
      expect.arrayContaining([4]),
    );
  });

  it("defaults sort_order to 0 when table is empty (COALESCE returns 0)", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-4" }] });

    await addRunOfServiceItemAction({ planId: "plan-1", title: "Opening" });

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.service_plan_items"),
      expect.arrayContaining([0]),
    );
  });

  it("passes null song fields for non-song item types", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ next_sort: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-5" }] });

    await addRunOfServiceItemAction({
      planId: "plan-1",
      title: "Opening Prayer",
      itemType: "prayer",
      songKey: "G",
    });

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.service_plan_items"),
      [
        "plan-1",
        "church-1",
        null,
        null,
        "Opening Prayer",
        "prayer",
        null,
        null,
        null,
        1,
        null,
        null,
        null,
      ],
    );
  });

  it("rejects addRunOfServiceItemAction for non-admin roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "member-1" },
    });

    await expect(
      addRunOfServiceItemAction({ planId: "plan-1", title: "Song 1" }),
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects addRunOfServiceItemAction when plan belongs to a different church", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await addRunOfServiceItemAction({
      planId: "other-church-plan",
      title: "Song 1",
    });

    expect(result).toEqual({ ok: false, error: "Service plan not found." });
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id FROM public.service_plans"),
      ["other-church-plan", "church-1"],
    );
  });

  describe("reorderServicePlanItemsAction", () => {
    it("reorders items and calls revalidatePath on happy path", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }, { id: "c" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await reorderServicePlanItemsAction({
        planId: "plan-1",
        orderedIds: ["b", "a", "c"],
      });

      expect(result).toEqual({ ok: true });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE public.service_plan_items SET sort_order = $1"),
        [0, "b", "church-1"],
      );
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE public.service_plan_items SET sort_order = $1"),
        [1, "a", "church-1"],
      );
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE public.service_plan_items SET sort_order = $1"),
        [2, "c", "church-1"],
      );
      expect(revalidatePathMock).toHaveBeenCalledWith(
        expect.stringContaining("plan-1"),
      );
    });

    it("rejects reorder for non-admin roles", async () => {
      requireChurchSessionMock.mockResolvedValueOnce({
        appContext: { roleId: "member", church: { id: "church-1" } },
        profile: { id: "member-1" },
      });

      await expect(
        reorderServicePlanItemsAction({ planId: "plan-1", orderedIds: ["a"] }),
      ).rejects.toThrow("Unauthorized");
    });

    it("returns error for cross-church or invalid IDs", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({
          rows: [{ id: "a" }, { id: "b" }],
        });

      const result = await reorderServicePlanItemsAction({
        planId: "plan-1",
        orderedIds: ["a", "b", "c"],
      });

      expect(result).toEqual({ ok: false, error: "Invalid item IDs for this plan." });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(2);
    });

    it("returns error for empty orderedIds without DB calls", async () => {
      const result = await reorderServicePlanItemsAction({
        planId: "plan-1",
        orderedIds: [],
      });

      expect(result).toEqual({ ok: false, error: "orderedIds must be a non-empty array." });
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });
  });

  // ── Role gate widened to pastor/ministry-leader (regression) ──
  // requireServicePlanWriteAccess() replaced the old church-admin-only
  // requireAdminSession() across every write action in this file (Service
  // Planning Story 1's auth fix). These pin the new intended behavior on
  // representative pre-existing actions whose effective role gate widened
  // as a side effect, so a future refactor can't silently narrow it back.
  describe("pre-existing actions accept pastor and ministry-leader (not just church-admin)", () => {
    function sessionFor(roleId: string) {
      return {
        appContext: { roleId, church: { id: "church-1" } },
        profile: { id: "actor-1" },
      };
    }

    it("createServicePlanAction", async () => {
      for (const roleId of ["pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "plan-1" }] });

        const result = await createServicePlanAction({
          name: "Sunday Morning",
          serviceDate: "2026-04-21",
        });
        expect(result).toEqual({ ok: true, id: "plan-1" });
      }
    });

    it("addRunOfServiceItemAction", async () => {
      for (const roleId of ["pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
          .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
          .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });

        const result = await addRunOfServiceItemAction({ planId: "plan-1", title: "Offering" });
        expect(result).toEqual({ ok: true, id: "item-1" });
      }
    });

    it("updateServicePlanDetailsAction", async () => {
      for (const roleId of ["pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

        const result = await updateServicePlanDetailsAction({
          planId: "plan-1",
          name: "Sunday Worship",
          serviceType: "worship",
          serviceDate: "2026-04-21",
        });
        expect(result).toEqual({ ok: true });
      }
    });

    it("assignVolunteerAction", async () => {
      for (const roleId of ["pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({ rows: [{ count: 0 }] })
          .mockResolvedValueOnce({ rows: [{ event_id: "event-9" }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await assignVolunteerAction({
          planId: "plan-1",
          positionId: "position-1",
          profileId: "member-2",
          roleName: "Usher",
          startsAt: "2026-04-21T09:00:00.000Z",
          endsAt: "2026-04-21T10:30:00.000Z",
        });
        expect(result).toEqual({ ok: true });
      }
    });

    it("sendVolunteerReminderAction", async () => {
      for (const roleId of ["pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({
            rows: [{
              assigned_user_id: "member-2",
              confirmation_status: "pending",
              confirmation_token: "mock-token-123",
              confirmation_token_expires_at: new Date(
                Date.now() + 14 * 24 * 60 * 60 * 1000,
              ).toISOString(),
            }],
          })
          .mockResolvedValueOnce({ rows: [{ sent_at: "2026-05-01T15:00:00.000Z" }] });

        const result = await sendVolunteerReminderAction({ planId: "plan-1", shiftId: "shift-1" });
        expect(result).toEqual({ ok: true, sentAt: "2026-05-01T15:00:00.000Z" });
      }
    });

    it("saveServicePlanTemplateAction (Supabase path)", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      for (const roleId of ["pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        supabaseInsertMock.mockResolvedValueOnce({ error: null });

        const result = await saveServicePlanTemplateAction({
          name: "Sunday Core Team",
          positions: [{ roleName: "Greeter", quantity: 2 }],
        });
        expect(result).toEqual({ ok: true });
      }
    });

    it("member/volunteer are still rejected on every action above", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          createServicePlanAction({ name: "x", serviceDate: "2026-04-21" }),
        ).rejects.toThrow("Unauthorized");

        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          addRunOfServiceItemAction({ planId: "plan-1", title: "x" }),
        ).rejects.toThrow("Unauthorized");

        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          updateServicePlanDetailsAction({
            planId: "plan-1",
            name: "x",
            serviceType: "worship",
            serviceDate: "2026-04-21",
          }),
        ).rejects.toThrow("Unauthorized");

        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          assignVolunteerAction({
            planId: "plan-1",
            positionId: "position-1",
            profileId: "member-2",
            roleName: "Usher",
            startsAt: "2026-04-21T09:00:00.000Z",
            endsAt: "2026-04-21T10:30:00.000Z",
          }),
        ).rejects.toThrow("Unauthorized");

        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          sendVolunteerReminderAction({ planId: "plan-1", shiftId: "shift-1" }),
        ).rejects.toThrow("Unauthorized");

        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          saveServicePlanTemplateAction({ name: "x", positions: [] }),
        ).rejects.toThrow("Unauthorized");
      }
    });
  });

  describe("Public Sessional Confirmations", () => {
    beforeEach(() => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
      vi.clearAllMocks();
    });

    it("getPublicVolunteerShiftByToken returns null if token is empty", async () => {
      const result = await getPublicVolunteerShiftByToken("");
      expect(result).toBeNull();
    });

    it("getPublicVolunteerShiftByToken returns shift if valid and unexpired", async () => {
      const mockShift = {
        id: "shift-123",
        title: "Worship Leader",
        confirmation_status: "pending",
        confirmation_token_expires_at: new Date(Date.now() + 100000).toISOString(),
        church_id: "church-1",
        assigned_user_id: "user-456",
      };

      supabaseBuilderMock.maybeSingle.mockResolvedValueOnce({ data: mockShift, error: null });

      const result = await getPublicVolunteerShiftByToken("valid-token");
      expect(result).toEqual(mockShift);
      expect(createTenantAdminClientMock).toHaveBeenCalled();
    });

    it("getPublicVolunteerShiftByToken returns null if expired", async () => {
      const mockShift = {
        id: "shift-123",
        title: "Worship Leader",
        confirmation_status: "pending",
        confirmation_token_expires_at: new Date(Date.now() - 100000).toISOString(),
        church_id: "church-1",
        assigned_user_id: "user-456",
      };

      supabaseBuilderMock.maybeSingle.mockResolvedValueOnce({ data: mockShift, error: null });

      const result = await getPublicVolunteerShiftByToken("expired-token");
      expect(result).toBeNull();
    });

    it("getPublicVolunteerScheduleByToken returns empty if invalid token", async () => {
      supabaseBuilderMock.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await getPublicVolunteerScheduleByToken("invalid-token");
      expect(result).toEqual([]);
    });

    it("getPublicVolunteerScheduleByToken returns shifts on success", async () => {
      const mockShift = {
        id: "shift-123",
        title: "Worship Leader",
        confirmation_status: "pending",
        confirmation_token_expires_at: new Date(Date.now() + 100000).toISOString(),
        church_id: "church-1",
        assigned_user_id: "user-456",
      };

      const mockSchedule = [
        { id: "shift-123", title: "Worship Leader", starts_at: "2026-07-21" },
        { id: "shift-789", title: "Guitarist", starts_at: "2026-07-28" },
      ];

      supabaseBuilderMock.maybeSingle.mockResolvedValueOnce({ data: mockShift, error: null });
      supabaseBuilderMock.order.mockResolvedValueOnce({ data: mockSchedule, error: null });

      const result = await getPublicVolunteerScheduleByToken("valid-token");
      expect(result).toEqual(mockSchedule);
    });

    it("respondToPublicShiftAction validates token and updates shift status", async () => {
      const mockShift = {
        id: "shift-123",
        title: "Worship Leader",
        confirmation_status: "pending",
        confirmation_token_expires_at: new Date(Date.now() + 100000).toISOString(),
        church_id: "church-1",
        assigned_user_id: "user-456",
      };

      supabaseBuilderMock.maybeSingle.mockResolvedValueOnce({ data: mockShift, error: null });
      supabaseBuilderMock.eq.mockReturnValueOnce(supabaseBuilderMock);
      supabaseBuilderMock.maybeSingle.mockResolvedValueOnce({ error: null }); // For update call

      const result = await respondToPublicShiftAction("valid-token", "confirmed");
      expect(result).toEqual({ ok: true });
      expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
        tableName: "volunteer_shifts",
        recordId: "shift-123",
        operation: "UPDATE",
        actorRole: "anonymous_volunteer",
      }));
    });
  });
});
