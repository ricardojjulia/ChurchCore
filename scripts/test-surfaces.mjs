#!/usr/bin/env node
/**
 * ChurchCore Ops — test-surface scanner and validator.
 *
 * Scans the codebase for the three "surfaces" that must carry test
 * coverage (pages, API routes, server actions) and cross-checks them
 * against `tests/coverage-manifest.json`, the machine-checked source of
 * truth for `docs/security-role-access-matrix.md`.
 *
 * Usage:
 *   node scripts/test-surfaces.mjs                 # strict validation (exit 1 on any failure)
 *   node scripts/test-surfaces.mjs --bootstrap      # write skeleton entries for missing surfaces
 *   node scripts/test-surfaces.mjs --write-missing  # alias for --bootstrap
 *
 * Both modes accept --root <dir> and --manifest <path> overrides, used by
 * the Vitest unit tests in tests/scripts/test-surfaces.test.ts to run the
 * scanner against temporary fixture trees instead of the real repo.
 *
 * Scanner rules (see docs/testing.md and the Story A brief):
 *   - pages:   app/**\/page.tsx -> route path (strip "app/", "/page.tsx"; no
 *              route groups exist in this repo today, but "(group)" path
 *              segments are stripped defensively if one ever appears).
 *   - routes:  app/api/**\/route.ts only (not app/**\/route.ts — this repo
 *              also has app/auth/confirm/route.ts, an OAuth callback
 *              redirect that is not part of the JSON API surface the brief
 *              scopes to "15 API routes"). Exported GET/POST/PATCH/PUT/DELETE.
 *   - actions: files whose first statement, after leading comments, is
 *              exactly "use server"; collecting exported functions/consts.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// import.meta.url isn't always a real file:// URL when this module is
// loaded through a bundler/test-runner's ESM transform (e.g. vite-node) —
// fall back to cwd (repo root, since scripts/tests are always invoked from
// there) so the pure-function exports used by the Vitest unit tests don't
// throw just from being imported.
function resolveDefaultRepoRoot() {
  try {
    return join(fileURLToPath(new URL(".", import.meta.url)), "..");
  } catch {
    return process.cwd();
  }
}

const DEFAULT_REPO_ROOT = resolveDefaultRepoRoot();
const DEFAULT_MANIFEST_PATH = join(DEFAULT_REPO_ROOT, "tests", "coverage-manifest.json");

const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];
const TODO_MARKER = "TODO";

// A page entry's optional `sweepMode` field (see docs/testing.md and the
// Story A brief) tells the page×role sweep spec how to treat that page:
//   - "render" (default): assert the allowed/denied/public render contract.
//   - "redirect": the page always redirects (e.g. a legacy alias or a
//     role-home router) — assert the redirect instead of page content.
//   - "invalid-token": a token-bearing public page whose token can't be
//     seeded deterministically (e.g. an ephemeral confirmation link) —
//     assert the page's graceful invalid-token state instead of a happy path.
const VALID_SWEEP_MODES = ["render", "redirect", "invalid-token"];

// ── Small filesystem helpers ────────────────────────────────────────────

function toPosix(p) {
  return p.split("\\").join("/");
}

function walkDir(dir, onFile) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, onFile);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}

// ── Source parsing helpers ──────────────────────────────────────────────

/** Strips leading whitespace and // and /* comments to find the first real statement. */
function skipLeadingCommentsAndWhitespace(text) {
  let i = 0;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl + 1;
      continue;
    }
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    break;
  }
  return text.slice(i);
}

