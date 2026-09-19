import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireControlPlaneSessionMock, updateMock, eqMock, selectMock, maybeSingleMock, adminClientMock } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const select = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn<(value: unknown) => { eq: typeof eq }>(() => ({ eq }));
  return {
    requireControlPlaneSessionMock: vi.fn(),
    updateMock: update,
    eqMock: eq,
    selectMock: select,
    maybeSingleMock: maybeSingle,
    adminClientMock: { from: vi.fn(() => ({ update })) },
  };
});

vi.mock("@/lib/auth", () => ({
  requireControlPlaneSession: requireControlPlaneSessionMock,
}));

vi.mock("@/lib/supabase/control-plane", () => ({
  createControlPlaneAdminClient: vi.fn(() => adminClientMock),
}));

import { PATCH } from "@/app/api/control/demo-feedback/[id]/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/control/demo-feedback/row-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "row-1" }) };

describe("PATCH /api/control/demo-feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireControlPlaneSessionMock.mockResolvedValue({ canAccessControl: true });
    maybeSingleMock.mockResolvedValue({ data: { id: "row-1" }, error: null });
  });

  it("requires a control-plane session before mutation", async () => {
    const denied = new Error("NEXT_REDIRECT");
    requireControlPlaneSessionMock.mockRejectedValueOnce(denied);

    await expect(PATCH(request({ processed: true }), params)).rejects.toBe(denied);
    expect(adminClientMock.from).not.toHaveBeenCalled();
  });

  it("updates only validated triage fields in the control plane", async () => {
    const response = await PATCH(
      request({ processed: true, action: "code_fixed", ignored: "value" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(requireControlPlaneSessionMock).toHaveBeenCalledWith("/control/demo-feedback");
    expect(adminClientMock.from).toHaveBeenCalledWith("demo_feedback");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ processed: true, action: "code_fixed" }),
    );
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty("ignored");
    expect(eqMock).toHaveBeenCalledWith("id", "row-1");
    expect(selectMock).toHaveBeenCalledWith("id");
  });

  it("rejects invalid actions before accessing the database", async () => {
    const response = await PATCH(request({ action: "delete_everything" }), params);

    expect(response.status).toBe(400);
    expect(adminClientMock.from).not.toHaveBeenCalled();
  });

  it("returns a generic error when the control-plane update fails", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: "sensitive database detail" } });

    const response = await PATCH(request({ processed: true }), params);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Update failed" });
    expect(JSON.stringify(body)).not.toContain("sensitive database detail");
  });

  it("returns not found when no feedback row matches", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const response = await PATCH(request({ processed: true }), params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Feedback item not found" });
  });
});
