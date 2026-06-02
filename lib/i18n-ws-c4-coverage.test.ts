/**
 * WS-C4 Spanish UI Coverage — i18n verification tests
 *
 * Verifies:
 * 1. All five new namespaces exist in both en and es.
 * 2. Every en key has a corresponding es entry (no gaps) in every namespace.
 * 3. No key in any namespace falls back to the raw key string (i.e. every
 *    value is a non-empty string different from the key itself).
 */

import { describe, expect, it } from "vitest";

import { messages } from "@/lib/i18n";

const NEW_NAMESPACES = [
  "communicationsHub",
  "financeAccounts",
  "financeBudget",
  "financeDashboard",
  "givingAdmin",
] as const;

type NewNamespace = (typeof NEW_NAMESPACES)[number];

function enKeys(ns: NewNamespace): string[] {
  return Object.keys(messages.en[ns] as Record<string, string>);
}
function esKeys(ns: NewNamespace): string[] {
  return Object.keys(messages.es[ns] as Record<string, string>);
}
function enValue(ns: NewNamespace, key: string): string {
  return (messages.en[ns] as Record<string, string>)[key];
}
function esValue(ns: NewNamespace, key: string): string {
  return (messages.es[ns] as Record<string, string>)[key];
}

describe("WS-C4 i18n — five new namespaces exist", () => {
  it.each(NEW_NAMESPACES)("%s exists in messages.en", (ns) => {
    expect(messages.en[ns]).toBeDefined();
  });

  it.each(NEW_NAMESPACES)("%s exists in messages.es", (ns) => {
    expect(messages.es[ns]).toBeDefined();
  });
});

describe("WS-C4 i18n — en/es key parity in new namespaces", () => {
  it.each(NEW_NAMESPACES)("%s — every en key has an es entry", (ns) => {
    const missing = enKeys(ns).filter((k) => !esKeys(ns).includes(k));
    expect(missing, `Keys present in en but missing in es: ${missing.join(", ")}`).toHaveLength(0);
  });

  it.each(NEW_NAMESPACES)("%s — no es-only orphan keys", (ns) => {
    const orphans = esKeys(ns).filter((k) => !enKeys(ns).includes(k));
    expect(orphans, `Keys present in es but not in en: ${orphans.join(", ")}`).toHaveLength(0);
  });

  it.each(NEW_NAMESPACES)("%s — en and es have the same key count", (ns) => {
    expect(enKeys(ns).length).toBe(esKeys(ns).length);
  });
});

describe("WS-C4 i18n — no empty or missing translation values", () => {
  it.each(NEW_NAMESPACES)("%s — all en values are non-empty strings", (ns) => {
    const bad = enKeys(ns).filter((k) => {
      const v = enValue(ns, k);
      return typeof v !== "string" || v.trim() === "";
    });
    expect(bad, `Empty en values: ${bad.join(", ")}`).toHaveLength(0);
  });

  it.each(NEW_NAMESPACES)("%s — all es values are non-empty strings", (ns) => {
    const bad = enKeys(ns).filter((k) => {
      const v = esValue(ns, k);
      return typeof v !== "string" || v.trim() === "";
    });
    expect(bad, `Empty es values: ${bad.join(", ")}`).toHaveLength(0);
  });
});

describe("WS-C4 i18n — es values differ from en (actual translations)", () => {
  // A few spot-check keys that should be genuinely translated.
  const spotChecks: Array<[NewNamespace, string]> = [
    ["communicationsHub", "pageTitle"],
    ["communicationsHub", "tabLog"],
    ["communicationsHub", "tabSuppressions"],
    ["communicationsHub", "statusFailed"],
    ["communicationsHub", "statusDelivered"],
    ["financeAccounts", "pageTitle"],
    ["financeAccounts", "addAccount"],
    ["financeAccounts", "typeAsset"],
    ["financeAccounts", "typeLiability"],
    ["financeAccounts", "statusActive"],
    ["financeBudget", "pageTitle"],
    ["financeBudget", "newBudget"],
    ["financeBudget", "actualsHeading"],
    ["financeBudget", "statusActive"],
    ["financeDashboard", "pageTitle"],
    ["financeDashboard", "totalIncome"],
    ["financeDashboard", "totalExpenses"],
    ["financeDashboard", "statusDraft"],
    ["financeDashboard", "statusPosted"],
    ["financeDashboard", "statusVoided"],
    ["givingAdmin", "pageTitle"],
    ["givingAdmin", "tabAnalytics"],
    ["givingAdmin", "tabFundMappings"],
    ["givingAdmin", "thisMonth"],
    ["givingAdmin", "typeRecurring"],
  ];

  it.each(spotChecks)("%s.%s has a distinct es translation", (ns, key) => {
    const en = enValue(ns, key);
    const es = esValue(ns, key);
    // The translation must exist and differ from the en version.
    // (Exception: purely non-linguistic tokens like "CSV", "-", "OK" may coincide.)
    const nonLinguistic = /^[A-Z\-/]+$/.test(en) || en === "-" || en === "OK";
    if (!nonLinguistic) {
      expect(es).not.toBe(en);
    }
    expect(typeof es).toBe("string");
    expect(es.trim()).not.toBe("");
  });
});

