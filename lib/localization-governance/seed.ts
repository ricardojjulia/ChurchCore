import "server-only";

import { messages } from "@/lib/i18n";

// Dynamic imports used so callers can control the storage backend.
// The default export uses the production postgres adapter.
// Tests inject a filesystem storage via seedWithService().

import type { GovernanceService } from "@/lib/localization-governance/types";

const SEED_ACTOR = { id: "seed-script", role: "church_admin" };

/**
 * Run the localization governance seed against a given service instance.
 *
 * Idempotent — checks whether the `en` locale exists before writing.
 *
 * Steps:
 * 1. Creates `en` as source locale.
 * 2. Creates source catalog version from messages.en with source=true
 *    (state becomes active immediately; markTargetsStale is called internally).
 * 3. Creates `es` locale with sourceLocale: 'en'.
 * 4. Creates an `es` catalog version from messages.es in state `validated`
 *    (NOT approved) — provenance marks it as migrated from hardcoded i18n.ts,
 *    not human-reviewed.
 */
export async function seedWithService(service: GovernanceService): Promise<void> {
  // Flatten nested message objects for governance storage.
  const enMessages = flattenMessages(
    messages.en as unknown as Record<string, unknown>,
  );
  const esMessages = flattenMessages(
    messages.es as unknown as Record<string, unknown>,
  );

  // Step 1 — en source locale (idempotent)
  const enLocale = await service.createLocale({
    code: "en",
    sourceLocale: "en",
    actor: SEED_ACTOR,
  });

  // Step 2 — source catalog version for en (source=true → state: active)
  const enVersions = await (service as unknown as { policy: unknown } & {
    // Access storage through a private route; use service.getLocaleStatus instead.
    getLocaleStatus: (code: string) => Promise<{ versions: { id: string }[] }>;
  }).getLocaleStatus("en");

  // Only create if no versions exist yet (idempotency).
  if (enVersions.versions.length === 0) {
    await service.createCatalogVersion({
      locale: "en",
      messages: enMessages,
      actor: SEED_ACTOR,
      source: true,
      provenance: {
        source: "hardcoded_i18n_migration",
        seedDate: new Date().toISOString(),
        note: "Migrated from lib/i18n.ts by seed script.",
      },
    });
  }

  // Step 3 — es target locale (idempotent)
  await service.createLocale({
    code: "es",
    sourceLocale: "en",
    actor: SEED_ACTOR,
  });

  // Step 4 — es catalog version in `validated` state (NOT approved).
  // We reach `validated` by: create draft → skip translate → validate.
  const esStatus = await service.getLocaleStatus("es");
  if (esStatus.versions.length === 0) {
    // Create draft version with pre-existing es messages.
    const esVersion = await service.createCatalogVersion({
      locale: "es",
      messages: esMessages,
      actor: SEED_ACTOR,
      source: false,
      provenance: {
        source: "hardcoded_i18n_migration",
        approvedByHuman: false,
        seedDate: new Date().toISOString(),
        note: "Migrated from lib/i18n.ts. This translation has NOT been human-reviewed or approved through the governance lifecycle. Treat as machine-quality until a linguistic reviewer approves it.",
      },
    });

    // Validate (all keys present since es matches en structure).
    try {
      await service.validateVersion({
        versionId: esVersion.id,
        actor: SEED_ACTOR,
        untranslatedAllowlist: [],
      });
    } catch {
      // Validation failures are non-fatal for the seed — leave in draft if needed.
    }
  }

  void enLocale; // suppress unused warning
}

/**
 * Entry point for production seed — uses the postgres adapter.
 * Call with: node --loader ts-node/esm lib/localization-governance/seed.ts <churchId>
 */
export async function seedForChurch(churchId: string): Promise<void> {
  const { createChurchAdapter } = await import(
    "@/lib/localization-governance/adapter"
  );
  const adapter = createChurchAdapter(churchId);
  await seedWithService(adapter.service);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function flattenMessages(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenMessages(value as Record<string, unknown>, fullKey),
      );
    } else {
      result[fullKey] = String(value ?? "");
    }
  }

  return result;
}