const USE_SERVER_RE = /^["']use server["']\s*;/;

export function isUseServerFile(content) {
  const body = skipLeadingCommentsAndWhitespace(content);
  return USE_SERVER_RE.test(body);
}

const EXPORT_RE_LIST = [
  /^export\s+async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  /^export\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  /^export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[:=]/gm,
];

export function extractExportedFunctionsAndConsts(content) {
  const names = new Set();
  for (const re of EXPORT_RE_LIST) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

export function extractHttpMethods(content) {
  const methods = new Set();
  for (const method of HTTP_METHODS) {
    const re = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${method}\\b`, "m");
    if (re.test(content)) methods.add(method);
  }
  return [...methods].sort();
}

// ── Path conversion ──────────────────────────────────────────────────────

function stripRouteGroups(segments) {
  return segments.filter((seg) => !/^\(.*\)$/.test(seg));
}

export function pageFileToRoutePath(relFilePath) {
  const posixPath = toPosix(relFilePath);
  const dir = dirname(posixPath); // e.g. "app" or "app/church-admin/people"
  const withoutApp = dir === "app" ? "" : dir.replace(/^app\//, "");
  const segments = withoutApp ? stripRouteGroups(withoutApp.split("/")) : [];
  return "/" + segments.join("/");
}

export function routeFileToRoutePath(relFilePath) {
  const posixPath = toPosix(relFilePath);
  const dir = dirname(posixPath); // e.g. "app/api/cron/shepherd-ai"
  const withoutApp = dir.replace(/^app\//, "");
  return "/" + withoutApp;
}

// ── Scanners ─────────────────────────────────────────────────────────────

export function scanPages(rootDir) {
  const appDir = join(rootDir, "app");
  const pages = [];
  walkDir(appDir, (file) => {
    if (!file.endsWith("page.tsx")) return;
    const relFilePath = toPosix(relative(rootDir, file));
    pages.push({
      path: pageFileToRoutePath(relFilePath),
      file: relFilePath,
    });
  });
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return pages;
}

export function scanRoutes(rootDir) {
  const apiDir = join(rootDir, "app", "api");
  const routes = [];
  walkDir(apiDir, (file) => {
    if (!file.endsWith("route.ts")) return;
    const relFilePath = toPosix(relative(rootDir, file));
    const content = readFileSync(file, "utf8");
    routes.push({
      path: routeFileToRoutePath(relFilePath),
      file: relFilePath,
      methods: extractHttpMethods(content),
    });
  });
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return routes;
}

export function scanActions(rootDir) {
  const actions = [];
  for (const scanRoot of ["app", "lib"]) {
    const dir = join(rootDir, scanRoot);
    walkDir(dir, (file) => {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return;
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return;
      const content = readFileSync(file, "utf8");
      if (!isUseServerFile(content)) return;
      const relFilePath = toPosix(relative(rootDir, file));
      actions.push({
        module: relFilePath,
        exports: extractExportedFunctionsAndConsts(content),
      });
    });
  }
  actions.sort((a, b) => a.module.localeCompare(b.module));
  return actions;
}

// ── Manifest I/O ─────────────────────────────────────────────────────────

export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  const raw = readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

function emptyManifest() {
  return {
    pages: {},
    routes: {},
    actions: {},
  };
}

// ── Bootstrap (skeleton generation, never overwrites) ────────────────────

export function bootstrapManifest(rootDir, manifestPath) {
  const manifest = loadManifest(manifestPath) ?? emptyManifest();
  const added = { pages: [], routes: [], actions: [] };

  for (const page of scanPages(rootDir)) {
    if (manifest.pages[page.path]) continue;
    manifest.pages[page.path] = {
      path: page.path,
      file: page.file,
      allowedRoles: [],
      public: false,
      controlPlane: false,
      dynamicParams: null,
      // Every page is swept once it has an entry; empty allowedRoles still
      // forces a human to read the page's gates before this check passes.
      tests: ["tests/e2e/page-role-sweep.spec.ts"],
    };
    added.pages.push(page.path);
  }

  for (const route of scanRoutes(rootDir)) {
    if (manifest.routes[route.path]) continue;
    manifest.routes[route.path] = {
      path: route.path,
      file: route.file,
      methods: route.methods,
      auth: TODO_MARKER,
      tests: [TODO_MARKER],
    };
    added.routes.push(route.path);
  }

  for (const action of scanActions(rootDir)) {
    if (manifest.actions[action.module]) continue;
    manifest.actions[action.module] = {
      module: action.module,
      exports: action.exports,
      tests: [TODO_MARKER],
    };
    added.actions.push(action.module);
  }

  manifest.counts = {
    pages: Object.keys(manifest.pages).length,
    routes: Object.keys(manifest.routes).length,
    actions: Object.keys(manifest.actions).length,
  };
  return { manifest, added };
}

export function writeManifest(manifestPath, manifest) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(sortManifest(manifest), null, 2) + "\n");
}

function sortManifest(manifest) {
  const sortObj = (obj) =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  return {
    pages: sortObj(manifest.pages),
    routes: sortObj(manifest.routes),
    actions: sortObj(manifest.actions),
  };
}

// ── Strict validation (AC4) ───────────────────────────────────────────────
//
// Exits non-zero on:
//   1. a missing entry (a scanned surface has no manifest entry)
//   2. a stale entry (the manifest entry's source file is gone)
//   3. a missing test file (a tests[] path that doesn't exist on disk)
//   5. a page with empty allowedRoles unless public or controlPlane is set
//   6. any leftover TODO marker anywhere in the manifest
//   7. a page's optional `sweepMode` set to something other than
//      "render" | "redirect" | "invalid-token"
//   8. export drift: an action module's exports differ from its manifest `exports`
//   9. an action tests[] file that doesn't import or vi.mock the module
//  10. an action export named in none of its tests and not waived in
//      `untestedExports` (or a waiver that is stale or has no reason)
//
// Pages also accept optional free-text/documentation fields that this
// validator does not constrain beyond rule 7 above: `note` (free text),
// `seedSource` (where a `dynamicParams` value came from), `deniedRedirectsTo`
// (where a denied role lands when it isn't its homePath), and `redirectsTo`
// (the target path for a `sweepMode: "redirect"` page).

const IMPORT_SPECIFIER = /(?:from\s+|import\(\s*|vi\.mock\(\s*|require\(\s*)["']([^"']+)["']/g;

function stripExtension(path) {
  return path.replace(/\.(tsx?|jsx?|mjs)$/, "");
}

/** True when a test file imports or vi.mocks `modulePath` (repo-relative). */
export function referencesModule(rootDir, testPath, content, modulePath) {
  const target = stripExtension(modulePath);
  for (const match of content.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1];
    let resolved = null;
    if (specifier.startsWith("@/")) resolved = specifier.slice(2);
    else if (specifier.startsWith(".")) {
      resolved = relative(rootDir, join(rootDir, dirname(testPath), specifier));
    }
    if (resolved && stripExtension(resolved) === target) return true;
  }
  return false;
}

export function validateManifest(rootDir, manifest) {
  const errors = [];

  if (!manifest) {
    return { errors: [`Manifest not found. Run "npm run test:surfaces:bootstrap" first.`], summary: null };
  }

  const scannedPages = scanPages(rootDir);
  const scannedRoutes = scanRoutes(rootDir);
  const scannedActions = scanActions(rootDir);

  // 1. Missing entries — scanned surface with no manifest entry.
  for (const page of scannedPages) {
    if (!manifest.pages[page.path]) {
      errors.push(`missing entry: page ${page.path} (${page.file}) has no tests/coverage-manifest.json entry`);
    }
  }
  for (const route of scannedRoutes) {
    if (!manifest.routes[route.path]) {
      errors.push(`missing entry: route ${route.path} (${route.file}) has no tests/coverage-manifest.json entry`);
    }
  }
  for (const action of scannedActions) {
    if (!manifest.actions[action.module]) {
      errors.push(`missing entry: action module ${action.module} has no tests/coverage-manifest.json entry`);
    }
  }

  // 2. Stale entries — manifest entry whose source file is gone.
  for (const [key, entry] of Object.entries(manifest.pages ?? {})) {
    const file = entry?.file;
    if (!file || !existsSync(join(rootDir, file))) {
      errors.push(`stale entry: page ${key} references missing file ${file ?? "(none)"}`);
    }
  }
  for (const [key, entry] of Object.entries(manifest.routes ?? {})) {
    const file = entry?.file;
    if (!file || !existsSync(join(rootDir, file))) {
      errors.push(`stale entry: route ${key} references missing file ${file ?? "(none)"}`);
    }
  }
  for (const [key, entry] of Object.entries(manifest.actions ?? {})) {
    const file = entry?.module;
    if (!file || !existsSync(join(rootDir, file))) {
      errors.push(`stale entry: action ${key} references missing file ${file ?? "(none)"}`);
    }
  }

  // 3. Missing test files — any tests[] entry that doesn't exist on disk.
  //    (A literal "TODO" placeholder is reported separately, rule 6, not here.)
  const checkTests = (surfaceLabel, key, tests) => {
    if (!Array.isArray(tests)) return;
    for (const testPath of tests) {
      if (testPath === TODO_MARKER) continue;
      if (!existsSync(join(rootDir, testPath))) {
        errors.push(`missing test file: ${surfaceLabel} ${key} references ${testPath}, which does not exist`);
      }
    }
  };
  for (const [key, entry] of Object.entries(manifest.pages ?? {})) checkTests("page", key, entry?.tests);
  for (const [key, entry] of Object.entries(manifest.routes ?? {})) checkTests("route", key, entry?.tests);
  for (const [key, entry] of Object.entries(manifest.actions ?? {})) checkTests("action", key, entry?.tests);

  const actualCounts = {
    pages: Object.keys(manifest.pages ?? {}).length,
    routes: Object.keys(manifest.routes ?? {}).length,
    actions: Object.keys(manifest.actions ?? {}).length,
  };

  // 5. Pages with empty allowedRoles unless public or controlPlane.
  for (const [key, entry] of Object.entries(manifest.pages ?? {})) {
    if (entry?.public || entry?.controlPlane) continue;
    if (!Array.isArray(entry?.allowedRoles) || entry.allowedRoles.length === 0) {
      errors.push(`empty allowedRoles: page ${key} has no allowedRoles and is not marked public or controlPlane`);
    }
  }

  // 6. Any leftover TODO marker anywhere in the manifest.
  const todoLocations = [];
  const scan = (obj, path) => {
    if (obj === TODO_MARKER) {
      todoLocations.push(path);
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => scan(v, `${path}[${i}]`));
      return;
    }
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) scan(v, path ? `${path}.${k}` : k);
    }
  };
  scan(manifest.pages, "pages");
  scan(manifest.routes, "routes");
  scan(manifest.actions, "actions");
  for (const loc of todoLocations) {
    errors.push(`leftover TODO marker at ${loc}`);
  }

  // 7. A page's optional `sweepMode` must be one of the known values when
  // present (unset is equivalent to the "render" default and is fine).
  for (const [key, entry] of Object.entries(manifest.pages ?? {})) {
    if (entry?.sweepMode !== undefined && !VALID_SWEEP_MODES.includes(entry.sweepMode)) {
      errors.push(
        `invalid sweepMode: page ${key} has sweepMode ${JSON.stringify(entry.sweepMode)}, expected one of ${VALID_SWEEP_MODES.join(", ")}`,
      );
    }
  }

  // 8. Export drift — a module's scanned exports must match its manifest
  //    `exports` exactly, so adding an action to an existing module fails
  //    until the manifest (and a test) catch up.
  const scannedByModule = new Map(scannedActions.map((a) => [a.module, a.exports]));
  for (const [key, entry] of Object.entries(manifest.actions ?? {})) {
    const scanned = scannedByModule.get(key);
    if (!scanned) continue; // reported as stale (rule 2)
    const declared = Array.isArray(entry?.exports) ? entry.exports : [];
    const added = scanned.filter((name) => !declared.includes(name));
    const removed = declared.filter((name) => !scanned.includes(name));
    if (added.length) errors.push(`export drift: action ${key} exports ${added.join(", ")} not listed in the manifest`);
    if (removed.length) errors.push(`export drift: action ${key} lists ${removed.join(", ")}, which the module no longer exports`);
  }

  // 9. Every action tests[] file must import or vi.mock the module itself;
  // 10. every export must be named in one of those files, or be waived in
  //     `untestedExports` ({ name: reason }). A waiver for an export that is
  //     now tested is itself an error, so the list can only shrink.
  for (const [key, entry] of Object.entries(manifest.actions ?? {})) {
    if (!scannedByModule.has(key)) continue;
    const testFiles = (Array.isArray(entry?.tests) ? entry.tests : []).filter(
      (t) => t !== TODO_MARKER && existsSync(join(rootDir, t)),
    );
    const referencing = [];
    for (const testPath of testFiles) {
      const content = readFileSync(join(rootDir, testPath), "utf8");
      if (referencesModule(rootDir, testPath, content, key)) referencing.push(content);
      else errors.push(`unrelated test: action ${key} lists ${testPath}, which doesn't import or mock the module`);
    }
    const waivers = entry?.untestedExports && typeof entry.untestedExports === "object" ? entry.untestedExports : {};
    for (const name of scannedByModule.get(key)) {
      const named = referencing.some((content) => new RegExp(`\\b${name}\\b`).test(content));
      if (!named && !waivers[name]) {
        errors.push(`untested export: action ${key} export ${name} isn't named in any of its tests (add a test, or waive it in untestedExports with a reason)`);
      }
      if (named && waivers[name]) {
        errors.push(`stale waiver: action ${key} export ${name} is now tested; remove it from untestedExports`);
      }
    }
    for (const [name, reason] of Object.entries(waivers)) {
      if (!scannedByModule.get(key).includes(name)) {
        errors.push(`stale waiver: action ${key} waives ${name}, which the module doesn't export`);
      }
      if (typeof reason !== "string" || reason.trim().length === 0) {
        errors.push(`waiver without a reason: action ${key} untestedExports.${name}`);
      }
    }
  }

  const summary = {
    scannedCounts: {
      pages: scannedPages.length,
      routes: scannedRoutes.length,
      actions: scannedActions.length,
    },
    manifestCounts: actualCounts,
    todoCount: todoLocations.length,
  };

  return { errors, summary };
}

// ── CLI ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { bootstrap: false, root: DEFAULT_REPO_ROOT, manifest: DEFAULT_MANIFEST_PATH };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bootstrap" || arg === "--write-missing") args.bootstrap = true;
    else if (arg === "--root") args.root = argv[++i];
    else if (arg === "--manifest") args.manifest = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.bootstrap) {
    const { manifest, added } = bootstrapManifest(args.root, args.manifest);
    writeManifest(args.manifest, manifest);
    const totalAdded = added.pages.length + added.routes.length + added.actions.length;
    console.log(`test-surfaces --bootstrap: wrote ${relative(args.root, args.manifest)}`);
    console.log(`  pages:   +${added.pages.length} (total ${manifest.counts.pages})`);
    console.log(`  routes:  +${added.routes.length} (total ${manifest.counts.routes})`);
    console.log(`  actions: +${added.actions.length} (total ${manifest.counts.actions})`);
    if (totalAdded === 0) {
      console.log("  (no missing entries — manifest already covers every scanned surface)");
    }
    process.exit(0);
  }

  const manifest = loadManifest(args.manifest);
  const { errors, summary } = validateManifest(args.root, manifest);

  if (summary) {
    console.log("test-surfaces — scanned vs manifest:");
    console.log(
      `  pages:   scanned ${summary.scannedCounts.pages}, manifest ${summary.manifestCounts.pages}`,
    );
    console.log(
      `  routes:  scanned ${summary.scannedCounts.routes}, manifest ${summary.manifestCounts.routes}`,
    );
    console.log(
      `  actions: scanned ${summary.scannedCounts.actions}, manifest ${summary.manifestCounts.actions}`,
    );
    if (summary.todoCount > 0) {
      console.log(`  TODO markers remaining: ${summary.todoCount}`);
    }
  }

  if (errors.length === 0) {
    console.log("test-surfaces: OK — manifest is complete and consistent.");
    process.exit(0);
  }

  console.error(`\ntest-surfaces: ${errors.length} problem(s) found:\n`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.error("\nRun `npm run test:surfaces:bootstrap` to add skeleton entries for missing surfaces,");
  console.error("then fill in allowedRoles/auth/tests by hand before this check will pass.");
  process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
