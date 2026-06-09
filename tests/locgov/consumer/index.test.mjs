/**
 * Consumer portability test.
 * Verifies that the vendored tarballs can be imported and used from a plain Node.js script.
 * Run with: node tests/locgov/consumer/index.test.mjs
 * Exit 0 = success, exit 1 = failure.
 */

import { createGovernanceService } from "@localization-governance/core";
import { createFilesystemStorage } from "@localization-governance/storage-filesystem";
import os from "os";
import path from "path";
import fs from "fs";

async function run() {
  console.log("[consumer test] Starting consumer portability test...");

  // 1. createGovernanceService imports correctly
  if (typeof createGovernanceService !== "function") {
    throw new Error("createGovernanceService is not a function");
  }
  console.log("[consumer test] createGovernanceService: OK");

  // 2. createFilesystemStorage imports correctly
  if (typeof createFilesystemStorage !== "function") {
    throw new Error("createFilesystemStorage is not a function");
  }
  console.log("[consumer test] createFilesystemStorage: OK");

  // 3. Create storage and service
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "locgov-consumer-"));
  const storage = await createFilesystemStorage({ directory: tmpDir });
  const service = createGovernanceService({ storage });
  console.log("[consumer test] createGovernanceService({ storage }): OK");

  const actor = { id: "consumer-test-actor", role: "church-admin" };

  // 4. Create locale
  const enLocale = await service.createLocale({
    code: "en",
    sourceLocale: "en",
    actor,
  });
  if (enLocale.code !== "en") {
    throw new Error(`Expected locale code 'en', got '${enLocale.code}'`);
  }
  console.log("[consumer test] createLocale('en'): OK");

  // 5. Create source version
  const enVersion = await service.createCatalogVersion({
    locale: "en",
    messages: { greeting: "Hello", farewell: "Goodbye", thanks: "Thank you" },
    actor,
    source: true,
  });
  if (enVersion.state !== "active") {
    throw new Error(
      `Expected source version state 'active', got '${enVersion.state}'`,
    );
  }
  console.log("[consumer test] createCatalogVersion(source=true): OK, state=active");

  // 6. Create es locale
  await service.createLocale({ code: "es", sourceLocale: "en", actor });
  console.log("[consumer test] createLocale('es'): OK");

  // 7. Create es draft version
  const esDraft = await service.createCatalogVersion({
    locale: "es",
    messages: { greeting: "Hola", farewell: "Adios", thanks: "Gracias" },
    actor,
    provenance: { source: "consumer_test" },
  });
  if (esDraft.state !== "draft") {
    throw new Error(`Expected draft state, got '${esDraft.state}'`);
  }
  console.log("[consumer test] createCatalogVersion(es, draft): OK");

  // 8. Validate
  const { version: validated, report } = await service.validateVersion({
    versionId: esDraft.id,
    actor,
    untranslatedAllowlist: [],
  });
  if (!report.passed) {
    throw new Error(
      `Validation failed: ${JSON.stringify(report.checks)}`,
    );
  }
  if (validated.state !== "validated") {
    throw new Error(`Expected state 'validated', got '${validated.state}'`);
  }
  console.log("[consumer test] validateVersion: OK, passed=true, state=validated");

  console.log("[consumer test] All assertions passed.");

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

run()
  .then(() => {
    console.log("[consumer test] SUCCESS");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[consumer test] FAILED:", err);
    process.exit(1);
  });
