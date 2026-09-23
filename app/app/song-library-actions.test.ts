import { beforeEach, describe, expect, it, vi } from "vitest";

// This is a sibling test file (not appended to volunteer-actions.test.ts,
// which was already 701 lines before this story) for the Song Library &
// Setlist Builder story's new server actions, plus the two behavior changes
// to existing actions in app/app/volunteer-actions.ts that this story
// requires (reorderServicePlanItemsAction's cancelled-plan guard and
// updateServicePlanStatusAction's last_used_date propagation).

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  logAuditEventMock,
} = vi.hoisted(() => {
  return {
    revalidatePathMock: vi.fn(),
    requireChurchSessionMock: vi.fn(),
    createTenantServerClientMock: vi.fn(),
    queryTenantLocalDbMock: vi.fn(),
    shouldUseLocalTenantFallbackMock: vi.fn(),
    logAuditEventMock: vi.fn(),
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
  createTenantAdminClient: vi.fn(),
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

vi.mock("@/lib/actions/audit", () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock("@/lib/burnout-calculator", () => ({
  checkVolunteerBurnout: vi.fn(async () => ({ isBurnedOut: false })),
}));

import {
  addSongToServicePlanAction,
  createSongAndAddToServicePlanAction,
  removeServicePlanItemAction,
  reorderServicePlanItemsAction,
  searchSongLibraryAction,
  updateServicePlanStatusAction,
} from "@/app/app/volunteer-actions";

// ── Supabase query-builder mock helper ───────────────────────
// supabase-js's PostgrestFilterBuilder is thenable: some call sites in this
// codebase await a chain directly without a terminal .single()/.maybeSingle()
// (e.g. reorderServicePlanItemsAction's existing Supabase branch), while
// others do. This builder supports both by resolving through `.then()` as
// well as `.single()`/`.maybeSingle()`, popping the next queued result for
// this table in call order — mirroring how queryTenantLocalDbMock's
// mockResolvedValueOnce chain works for the local-fallback path.
type QueuedResult = { data: unknown; error: unknown };

function makeTableBuilder(queue: QueuedResult[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const methods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "ilike",
    "or",
    "in",
    "not",
    "order",
    "limit",
  ];
  for (const method of methods) {
    builder[method] = vi.fn(chain);
  }
  const resolveNext = (): QueuedResult =>
    queue.length > 0 ? queue.shift()! : { data: null, error: null };
  builder.single = vi.fn(() => Promise.resolve(resolveNext()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolveNext()));
  builder.then = (resolve: (v: QueuedResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(resolveNext()).then(resolve, reject);
  return builder;
}

function makeSupabaseClient(tableQueues: Record<string, QueuedResult[]>) {
  const builders: Record<string, ReturnType<typeof makeTableBuilder>> = {};
  for (const [table, queue] of Object.entries(tableQueues)) {
    builders[table] = makeTableBuilder(queue);
  }
  const from = vi.fn((table: string) => {
    if (!builders[table]) {
      builders[table] = makeTableBuilder([]);
    }
    return builders[table];
  });
  return { client: { from }, builders };
}

function mockSupabasePath(tableQueues: Record<string, QueuedResult[]>) {
  shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  const { client, builders } = makeSupabaseClient(tableQueues);
  createTenantServerClientMock.mockImplementation(async () => client);
  return builders;
}

function sessionFor(roleId: string) {
  return {
    appContext: { roleId, church: { id: "church-1" } },
    profile: { id: "actor-1" },
  };
}

describe("song library actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockImplementation(async () => sessionFor("church-admin"));
  });

  // ── searchSongLibraryAction ─────────────────────────────────

  describe("searchSongLibraryAction", () => {
    it("returns empty results for an empty query without hitting the DB", async () => {
      const result = await searchSongLibraryAction({ query: "   " });
      expect(result).toEqual({ ok: true, results: [] });
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });

    it("matches by title (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [
          {
            id: "song-1",
            title: "How Great Is Our God",
            artist: "Chris Tomlin",
            default_key: "G",
            default_duration_seconds: 240,
            last_used_date: "2026-01-01",
          },
        ],
      });

      const result = await searchSongLibraryAction({ query: "great" });

      expect(result).toEqual({
        ok: true,
        results: [
          {
            id: "song-1",
            title: "How Great Is Our God",
            artist: "Chris Tomlin",
            defaultKey: "G",
            defaultDurationSeconds: 240,
            lastUsedDate: "2026-01-01",
          },
        ],
      });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("ilike"),
        ["church-1", "%great%"],
      );
    });

    it("matches by artist, case-insensitively (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [
          {
            id: "song-2",
            title: "Amazing Grace",
            artist: "Chris Tomlin",
            default_key: null,
            default_duration_seconds: null,
            last_used_date: null,
          },
        ],
      });

      const result = await searchSongLibraryAction({ query: "TOMLIN" });

      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].artist).toBe("Chris Tomlin");
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.any(String),
        ["church-1", "%TOMLIN%"],
      );
    });

    it("scopes search to the caller's church (tenant isolation)", async () => {
      // Church B's song never appears for a church A caller because the
      // query is scoped by church_id — simulate the DB honoring that scope
      // by returning no rows even though a title match would exist elsewhere.
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      const result = await searchSongLibraryAction({ query: "great" });

      expect(result).toEqual({ ok: true, results: [] });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.any(String),
        ["church-1", "%great%"],
      );
    });

    it("is available to read-only roles (member, volunteer)", async () => {
      requireChurchSessionMock.mockResolvedValueOnce(sessionFor("member"));
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      const result = await searchSongLibraryAction({ query: "grace" });
      expect(result.ok).toBe(true);

      requireChurchSessionMock.mockResolvedValueOnce(sessionFor("volunteer"));
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });
      const result2 = await searchSongLibraryAction({ query: "grace" });
      expect(result2.ok).toBe(true);
    });

    it("matches by title or artist (Supabase path)", async () => {
      const builders = mockSupabasePath({
        song_library: [
          {
            data: [
              {
                id: "song-9",
                title: "10,000 Reasons",
                artist: "Matt Redman",
                default_key: "A",
                default_duration_seconds: 260,
                last_used_date: null,
              },
            ],
            error: null,
          },
        ],
      });

      const result = await searchSongLibraryAction({ query: "reasons" });

      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(builders.song_library.eq).toHaveBeenCalledWith("church_id", "church-1");
    });
  });

  // ── addSongToServicePlanAction ──────────────────────────────

  describe("addSongToServicePlanAction", () => {
    it("adds a song with a snapshot copy of library fields (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] }) // plan
        .mockResolvedValueOnce({
          rows: [
            {
              id: "song-1",
              title: "How Great Is Our God",
              artist: "Chris Tomlin",
              default_key: "G",
              default_duration_seconds: 240,
              last_used_date: null,
            },
          ],
        }) // song
        .mockResolvedValueOnce({ rows: [{ next_sort: 2 }] }) // sort
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] }) // insert
        .mockResolvedValueOnce({ rows: [{ song_repeat_window_weeks: 12 }] }); // window

      const result = await addSongToServicePlanAction({
        planId: "plan-1",
        songLibraryId: "song-1",
      });

      expect(result).toEqual({ ok: true, id: "item-1", warning: undefined });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into public.service_plan_items"),
        [
          "plan-1",
          "church-1",
          "How Great Is Our God",
          2,
          "song-1",
          "G",
          240,
          "Chris Tomlin",
        ],
      );
      expect(revalidatePathMock).toHaveBeenCalledWith(
        expect.stringContaining("plan-1"),
      );
    });

    it("fires a repeat warning within the repeat window without blocking the insert", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "song-1",
              title: "How Great Is Our God",
              artist: null,
              default_key: null,
              default_duration_seconds: null,
              last_used_date: "2026-02-24", // 8 weeks before service_date
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-2" }] })
        .mockResolvedValueOnce({ rows: [{ song_repeat_window_weeks: 12 }] });

      const result = await addSongToServicePlanAction({
        planId: "plan-1",
        songLibraryId: "song-1",
      });

      expect(result.ok).toBe(true);
      expect(result.id).toBe("item-2");
      expect(result.warning).toBe("Last used 2026-02-24 — 8 weeks ago");
    });

    it("does not fire a repeat warning outside the repeat window, and still does not block the insert", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "song-1",
              title: "How Great Is Our God",
              artist: null,
              default_key: null,
              default_duration_seconds: null,
              last_used_date: "2025-12-02", // 20 weeks before service_date
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-3" }] })
        .mockResolvedValueOnce({ rows: [{ song_repeat_window_weeks: 12 }] });

      const result = await addSongToServicePlanAction({
        planId: "plan-1",
        songLibraryId: "song-1",
      });

      expect(result).toEqual({ ok: true, id: "item-3", warning: undefined });
    });

    it("fires a repeat warning exactly at the repeat window boundary (inclusive)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "song-1",
              title: "How Great Is Our God",
              artist: null,
              default_key: null,
              default_duration_seconds: null,
              last_used_date: "2026-01-27", // exactly 12 weeks (84 days) before service_date
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-boundary" }] })
        .mockResolvedValueOnce({ rows: [{ song_repeat_window_weeks: 12 }] });

      const result = await addSongToServicePlanAction({
        planId: "plan-1",
        songLibraryId: "song-1",
      });

      expect(result.ok).toBe(true);
      expect(result.warning).toBe("Last used 2026-01-27 — 12 weeks ago");
    });

    it("fails to add a song to a cancelled plan", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [{ id: "plan-1", status: "cancelled", service_date: "2026-04-21" }],
      });

      const result = await addSongToServicePlanAction({
        planId: "plan-1",
        songLibraryId: "song-1",
      });

      expect(result).toEqual({
        ok: false,
        error: "Cannot add songs to a cancelled service plan.",
      });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    });

    it("fails when the songLibraryId belongs to a different church", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [] }); // song lookup scoped to caller's church finds nothing

      const result = await addSongToServicePlanAction({
        planId: "plan-1",
        songLibraryId: "other-church-song",
      });

      expect(result).toEqual({
        ok: false,
        error: "Song not found in this church's library.",
      });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(2);
    });

    it("allows adding the same song twice to one plan (two item rows, library unchanged)", async () => {
      const songRow = {
        id: "song-1",
        title: "How Great Is Our God",
        artist: null,
        default_key: null,
        default_duration_seconds: null,
        last_used_date: null,
      };

      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [songRow] })
        .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-a" }] })
        .mockResolvedValueOnce({ rows: [{ song_repeat_window_weeks: 12 }] })
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [songRow] })
        .mockResolvedValueOnce({ rows: [{ next_sort: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-b" }] })
        .mockResolvedValueOnce({ rows: [{ song_repeat_window_weeks: 12 }] });

      const first = await addSongToServicePlanAction({ planId: "plan-1", songLibraryId: "song-1" });
      const second = await addSongToServicePlanAction({ planId: "plan-1", songLibraryId: "song-1" });

      expect(first.ok).toBe(true);
      expect(first.id).toBe("item-a");
      expect(second.ok).toBe(true);
      expect(second.id).toBe("item-b");
      expect(first.id).not.toBe(second.id);
      // The library row itself is never written by addSongToServicePlanAction.
      expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
        expect.stringContaining("update public.song_library"),
        expect.anything(),
      );
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          addSongToServicePlanAction({ planId: "plan-1", songLibraryId: "song-1" }),
        ).rejects.toThrow("Unauthorized");
      }
    });

    it("grants write access to church-admin, pastor, and ministry-leader", async () => {
      for (const roleId of ["church-admin", "pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: "song-1",
                title: "Song",
                artist: null,
                default_key: null,
                default_duration_seconds: null,
                last_used_date: null,
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
          .mockResolvedValueOnce({ rows: [{ id: "item-1" }] })
          .mockResolvedValueOnce({ rows: [{ song_repeat_window_weeks: 12 }] });

        const result = await addSongToServicePlanAction({ planId: "plan-1", songLibraryId: "song-1" });
        expect(result.ok).toBe(true);
      }
    });

    it("adds a song with a snapshot copy and reports the repeat warning (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: { id: "plan-1", status: "draft", service_date: "2026-04-21" }, error: null }],
        song_library: [
          {
            data: {
              id: "song-1",
              title: "How Great Is Our God",
              artist: "Chris Tomlin",
              default_key: "G",
              default_duration_seconds: 240,
              last_used_date: "2026-02-24",
            },
            error: null,
          },
        ],
        service_plan_items: [
          { data: null, error: { message: "no rows" } }, // sort lookup, empty table
          { data: { id: "item-1" }, error: null }, // insert
        ],
        churches: [{ data: { song_repeat_window_weeks: 12 }, error: null }],
      });

      const result = await addSongToServicePlanAction({ planId: "plan-1", songLibraryId: "song-1" });

      expect(result.ok).toBe(true);
      expect(result.id).toBe("item-1");
      expect(result.warning).toBe("Last used 2026-02-24 — 8 weeks ago");
      expect(builders.service_plan_items.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_id: "plan-1",
          church_id: "church-1",
          item_type: "song",
          song_library_id: "song-1",
          song_key: "G",
          duration_seconds: 240,
          artist: "Chris Tomlin",
        }),
      );
    });
  });

  // ── createSongAndAddToServicePlanAction ─────────────────────

  describe("createSongAndAddToServicePlanAction", () => {
    it("requires a non-blank title before touching the DB", async () => {
      const result = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "   ",
        idempotencyKey: "key-1",
      });

      expect(result).toEqual({ ok: false, error: "Song title is required." });
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });

    it("creates both the library row and the linked item row (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] }) // plan
        .mockResolvedValueOnce({ rows: [{ id: "song-new" }] }) // insert on conflict do nothing -> created
        .mockResolvedValueOnce({
          rows: [
            {
              id: "song-new",
              title: "Great Are You Lord",
              artist: "All Sons & Daughters",
              default_key: "D",
              default_duration_seconds: 220,
              last_used_date: null,
            },
          ],
        }) // select by idempotency key
        .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] }) // sort
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] }); // item insert

      const result = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "Great Are You Lord",
        artist: "All Sons & Daughters",
        defaultKey: "D",
        defaultDurationSeconds: 220,
        idempotencyKey: "key-abc",
      });

      expect(result).toEqual({ ok: true, songLibraryId: "song-new", itemId: "item-1" });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "on conflict (church_id, idempotency_key) where idempotency_key is not null do nothing",
        ),
        ["church-1", "Great Are You Lord", "All Sons & Daughters", "D", 220, "key-abc", "actor-1"],
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "song_library",
          recordId: "song-new",
          operation: "INSERT",
        }),
      );
    });

    it("does not create a duplicate song_library row on retry with the same idempotencyKey", async () => {
      const songRow = {
        id: "song-new",
        title: "Great Are You Lord",
        artist: null,
        default_key: null,
        default_duration_seconds: null,
        last_used_date: null,
      };

      // First call: insert succeeds (created).
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [{ id: "song-new" }] })
        .mockResolvedValueOnce({ rows: [songRow] })
        .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });

      const first = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "Great Are You Lord",
        idempotencyKey: "key-retry",
      });

      // Retry: on-conflict-do-nothing returns no row (already exists); the
      // follow-up select resolves the same pre-existing row.
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [songRow] })
        .mockResolvedValueOnce({ rows: [{ next_sort: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-2" }] });

      const second = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "Great Are You Lord",
        idempotencyKey: "key-retry",
      });

      expect(first.songLibraryId).toBe("song-new");
      expect(second.songLibraryId).toBe("song-new");
      expect(second.itemId).not.toBe(first.itemId);
      // Only the first (actually-created) call should be audit-logged.
      expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    });

    it("leaves no phantom item row when the linked item insert fails", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [{ id: "song-new" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "song-new",
              title: "Great Are You Lord",
              artist: null,
              default_key: null,
              default_duration_seconds: null,
              last_used_date: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ next_sort: 0 }] })
        .mockResolvedValueOnce({ rows: [] }); // item insert fails to return an id

      const result = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "Great Are You Lord",
        idempotencyKey: "key-fail",
      });

      expect(result).toEqual({
        ok: false,
        error: "Failed to add song to service plan.",
      });
      expect(result.itemId).toBeUndefined();
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          createSongAndAddToServicePlanAction({
            planId: "plan-1",
            title: "Song",
            idempotencyKey: "key-1",
          }),
        ).rejects.toThrow("Unauthorized");
      }
    });

    it("creates both rows via a plain insert, not upsert (Supabase path)", async () => {
      // Regression guard: PostgREST's upsert-via-on_conflict cannot target the
      // partial unique index on (church_id, idempotency_key). This exercises
      // the plain-insert-then-select fallback that replaced it.
      const builders = mockSupabasePath({
        service_plans: [{ data: { id: "plan-1", status: "draft", service_date: "2026-04-21" }, error: null }],
        song_library: [
          { data: { id: "song-new" }, error: null }, // plain insert succeeds
          {
            data: {
              id: "song-new",
              title: "Great Are You Lord",
              artist: null,
              default_key: null,
              default_duration_seconds: null,
              last_used_date: null,
            },
            error: null,
          }, // select by idempotency_key
        ],
        service_plan_items: [
          { data: null, error: { message: "no rows" } }, // sort lookup, empty table
          { data: { id: "item-1" }, error: null }, // item insert
        ],
      });

      const result = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "Great Are You Lord",
        idempotencyKey: "key-supabase-1",
      });

      expect(result).toEqual({ ok: true, songLibraryId: "song-new", itemId: "item-1" });
      expect(builders.song_library.insert).toHaveBeenCalled();
      expect(builders.song_library.upsert).not.toHaveBeenCalled();
      expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    });

    it("does not create a duplicate row on retry — a 23505 unique violation is treated as already-created (Supabase path)", async () => {
      const existingSong = {
        id: "song-existing",
        title: "Great Are You Lord",
        artist: null,
        default_key: null,
        default_duration_seconds: null,
        last_used_date: null,
      };

      const builders = mockSupabasePath({
        service_plans: [{ data: { id: "plan-1", status: "draft", service_date: "2026-04-21" }, error: null }],
        song_library: [
          {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          }, // retried insert conflicts
          { data: existingSong, error: null }, // select-by-idempotency resolves the original row
        ],
        service_plan_items: [
          { data: null, error: { message: "no rows" } },
          { data: { id: "item-2" }, error: null },
        ],
      });

      const result = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "Great Are You Lord",
        idempotencyKey: "key-supabase-retry",
      });

      expect(result).toEqual({ ok: true, songLibraryId: "song-existing", itemId: "item-2" });
      expect(builders.song_library.insert).toHaveBeenCalled();
      // Not a newly-created row — no audit event for the retry.
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it("propagates a genuine (non-23505) insert error instead of masking it as a retry", async () => {
      mockSupabasePath({
        service_plans: [{ data: { id: "plan-1", status: "draft", service_date: "2026-04-21" }, error: null }],
        song_library: [
          { data: null, error: { code: "42501", message: "permission denied" } },
        ],
      });

      const result = await createSongAndAddToServicePlanAction({
        planId: "plan-1",
        title: "Great Are You Lord",
        idempotencyKey: "key-supabase-error",
      });

      expect(result).toEqual({ ok: false, error: "permission denied" });
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });
  });

  // ── reorderServicePlanItemsAction: cancelled-plan guard ─────

  describe("reorderServicePlanItemsAction cancelled-plan guard", () => {
    it("blocks reorder on a cancelled plan", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [{ id: "plan-1", status: "cancelled", service_date: "2026-04-21" }],
      });

      const result = await reorderServicePlanItemsAction({
        planId: "plan-1",
        orderedIds: ["a", "b"],
      });

      expect(result).toEqual({
        ok: false,
        error: "Cannot reorder items on a cancelled service plan.",
      });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    });

    it("grants write access to church-admin, pastor, and ministry-leader (this action's own role gate, not just the shared helper's)", async () => {
      for (const roleId of ["church-admin", "pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
          .mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await reorderServicePlanItemsAction({
          planId: "plan-1",
          orderedIds: ["b", "a"],
        });
        expect(result).toEqual({ ok: true });
      }
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          reorderServicePlanItemsAction({ planId: "plan-1", orderedIds: ["a", "b"] }),
        ).rejects.toThrow("Unauthorized");
      }
    });
  });

  // ── removeServicePlanItemAction ──────────────────────────────
  // Deletes only the service_plan_items row. The linked song_library row
  // must never be touched — it's a reusable church-wide catalog entry.

  describe("removeServicePlanItemAction", () => {
    it("deletes the plan item and does not touch song_library (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });

      const result = await removeServicePlanItemAction({ planId: "plan-1", itemId: "item-1" });

      expect(result).toEqual({ ok: true });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(2);
      const deleteCall = queryTenantLocalDbMock.mock.calls[1];
      expect(deleteCall[0]).toContain("DELETE FROM public.service_plan_items");
      expect(deleteCall[0]).not.toContain("song_library");
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/volunteers/schedules/plan-1");
    });

    it("deletes the plan item and does not touch song_library (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: { id: "plan-1", status: "draft", service_date: "2026-04-21" }, error: null }],
        service_plan_items: [{ data: { id: "item-1" }, error: null }],
      });

      const result = await removeServicePlanItemAction({ planId: "plan-1", itemId: "item-1" });

      expect(result).toEqual({ ok: true });
      expect(builders.service_plan_items.delete).toHaveBeenCalled();
      expect(builders.song_library).toBeUndefined();
    });

    it("blocks removal on a cancelled plan", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [{ id: "plan-1", status: "cancelled", service_date: "2026-04-21" }],
      });

      const result = await removeServicePlanItemAction({ planId: "plan-1", itemId: "item-1" });

      expect(result).toEqual({
        ok: false,
        error: "Cannot remove items on a cancelled service plan.",
      });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    });

    it("returns an error when the item does not exist for this plan/church", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await removeServicePlanItemAction({ planId: "plan-1", itemId: "missing-item" });

      expect(result).toEqual({ ok: false, error: "Run-of-service item not found." });
    });

    it("returns an error when the plan does not exist for this church", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      const result = await removeServicePlanItemAction({ planId: "missing-plan", itemId: "item-1" });

      expect(result).toEqual({ ok: false, error: "Service plan not found." });
    });

    it("grants write access to church-admin, pastor, and ministry-leader", async () => {
      for (const roleId of ["church-admin", "pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({ rows: [{ id: "plan-1", status: "draft", service_date: "2026-04-21" }] })
          .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });

        const result = await removeServicePlanItemAction({ planId: "plan-1", itemId: "item-1" });
        expect(result).toEqual({ ok: true });
      }
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          removeServicePlanItemAction({ planId: "plan-1", itemId: "item-1" }),
        ).rejects.toThrow("Unauthorized");
      }
    });
  });

  // ── updateServicePlanStatusAction: last_used_date propagation ─

  describe("updateServicePlanStatusAction completing a plan", () => {
    it("updates last_used_date on all linked library rows to the plan's service_date (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", service_date: "2026-04-21" }] }) // status update
        .mockResolvedValueOnce({ rows: [] }); // library last_used_date update

      const result = await updateServicePlanStatusAction("plan-1", "complete");

      expect(result).toEqual({ ok: true });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.song_library"),
        ["plan-1", "church-1", "2026-04-21"],
      );
    });

    it("completes a plan with no song items without error (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ id: "plan-1", service_date: "2026-04-21" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await updateServicePlanStatusAction("plan-1", "complete");
      expect(result).toEqual({ ok: true });
    });

    it("does not touch song_library for non-complete status transitions (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "plan-1", service_date: "2026-04-21" }] });

      const result = await updateServicePlanStatusAction("plan-1", "published");

      expect(result).toEqual({ ok: true });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    });

    it("updates last_used_date on all linked library rows to the plan's service_date (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: { id: "plan-1", service_date: "2026-04-21" }, error: null }],
        service_plan_items: [
          {
            data: [{ song_library_id: "song-1" }, { song_library_id: "song-2" }, { song_library_id: "song-1" }],
            error: null,
          },
        ],
        song_library: [{ data: null, error: null }],
      });

      const result = await updateServicePlanStatusAction("plan-1", "complete");

      expect(result).toEqual({ ok: true });
      expect(builders.song_library.update).toHaveBeenCalledWith({ last_used_date: "2026-04-21" });
      expect(builders.song_library.in).toHaveBeenCalledWith(
        "id",
        expect.arrayContaining(["song-1", "song-2"]),
      );
      // Three linked items reference only two distinct songs — the update
      // target list must be deduplicated, not one write per item row.
      const inMock = builders.song_library.in as ReturnType<typeof vi.fn>;
      const inCallIds = inMock.mock.calls[0][1] as string[];
      expect(inCallIds).toHaveLength(2);
    });

    it("completes a plan with no song items without error (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: { id: "plan-1", service_date: "2026-04-21" }, error: null }],
        service_plan_items: [{ data: [], error: null }],
      });

      const result = await updateServicePlanStatusAction("plan-1", "complete");

      expect(result).toEqual({ ok: true });
      expect(builders.song_library).toBeUndefined();
    });

    it("grants write access to church-admin, pastor, and ministry-leader (this action's own role gate)", async () => {
      for (const roleId of ["church-admin", "pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({ rows: [{ id: "plan-1", service_date: "2026-04-21" }] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await updateServicePlanStatusAction("plan-1", "complete");
        expect(result).toEqual({ ok: true });
      }
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          updateServicePlanStatusAction("plan-1", "complete"),
        ).rejects.toThrow("Unauthorized");
      }
    });
  });
});
