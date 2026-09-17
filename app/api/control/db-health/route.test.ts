import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, resetDbHealthCache } from "./route";

const { requireControlPlaneSessionMock, queryControlPlaneLocalDbMock } = vi.hoisted(() => ({
  requireControlPlaneSessionMock: vi.fn(),
  queryControlPlaneLocalDbMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireControlPlaneSession: requireControlPlaneSessionMock,
}));

vi.mock("@/lib/supabase/control-plane", () => ({
  queryControlPlaneLocalDb: queryControlPlaneLocalDbMock,
}));

describe("GET /api/control/db-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbHealthCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks for control plane session and returns DB statistics", async () => {
    requireControlPlaneSessionMock.mockResolvedValue({ canAccessControl: true });
    queryControlPlaneLocalDbMock.mockResolvedValue({
      rows: [
        { count: 3, state: "active" },
        { count: 2, state: "idle" },
      ],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireControlPlaneSessionMock).toHaveBeenCalledWith("/control/db-health");
    expect(queryControlPlaneLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("SELECT count(*)::integer as count, state FROM pg_stat_activity"),
    );
    expect(body).toEqual({
      ok: true,
      activeConnections: 5,
      states: [
        { count: 3, state: "active" },
        { count: 2, state: "idle" },
      ],
    });
  });

  it("serves stats from cache during cache TTL window and queries again when expired", async () => {
    requireControlPlaneSessionMock.mockResolvedValue({ canAccessControl: true });
    queryControlPlaneLocalDbMock.mockResolvedValue({
      rows: [{ count: 3, state: "active" }],
    });

    const response1 = await GET();
    const body1 = await response1.json();
    expect(body1.activeConnections).toBe(3);
    expect(queryControlPlaneLocalDbMock).toHaveBeenCalledTimes(1);

    // Call again immediately — should return cache
    const response2 = await GET();
    const body2 = await response2.json();
    expect(body2.activeConnections).toBe(3);
    expect(queryControlPlaneLocalDbMock).toHaveBeenCalledTimes(1);

    // Advance timer past TTL of 10s
    vi.advanceTimersByTime(11000);

    queryControlPlaneLocalDbMock.mockResolvedValue({
      rows: [{ count: 7, state: "active" }],
    });

    const response3 = await GET();
    const body3 = await response3.json();
    expect(body3.activeConnections).toBe(7);
    expect(queryControlPlaneLocalDbMock).toHaveBeenCalledTimes(2);
  });

  it("times out and returns 500 when database query exceeds 2 seconds", async () => {
    requireControlPlaneSessionMock.mockResolvedValue({ canAccessControl: true });
    // Infinite query promise mock
    queryControlPlaneLocalDbMock.mockImplementation(() => new Promise(() => {}));

    const responsePromise = GET();

    // Fast forward to trigger timeout race rejection, flushing microtasks
    await vi.advanceTimersByTimeAsync(2500);

    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Failed to retrieve database health",
    });
  });

  it("propagates NEXT_REDIRECT errors thrown by requireControlPlaneSession", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;...",
    });
    requireControlPlaneSessionMock.mockRejectedValue(redirectError);

    await expect(GET()).rejects.toThrow("NEXT_REDIRECT");
    expect(queryControlPlaneLocalDbMock).not.toHaveBeenCalled();
  });

  it("returns 500 when database query throws an error", async () => {
    requireControlPlaneSessionMock.mockResolvedValue({ canAccessControl: true });
    queryControlPlaneLocalDbMock.mockRejectedValue(new Error("Connection timeout"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Failed to retrieve database health",
    });
  });
});
