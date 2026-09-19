import { describe, expect, it, vi } from "vitest";

const { createTenantServerClientMock } = vi.hoisted(() => ({
  createTenantServerClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
}));

import type { ChurchAppSession } from "@/lib/auth";
import { getCcmServiceList } from "@/lib/ccm-data";

describe("getCcmServiceList", () => {
  it("returns an empty list without connecting to Supabase in preview mode", async () => {
    const session = {
      userId: "preview-admin",
      source: "preview",
      profile: {
        id: "preview-admin",
        name: "Preview Admin",
        email: "admin@example.com",
        title: "Church Administrator",
      },
      appContext: {
        kind: "church",
        roleId: "church-admin",
        church: {
          id: "preview-church",
          slug: "preview",
          name: "Preview Church",
          timezone: "America/New_York",
        },
        source: "membership",
        homePath: "/app/church-admin",
      },
    } as ChurchAppSession;

    await expect(getCcmServiceList(session)).resolves.toEqual([]);
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });
});
