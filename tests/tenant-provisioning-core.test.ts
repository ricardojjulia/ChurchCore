import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { provisionTenant } from "../scripts/lib/tenant-provisioning-core.mjs";

type Operation = { table: string; method: string; value?: unknown };

function createDatabaseClient(
  operations: Operation[],
  profilesByAuthId: Record<string, { id: string; church_id: string | null }> = {},
  existingTenant: { id: string; external_tenant_id: string } | null = null,
) {
  return {
    from(table: string) {
      let authUserId = "";
      const builder = {
        select(columns?: string) {
          operations.push({ table, method: "select", value: columns });
          return builder;
        },
        eq(column: string, value: string) {
          operations.push({ table, method: "eq", value: { column, value } });
          if (column === "user_id") authUserId = value;
          return builder;
        },
        maybeSingle() {
          if (table === "tenants") return Promise.resolve({ data: existingTenant, error: null });
          return Promise.resolve({ data: profilesByAuthId[authUserId] ?? null, error: null });
        },
        update(rows: unknown) {
          operations.push({ table, method: "update", value: rows });
          return builder;
        },
        neq(column: string, value: string) {
          operations.push({ table, method: "neq", value: { column, value } });
          return Promise.resolve({ error: null });
        },
        upsert(rows: unknown, options?: unknown) {
          operations.push({ table, method: "upsert", value: { rows, options } });
          if (table === "tenants") return builder;
          return Promise.resolve({ error: null });
        },
        single() {
          return Promise.resolve({ data: { id: "control-tenant-1" }, error: null });
        },
      };
      return builder;
    },
  };
}

const config = {
  churchId: "church-1",
  churchName: "Iglesia Agua Viva de Cayey",
  churchSlug: "iglesia-agua-viva-de-cayey",
  timezone: "America/Puerto_Rico",
  legalName: "Iglesia Agua Viva de Cayey, Inc.",
  contactEmail: "j7matos@gmail.com",
  contactPhone: null,
  users: [{
    email: "j7matos@gmail.com",
    password: "temporary-password",
    supabaseRole: "church_admin",
    membershipRole: "church_admin",
    fullName: "Jose Matos",
    displayTitle: "Church Admin",
    isPastoral: false,
    profileId: "profile-1",
    memberNumber: "IAVD-D001",
  }],
};

describe("tenant provisioning core", () => {
  it("uses the current schema and preserves an auth-trigger profile identity", async () => {
    const tenantOperations: Operation[] = [];
    const controlOperations: Operation[] = [];
    const tenant = {
      ...createDatabaseClient(tenantOperations, {
        "auth-user-1": { id: "trigger-profile-1", church_id: null },
      }),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: "auth-user-1" } },
            error: null,
          }),
        },
      },
    };

    await provisionTenant(tenant as never, createDatabaseClient(controlOperations) as never, config);

    expect(tenantOperations.find((operation) => operation.table === "churches" && operation.method === "upsert")?.value).toEqual({
      rows: [expect.objectContaining({
        id: "church-1",
        legal_name: "Iglesia Agua Viva de Cayey, Inc.",
        contact_email: "j7matos@gmail.com",
      })],
      options: { onConflict: "id", ignoreDuplicates: false },
    });
    expect(tenantOperations.some((operation) => operation.method === "delete")).toBe(false);
    expect(tenantOperations.find((operation) => operation.table === "profiles" && operation.method === "upsert")?.value).toEqual({
      rows: [expect.objectContaining({
        id: "trigger-profile-1",
        phone: null,
        directory_visible: false,
        contact_allowed: false,
        is_roster_eligible: false,
      })],
      options: { onConflict: "id", ignoreDuplicates: false },
    });
    expect(controlOperations).toContainEqual({
      table: "tenants",
      method: "upsert",
      value: {
        rows: expect.objectContaining({ external_tenant_id: "church-1" }),
        options: { onConflict: "slug" },
      },
    });
    expect(tenantOperations).toContainEqual({
      table: "church_memberships",
      method: "update",
      value: { is_active: false },
    });
  });

  it("rejects a cross-tenant account before resetting its password", async () => {
    const updateUserById = vi.fn();
    const tenant = {
      ...createDatabaseClient([], {
        "auth-user-1": { id: "profile-other", church_id: "church-2" },
      }),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{ id: "auth-user-1", email: "j7matos@gmail.com" }] },
            error: null,
          }),
          updateUserById,
        },
      },
    };

    await expect(provisionTenant(
      tenant as never,
      createDatabaseClient([]) as never,
      { ...config, resetExistingPasswords: true },
    )).rejects.toThrow("belongs to another church");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects conflicting Auth metadata even when the profile is unassigned", async () => {
    const updateUserById = vi.fn();
    const tenant = {
      ...createDatabaseClient([], {
        "auth-user-1": { id: "profile-1", church_id: null },
      }),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{
              id: "auth-user-1",
              email: "j7matos@gmail.com",
              user_metadata: { church_id: "church-2" },
            }] },
            error: null,
          }),
          updateUserById,
        },
      },
    };

    await expect(provisionTenant(
      tenant as never,
      createDatabaseClient([]) as never,
      { ...config, resetExistingPasswords: true },
    )).rejects.toThrow("Auth metadata belongs to another church");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("preserves existing passwords unless an explicit reset is requested", async () => {
    const tenantOperations: Operation[] = [];
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const tenant = {
      ...createDatabaseClient(tenantOperations, {
        "auth-user-1": { id: "profile-1", church_id: "church-1" },
      }),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{ id: "auth-user-1", email: "j7matos@gmail.com", user_metadata: {} }] },
            error: null,
          }),
          updateUserById,
        },
      },
    };

    await provisionTenant(tenant as never, createDatabaseClient([]) as never, config);

    expect(updateUserById).toHaveBeenCalledWith(
      "auth-user-1",
      expect.not.objectContaining({ password: expect.anything() }),
    );
    const profileUpsert = tenantOperations.find(
      (operation) => operation.table === "profiles" && operation.method === "upsert",
    );
    expect(profileUpsert?.value).toEqual({
      rows: [expect.not.objectContaining({
        phone: expect.anything(),
        joined_date: expect.anything(),
        directory_visible: expect.anything(),
        full_name: expect.anything(),
        role: expect.anything(),
        display_title: expect.anything(),
      })],
      options: { onConflict: "id", ignoreDuplicates: false },
    });
  });

  it("refuses to rebind an established control-plane slug", async () => {
    const tenant = {
      ...createDatabaseClient([], {
        "auth-user-1": { id: "profile-1", church_id: "church-1" },
      }),
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: "auth-user-1" } },
            error: null,
          }),
        },
      },
    };
    const controlPlane = createDatabaseClient(
      [],
      {},
      { id: "control-tenant-1", external_tenant_id: "church-2" },
    );

    await expect(provisionTenant(tenant as never, controlPlane as never, config)).rejects.toThrow(
      "Refusing to rebind",
    );
  });

  it("keeps generated client records password-free", () => {
    const generator = readFileSync(resolve(process.cwd(), "scripts/provision-tenant.mjs"), "utf8");
    const clientSeed = readFileSync(resolve(process.cwd(), "scripts/seed-iglesia-agua-viva-de-cayey.mjs"), "utf8");

    expect(generator).not.toContain("JSON.stringify(DEMO_PW)");
    expect(clientSeed).not.toMatch(/password:\s*["'][^"']+["']/);
    expect(clientSeed).toContain("process.env.ADMIN_PASSWORD");
  });
});
