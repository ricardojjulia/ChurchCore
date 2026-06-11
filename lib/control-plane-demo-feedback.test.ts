import { beforeEach, describe, expect, it, vi } from "vitest";

const { createControlPlaneServerClientMock } = vi.hoisted(() => ({
  createControlPlaneServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/control-plane", () => ({
  createControlPlaneServerClient: createControlPlaneServerClientMock,
}));

import { loadDemoFeedback, type DemoFeedbackRow } from "@/lib/control-plane-demo-feedback";

function makeSupabaseChain(data: unknown[], error: unknown = null) {
  const orderMock = vi.fn().mockResolvedValue({ data, error });
  const selectMock = vi.fn().mockReturnValue({ order: orderMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });
  return { fromMock, selectMock, orderMock };
}

describe("loadDemoFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries the demo_feedback table ordered by created_at desc", async () => {
    const { fromMock, selectMock, orderMock } = makeSupabaseChain([]);
    createControlPlaneServerClientMock.mockResolvedValue({ from: fromMock });

    await loadDemoFeedback();

    expect(fromMock).toHaveBeenCalledWith("demo_feedback");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns typed rows from the query result", async () => {
    const rows: DemoFeedbackRow[] = [
      {
        id: "uuid-1",
        fingerprint: "a".repeat(64),
        session_id: "session-1",
        route: "/demo/dashboard",
        category: "BUG",
        error_message: null,
        note: "Test note",
        breadcrumbs: [],
        user_email: "demo@example.com",
        user_role: "church_admin",
        demo_version: "1.0.0",
        session_duration_seconds: 42,
        hit_count: 3,
        metadata: {},
        created_at: "2026-07-11T00:00:00Z",
        updated_at: "2026-07-11T00:00:00Z",
      },
    ];
    const { fromMock } = makeSupabaseChain(rows);
    createControlPlaneServerClientMock.mockResolvedValue({ from: fromMock });

    const result = await loadDemoFeedback();

    expect(result).toEqual(rows);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("BUG");
    expect(result[0].hit_count).toBe(3);
  });

  it("returns an empty array when data is null", async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const selectMock = vi.fn().mockReturnValue({ order: orderMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    createControlPlaneServerClientMock.mockResolvedValue({ from: fromMock });

    const result = await loadDemoFeedback();

    expect(result).toEqual([]);
  });

  it("returns multiple rows in the order returned by the query", async () => {
    const rows: DemoFeedbackRow[] = [
      {
        id: "uuid-2",
        fingerprint: "b".repeat(64),
        session_id: "session-2",
        route: "/demo/giving",
        category: "IMPROVEMENT",
        error_message: null,
        note: null,
        breadcrumbs: [{ event: "click", target: "#donate-btn" }],
        user_email: null,
        user_role: null,
        demo_version: "1.0.1",
        session_duration_seconds: null,
        hit_count: 1,
        metadata: { browser: "Chrome" },
        created_at: "2026-07-11T01:00:00Z",
        updated_at: "2026-07-11T01:00:00Z",
      },
      {
        id: "uuid-1",
        fingerprint: "a".repeat(64),
        session_id: "session-1",
        route: "/demo/dashboard",
        category: "ERROR",
        error_message: "TypeError: cannot read property",
        note: null,
        breadcrumbs: [],
        user_email: null,
        user_role: null,
        demo_version: "1.0.0",
        session_duration_seconds: 90,
        hit_count: 5,
        metadata: {},
        created_at: "2026-07-11T00:00:00Z",
        updated_at: "2026-07-11T00:30:00Z",
      },
    ];
    const { fromMock } = makeSupabaseChain(rows);
    createControlPlaneServerClientMock.mockResolvedValue({ from: fromMock });

    const result = await loadDemoFeedback();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("uuid-2");
    expect(result[1].id).toBe("uuid-1");
  });

  it("uses the control-plane server client (not tenant)", async () => {
    const { fromMock } = makeSupabaseChain([]);
    createControlPlaneServerClientMock.mockResolvedValue({ from: fromMock });

    await loadDemoFeedback();

    expect(createControlPlaneServerClientMock).toHaveBeenCalledOnce();
  });

  it("returns [] and logs to console.error when Supabase returns an error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const orderMock = vi.fn().mockResolvedValue({ data: null, error: { message: "RLS denial" } });
    const selectMock = vi.fn().mockReturnValue({ order: orderMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    createControlPlaneServerClientMock.mockResolvedValue({ from: fromMock });

    const result = await loadDemoFeedback();

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[demo-feedback] Failed to load demo_feedback:",
      "RLS denial",
    );

    consoleErrorSpy.mockRestore();
  });
});
