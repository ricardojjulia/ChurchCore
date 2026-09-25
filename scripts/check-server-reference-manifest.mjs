#!/usr/bin/env node
/**
 * ChurchCore Ops — server-reference-manifest guard (Story A, AC9).
 *
 * ADR 0022: lib/actions/audit.ts's logAuditEvent/pruneAuditLogsAction and
 * lib/notifications/queue-communication.ts's queueCommunicationAction are
 * deliberately `import "server-only"` (not `"use server"`) — they take a
 * caller-supplied actor/session, so they must never become POST-callable
 * Next.js Server Actions. If one of them were ever accidentally exported
 * from a `"use server"` file (or given its own `"use server"` directive),
 * Next's build would register it in
 * `.next/server/server-reference-manifest.json`, each entry there under
 * `node`/`edge` carrying a `filename` and `exportedName` (verified by
 * inspecting a real build's output — see the entry for
 * app/app/daily-desk-actions.ts's createDailyWorkItemAction).
 *
 * This script fails the build if any manifest entry's exportedName is one
 * of the three forbidden names, regardless of which action-id hash or
 * runtime (node/edge) it's under.
 *
 * Usage: node scripts/check-server-reference-manifest.mjs [--manifest <path>]
 * Run right after `next build`, before anything relies on the build output.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveDefaultRepoRoot() {
  try {
    return join(fileURLToPath(new URL(".", import.meta.url)), "..");
  } catch {
    return process.cwd();
  }
}

const DEFAULT_REPO_ROOT = resolveDefaultRepoRoot();
const DEFAULT_MANIFEST_PATH = join(
  DEFAULT_REPO_ROOT,
  ".next",
  "server",
  "server-reference-manifest.json",
);

export const FORBIDDEN_EXPORTED_NAMES = [
  "queueCommunicationAction",
  "logAuditEvent",
  "pruneAuditLogsAction",
];

/**
 * @param {unknown} manifest parsed server-reference-manifest.json
 * @returns {Array<{ runtime: string, actionId: string, filename: string, exportedName: string }>}
 */
export function findForbiddenServerActions(manifest) {
  const violations = [];
  if (!manifest || typeof manifest !== "object") return violations;

  for (const runtime of ["node", "edge"]) {
    const bucket = manifest[runtime];
    if (!bucket || typeof bucket !== "object") continue;

    for (const [actionId, entry] of Object.entries(bucket)) {
      const exportedName = entry?.exportedName;
      if (typeof exportedName === "string" && FORBIDDEN_EXPORTED_NAMES.includes(exportedName)) {
        violations.push({
          runtime,
          actionId,
          filename: typeof entry?.filename === "string" ? entry.filename : "(unknown file)",
          exportedName,
        });
      }
    }
  }

  return violations;
}

export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function parseArgs(argv) {
  const args = { manifest: DEFAULT_MANIFEST_PATH };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--manifest") args.manifest = argv[++i];
  }
  return args;
}

function main() {
  const { manifest: manifestPath } = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(manifestPath);

  if (!manifest) {
    console.error(
      `check-server-reference-manifest: ${manifestPath} not found. Run "next build" first.`,
    );
    process.exit(1);
  }

  const violations = findForbiddenServerActions(manifest);

  if (violations.length === 0) {
    console.log(
      `check-server-reference-manifest: OK — none of ${FORBIDDEN_EXPORTED_NAMES.join(", ")} are registered as server actions.`,
    );
    process.exit(0);
  }

  console.error(
    `check-server-reference-manifest: ${violations.length} forbidden server action(s) found in ${manifestPath} (see ADR 0022):`,
  );
  for (const v of violations) {
    console.error(`  - ${v.exportedName} (${v.filename}, ${v.runtime} action ${v.actionId})`);
  }
  process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
