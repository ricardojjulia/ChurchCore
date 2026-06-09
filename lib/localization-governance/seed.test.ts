import { describe, it, expect, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// @ts-expect-error — ESM package
import { createGovernanceService } from "@localization-governance/core";
// @ts-expect-error — ESM package
import { createFilesystemStorage } from "@localization-governance/storage-filesystem";

import type { GovernanceService } from "@/lib/localization-governance/types";
// The seed module is server-only but we need to import it in tests.
// We import the exported function directly (not the "server-only" guard).
import { seedWithServiceAndMessages } from "@/lib/localization-governance/seed";

// Controlled test fixtures — clean data with no placeholder mismatches.
const TEST_EN = {
  common: { greeting: "Hello {name}", signOut: "Sign out", count: "{count} item" },
  nav: { home: "Home", settings: "Settings" },
} as const;

const TEST_ES = {
  common: { greeting: "Hola {name}", signOut: "Cerrar sesión", count: "{count} artículo" },
  nav: { home: "Inicio", settings: "Configuración" },
} as const;

// Wrapper that uses controlled fixtures (deterministic in tests)
async function seedWithService(service: ReturnType<typeof createGovernanceService>) {
  return seedWithServiceAndMessages(
    service,
    TEST_EN as unknown as Record<string, unknown>,
    TEST_ES as unknown as Record<string, unknown>,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeService(dir: string): Promise<GovernanceService> {
  const storage = await createFilesystemStorage({ directory: dir });
  return createGovernanceService({ storage });
}

function flattenMessages(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenMessages(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value ?? "");
    }
  }
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("seedWithService", () => {
  let tmpDir: string;
  let service: GovernanceService;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "locgov-seed-"));
    service = await makeService(tmpDir);
  });

  it("creates en source locale and es target locale", async () => {
    await seedWithService(service);

    const enStatus = await service.getLocaleStatus("en");
    expect(enStatus.code).toBe("en");
    expect(enStatus.sourceLocale).toBe("en");

    const esStatus = await service.getLocaleStatus("es");
    expect(esStatus.code).toBe("es");
    expect(esStatus.sourceLocale).toBe("en");
  });

  it("en version has all keys from messages.en", async () => {
    await seedWithService(service);

    const enStatus = await service.getLocaleStatus("en");
    expect(enStatus.versions.length).toBeGreaterThan(0);

    // Get the actual version with messages
    const enVersion = await service.getVersion(enStatus.versions[0].id);
    const expectedKeys = Object.keys(flattenMessages(TEST_EN as unknown as Record<string, unknown>));
    for (const key of expectedKeys) {
      expect(enVersion.messages).toHaveProperty(key);
    }
  });

  it("is idempotent — running twice produces no error and no duplicate versions", async () => {
    await seedWithService(service);
    await seedWithService(service);

    const enStatus = await service.getLocaleStatus("en");
    const esStatus = await service.getLocaleStatus("es");

    // Only one version each
    expect(enStatus.versions.length).toBe(1);
    // es may have 1 version (draft or validated)
    expect(esStatus.versions.length).toBeLessThanOrEqual(1);
  });

  it("es catalog version is in validated state, NOT approved", async () => {
    await seedWithService(service);

    const esStatus = await service.getLocaleStatus("es");

    expect(esStatus.versions.length).toBeGreaterThan(0);
    const esVersion = await service.getVersion(esStatus.versions[0].id);
    // Seed must reach 'validated'. If validation fails the seed has a bug.
    expect(esVersion.state).toBe("validated");
    expect(esVersion.state).not.toBe("approved");
    expect(esVersion.state).not.toBe("active");
  });

  it("es catalog version provenance includes source: hardcoded_i18n_migration and approvedByHuman: false", async () => {
    await seedWithService(service);

    const esStatus = await service.getLocaleStatus("es");

    if (esStatus.versions.length > 0) {
      const esVersion = await service.getVersion(esStatus.versions[0].id);
      expect(esVersion.provenance.source).toBe("hardcoded_i18n_migration");
      expect(esVersion.provenance.approvedByHuman).toBe(false);
    }
  });

  it("en source version state is active (source=true causes immediate activation)", async () => {
    await seedWithService(service);

    const enStatus = await service.getLocaleStatus("en");
    expect(enStatus.activeVersionId).not.toBeNull();

    const enVersion = await service.getVersion(enStatus.versions[0].id);
    expect(enVersion.state).toBe("active");
  });
});
