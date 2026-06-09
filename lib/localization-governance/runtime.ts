// No "server-only" — this is called from server components and RSC context.
// It must remain importable in both server components and server actions.

import { messages, defaultLocale, type Locale } from "@/lib/i18n";

/**
 * Returns the active runtime catalog for the given locale and church.
 *
 * Resolution order:
 * 1. If LOCGOV_DATABASE_URL is unset → return hardcoded messages[locale] or defaultLocale fallback.
 * 2. If an active governance version exists (state: active or stale) → return its messages.
 * 3. Otherwise → fall back to hardcoded messages[locale] or defaultLocale fallback.
 *
 * Never throws — always returns a usable flat string catalog.
 */
export async function getRuntimeCatalog(
  locale: Locale,
  churchId: string,
): Promise<Record<string, string>> {
  const hardcoded = flattenMessages(
    (messages[locale] ?? messages[defaultLocale]) as Record<string, unknown>,
  );

  if (!process.env.LOCGOV_DATABASE_URL) {
    return hardcoded;
  }

  try {
    // Lazy import to avoid pulling server-only pg-client into RSC bundles
    // when LOCGOV_DATABASE_URL is unset. The dynamic import is safe because
    // this file itself is not marked server-only.
    const { createChurchAdapter } = await import(
      "@/lib/localization-governance/adapter"
    );
    const adapter = createChurchAdapter(churchId);
    const locales = await adapter.listLocales();
    const localeRecord = locales.find((l) => l.code === locale);

    if (!localeRecord?.activeVersionId) {
      return hardcoded;
    }

    const version = await adapter.service.getVersion(localeRecord.activeVersionId);

    if (
      version &&
      (version.state === "active" || version.state === "stale")
    ) {
      return version.messages as Record<string, string>;
    }

    return hardcoded;
  } catch {
    // Never throw — always return a usable catalog.
    return hardcoded;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Flattens a nested messages object into dot-notation keys.
 * e.g. { common: { app: "App" } } → { "common.app": "App" }
 */
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