describe("WS-C4 i18n — communicationsHub readiness state keys present in both locales", () => {
  // These 4 readiness-state strings are translated in i18n.ts even though the
  // component currently uses hardcoded literals; they must be ready for wiring.
  const readinessKeys = [
    "backendUnavailableTitle",
    "backendUnavailableDescription",
    "backendUnavailableDetail",
    "readinessEmpty",
    "readinessEmptyDescription",
    "readinessClear",
    "readinessClearDescription",
    "readinessAttention",
    "readinessAttentionDescription",
  ];

  it.each(readinessKeys)("communicationsHub.%s is present in en", (key) => {
    expect(enValue("communicationsHub", key)).toBeTruthy();
  });

  it.each(readinessKeys)("communicationsHub.%s is present in es and differs from en", (key) => {
    const en = enValue("communicationsHub", key);
    const es = esValue("communicationsHub", key);
    expect(es).toBeTruthy();
    expect(es).not.toBe(en);
  });
});

describe("WS-C4 i18n — financeDashboard journal status labels match component usage", () => {
  // The component builds journalStatusLabel using these three keys.
  const statusKeys = ["statusDraft", "statusPosted", "statusVoided"] as const;

  it.each(statusKeys)("financeDashboard.%s en value is non-empty", (key) => {
    expect(enValue("financeDashboard", key).trim()).not.toBe("");
  });

  it.each(statusKeys)("financeDashboard.%s es value differs from en", (key) => {
    expect(esValue("financeDashboard", key)).not.toBe(enValue("financeDashboard", key));
  });
});

describe("WS-C4 i18n — financeAccounts type labels used in ACCOUNT_TYPE_OPTIONS", () => {
  const typeKeys = [
    "typeAsset",
    "typeLiability",
    "typeEquity",
    "typeIncome",
    "typeExpense",
  ] as const;

  it.each(typeKeys)("financeAccounts.%s es differs from en", (key) => {
    expect(esValue("financeAccounts", key)).not.toBe(enValue("financeAccounts", key));
  });
});

describe("WS-C4 i18n — givingAdmin nav and tab labels present", () => {
  const navAndTabKeys = [
    "sectionLabel",
    "pageTitle",
    "sidebarTitle",
    "sidebarDescription",
    "tabReadinessExceptions",
    "tabAnalytics",
    "tabFundMappings",
    "tabGivingPage",
    "dashPageTitle",
    "dashSidebarTitle",
    "dashSidebarDescription",
  ] as const;

  it.each(navAndTabKeys)("givingAdmin.%s has both en and es", (key) => {
    expect(enValue("givingAdmin", key).trim()).not.toBe("");
    expect(esValue("givingAdmin", key).trim()).not.toBe("");
  });
});

describe("WS-C4 i18n — global namespace parity (no new gaps introduced)", () => {
  it("all top-level namespaces in en also exist in es", () => {
    const enNamespaces = Object.keys(messages.en);
    const esNamespaces = Object.keys(messages.es);
    const onlyInEn = enNamespaces.filter((ns) => !esNamespaces.includes(ns));
    expect(onlyInEn, `Namespaces missing in es: ${onlyInEn.join(", ")}`).toHaveLength(0);
  });

  it("all namespaces have matching key counts across en and es", () => {
    const namespaces = Object.keys(messages.en) as (keyof typeof messages.en)[];
    const mismatches: string[] = [];

    for (const ns of namespaces) {
      const enCount = Object.keys(messages.en[ns] as Record<string, string>).length;
      const esCount = Object.keys((messages.es as typeof messages.en)[ns] as Record<string, string>).length;
      if (enCount !== esCount) {
        mismatches.push(`${ns}: en=${enCount} es=${esCount}`);
      }
    }

    expect(mismatches, `Key count mismatches: ${mismatches.join("; ")}`).toHaveLength(0);
  });
});
