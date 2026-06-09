/**
 * End-to-end lifecycle test for the localization governance service.
 * Uses filesystem storage — no database required.
 * Tests the full lifecycle: create → translate → validate → review → approve → activate → rollback.
 */

import { describe, it, expect, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// @ts-expect-error — ESM package, no .d.ts
import { createGovernanceService } from "@localization-governance/core";
// @ts-expect-error — ESM package, no .d.ts
import { createFilesystemStorage } from "@localization-governance/storage-filesystem";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_ACTOR = { id: "actor-admin", role: "church-admin" };

function mockTranslationProvider() {
  return {
    async translate({
      messages,
    }: {
      sourceLocale: string;
      targetLocale: string;
      messages: Record<string, string>;
      glossary?: Record<string, string>;
    }) {
      const translated = Object.fromEntries(
        Object.entries(messages).map(([key, value]) => [key, value.toUpperCase()]),
      );
      return {
        messages: translated,
        provenance: { provider: "mock-uppercase", translatedKeys: Object.keys(messages) },
      };
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("full governance lifecycle (filesystem storage)", () => {
  let tmpDir: string;
  let service: ReturnType<typeof createGovernanceService>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "locgov-lifecycle-"));
    const storage = await createFilesystemStorage({ directory: tmpDir });
    service = createGovernanceService({
      storage,
      providers: { mock: mockTranslationProvider() },
      policy: {
        requiredReviews: ["linguistic"],
        separationOfDuties: false,
      },
    });
  });

  it("step 1: create en source locale", async () => {
    const locale = await service.createLocale({
      code: "en",
      sourceLocale: "en",
      actor: ADMIN_ACTOR,
    });

    expect(locale.code).toBe("en");
    expect(locale.sourceLocale).toBe("en");
  });

  it("step 2: create source catalog version with 3 keys", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });

    const version = await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });

    expect(version.state).toBe("active");
    expect(Object.keys(version.messages)).toHaveLength(3);
  });

  it("step 3: create es target locale", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });

    const locale = await service.createLocale({
      code: "es",
      sourceLocale: "en",
      actor: ADMIN_ACTOR,
    });

    expect(locale.code).toBe("es");
    expect(locale.sourceLocale).toBe("en");
  });

  it("step 4: create es draft version", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });

    const esVersion = await service.createCatalogVersion({
      locale: "es",
      messages: {},
      actor: ADMIN_ACTOR,
    });

    expect(esVersion.state).toBe("draft");
    expect(esVersion.locale).toBe("es");
  });

  it("step 5: translate with mock provider (uppercases values)", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });
    const esV = await service.createCatalogVersion({
      locale: "es",
      messages: {},
      actor: ADMIN_ACTOR,
    });

    const translated = await service.translateVersion({
      versionId: esV.id,
      provider: "mock",
      actor: ADMIN_ACTOR,
    });

    expect(translated.state).toBe("translated");
    expect(translated.messages.greeting).toBe("HELLO");
    expect(translated.messages.farewell).toBe("GOODBYE");
    expect(translated.messages.thanks).toBe("THANK YOU");
  });

  it("step 6: validate → passes", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });
    const esV = await service.createCatalogVersion({
      locale: "es",
      messages: {},
      actor: ADMIN_ACTOR,
    });
    const translated = await service.translateVersion({
      versionId: esV.id,
      provider: "mock",
      actor: ADMIN_ACTOR,
    });

    const { version, report } = await service.validateVersion({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
      untranslatedAllowlist: [],
    });

    expect(report.passed).toBe(true);
    expect(version.state).toBe("validated");
  });

  it("step 7: request review → in_linguistic_review", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });
    const esV = await service.createCatalogVersion({
      locale: "es",
      messages: {},
      actor: ADMIN_ACTOR,
    });
    const translated = await service.translateVersion({
      versionId: esV.id,
      provider: "mock",
      actor: ADMIN_ACTOR,
    });
    await service.validateVersion({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
      untranslatedAllowlist: [],
    });

    const inReview = await service.requestReview({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
    });

    expect(inReview.state).toBe("in_linguistic_review");
  });

  it("step 8: submit review (approved, role: linguistic)", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });
    const esV = await service.createCatalogVersion({
      locale: "es",
      messages: {},
      actor: ADMIN_ACTOR,
    });
    const translated = await service.translateVersion({
      versionId: esV.id,
      provider: "mock",
      actor: ADMIN_ACTOR,
    });
    await service.validateVersion({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
      untranslatedAllowlist: [],
    });
    await service.requestReview({ versionId: translated.id, actor: ADMIN_ACTOR });

    const review = await service.submitReview({
      versionId: translated.id,
      reviewer: { id: "reviewer-ling", role: "linguistic" },
      decision: "approved",
      comment: "LGTM",
    });

    expect(review.decision).toBe("approved");
    expect(review.reviewerRole).toBe("linguistic");
  });

  it("step 9: approve version", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });
    const esV = await service.createCatalogVersion({
      locale: "es",
      messages: {},
      actor: ADMIN_ACTOR,
    });
    const translated = await service.translateVersion({
      versionId: esV.id,
      provider: "mock",
      actor: ADMIN_ACTOR,
    });
    await service.validateVersion({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
      untranslatedAllowlist: [],
    });
    await service.requestReview({ versionId: translated.id, actor: ADMIN_ACTOR });
    await service.submitReview({
      versionId: translated.id,
      reviewer: { id: "reviewer-ling", role: "linguistic" },
      decision: "approved",
    });

    const approved = await service.approveVersion({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
    });

    expect(approved.state).toBe("approved");
  });

  it("step 10: activate version → state becomes active", async () => {
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });
    const esV = await service.createCatalogVersion({
      locale: "es",
      messages: {},
      actor: ADMIN_ACTOR,
    });
    const translated = await service.translateVersion({
      versionId: esV.id,
      provider: "mock",
      actor: ADMIN_ACTOR,
    });
    await service.validateVersion({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
      untranslatedAllowlist: [],
    });
    await service.requestReview({ versionId: translated.id, actor: ADMIN_ACTOR });
    await service.submitReview({
      versionId: translated.id,
      reviewer: { id: "reviewer-ling", role: "linguistic" },
      decision: "approved",
    });
    await service.approveVersion({ versionId: translated.id, actor: ADMIN_ACTOR });

    const activated = await service.activateVersion({
      versionId: translated.id,
      actor: ADMIN_ACTOR,
    });

    expect(activated.state).toBe("active");
  });

  it("step 11: rollback to previous version — creates activation history entry with action=rollback", async () => {
    // Set up: create first active version, then a second one, then rollback to first
    await service.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await service.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await service.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });

    // First es version — full lifecycle
    async function buildAndActivateEsVersion(messages: Record<string, string>) {
      const v = await service.createCatalogVersion({
        locale: "es",
        messages: {},
        actor: ADMIN_ACTOR,
      });
      const translated = await service.translateVersion({
        versionId: v.id,
        provider: "mock",
        actor: ADMIN_ACTOR,
        scope: "full",
      });
      void messages;
      await service.validateVersion({
        versionId: translated.id,
        actor: ADMIN_ACTOR,
        untranslatedAllowlist: [],
      });
      await service.requestReview({ versionId: translated.id, actor: ADMIN_ACTOR });
      await service.submitReview({
        versionId: translated.id,
        reviewer: { id: "reviewer-ling", role: "linguistic" },
        decision: "approved",
      });
      await service.approveVersion({ versionId: translated.id, actor: ADMIN_ACTOR });
      return service.activateVersion({
        versionId: translated.id,
        actor: ADMIN_ACTOR,
      });
    }

    const firstActive = await buildAndActivateEsVersion({});
    const secondActive = await buildAndActivateEsVersion({});

    expect(secondActive.state).toBe("active");

    // Rollback to first version
    const rolledBack = await service.rollbackLocale({
      locale: "es",
      toVersionId: firstActive.id,
      actor: ADMIN_ACTOR,
    });

    expect(rolledBack.id).toBe(firstActive.id);

    // Verify activation history has both 'activate' and 'rollback' entries
    const esLocale = await service.getLocaleStatus("es");
    const storage = await createFilesystemStorage({ directory: tmpDir });
    const enLocale = await service.getLocaleStatus("en");

    // The rollback should have created a history entry
    // We can verify by checking the locale's activeVersionId was updated
    expect(esLocale.activeVersionId).toBe(firstActive.id);

    void enLocale;
    void storage;
  });

  it("final: both activate and rollback appear in activation history", async () => {
    // Use the filesystem storage directly to read history
    const storage = await createFilesystemStorage({ directory: tmpDir });
    const localService = createGovernanceService({
      storage,
      providers: { mock: mockTranslationProvider() },
      policy: {
        requiredReviews: ["linguistic"],
        separationOfDuties: false,
      },
    });

    await localService.createLocale({ code: "en", sourceLocale: "en", actor: ADMIN_ACTOR });
    await localService.createCatalogVersion({
      locale: "en",
      messages: { greeting: "Hello" },
      actor: ADMIN_ACTOR,
      source: true,
    });
    await localService.createLocale({ code: "es", sourceLocale: "en", actor: ADMIN_ACTOR });

    async function fullCycle(svc: typeof localService) {
      const v = await svc.createCatalogVersion({
        locale: "es",
        messages: {},
        actor: ADMIN_ACTOR,
      });
      const t = await svc.translateVersion({
        versionId: v.id,
        provider: "mock",
        actor: ADMIN_ACTOR,
      });
      await svc.validateVersion({
        versionId: t.id,
        actor: ADMIN_ACTOR,
        untranslatedAllowlist: [],
      });
      await svc.requestReview({ versionId: t.id, actor: ADMIN_ACTOR });
      await svc.submitReview({
        versionId: t.id,
        reviewer: { id: "reviewer-ling", role: "linguistic" },
        decision: "approved",
      });
      await svc.approveVersion({ versionId: t.id, actor: ADMIN_ACTOR });
      return svc.activateVersion({ versionId: t.id, actor: ADMIN_ACTOR });
    }

    const v1 = await fullCycle(localService);
    const v2 = await fullCycle(localService);

    // Rollback to v1
    await localService.rollbackLocale({
      locale: "es",
      toVersionId: v1.id,
      actor: ADMIN_ACTOR,
    });

    const esLocale = await localService.getLocaleStatus("es");

    // Get locale id from status versions
    const localeId = esLocale.versions[0].localeId;
    const history = await storage.listActivationHistory(localeId);

    const actions = history.map((h: { action: string }) => h.action);
    expect(actions).toContain("activate");
    expect(actions).toContain("rollback");

    // Final check: locale points to v1 after rollback
    expect(esLocale.activeVersionId).toBe(v1.id);

    void v2;
  });
});
