import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bootstrapManifest,
  extractExportedFunctionsAndConsts,
  extractHttpMethods,
  isUseServerFile,
  pageFileToRoutePath,
  routeFileToRoutePath,
  scanActions,
  scanPages,
  scanRoutes,
  validateManifest,
  writeManifest,
} from "../../scripts/test-surfaces.mjs";

let root: string;

function write(relPath: string, content: string) {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function buildFixtureTree() {
  write(
    "app/page.tsx",
    `export default function Home() { return null; }\n`,
  );
  write(
    "app/church-admin/page.tsx",
    `export default function ChurchAdminHome() { return null; }\n`,
  );
  write(
    "app/api/widgets/route.ts",
    `import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ ok: true }); }
export async function POST() { return NextResponse.json({ ok: true }); }
`,
  );
  // Not part of the API surface — mirrors app/auth/confirm/route.ts in the real repo.
  write(
    "app/auth/confirm/route.ts",
    `import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ ok: true }); }
`,
  );
  write(
    "app/my-actions.ts",
    `"use server";

export async function doThingAction() { return true; }
export const someConstAction = async () => true;
`,
  );
  write(
    "app/commented-actions.ts",
    `// Copyright notice
// second comment line
/* block comment
   spanning lines */
"use server";

export async function doOtherAction() { return true; }
`,
  );
  // Looks similar but is NOT a server action — must not be picked up by the scanner.
  write(
    "lib/server-only-thing.ts",
    `import "server-only";

// server-only, not "use server": this must never be a POST-callable Server Action.
export async function notAnAction() { return true; }
`,
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "test-surfaces-"));
  buildFixtureTree();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("path conversion", () => {
  it("converts a root page file to /", () => {
    expect(pageFileToRoutePath("app/page.tsx")).toBe("/");
  });

  it("converts a nested page file to its route path", () => {
    expect(pageFileToRoutePath("app/church-admin/people/page.tsx")).toBe("/church-admin/people");
  });

  it("strips route-group segments defensively", () => {
    expect(pageFileToRoutePath("app/(marketing)/pricing/page.tsx")).toBe("/pricing");
  });

  it("converts an API route file to its route path", () => {
    expect(routeFileToRoutePath("app/api/cron/shepherd-ai/route.ts")).toBe("/api/cron/shepherd-ai");
  });
});

describe("isUseServerFile", () => {
  it("detects a leading \"use server\" directive", () => {
    expect(isUseServerFile(`"use server";\n\nexport async function f() {}\n`)).toBe(true);
  });

  it("detects \"use server\" after leading // and /* */ comments", () => {
    const content = `// license header\n/* block\n comment */\n"use server";\n\nexport async function f() {}\n`;
    expect(isUseServerFile(content)).toBe(true);
  });

  it("does not treat a \"server-only\" import as a use-server file", () => {
    const content = `import "server-only";\n\n// mentions "use server" only in a comment\nexport async function f() {}\n`;
    expect(isUseServerFile(content)).toBe(false);
  });

  it("does not treat a later, non-leading \"use server\" string as a directive", () => {
    const content = `import { revalidatePath } from "next/cache";\n"use server";\n`;
    expect(isUseServerFile(content)).toBe(false);
  });
});

describe("extractExportedFunctionsAndConsts", () => {
  it("collects exported async functions, functions, and consts, but not types", () => {
    const content = `
export async function alphaAction() {}
export function betaHelper() {}
export const gammaAction = async () => {};
export type NotAnExport = { id: string };
`;
    expect(extractExportedFunctionsAndConsts(content)).toEqual([
      "alphaAction",
      "betaHelper",
      "gammaAction",
    ]);
  });
});

describe("extractHttpMethods", () => {
  it("collects exported HTTP method handlers", () => {
    const content = `export async function GET() {}\nexport async function POST() {}\n`;
    expect(extractHttpMethods(content)).toEqual(["GET", "POST"]);
  });

  it("returns an empty list when no method handlers are exported", () => {
    expect(extractHttpMethods(`export function helper() {}\n`)).toEqual([]);
  });
});

describe("scanPages / scanRoutes / scanActions", () => {
  it("finds every page.tsx under app/", () => {
    const pages = scanPages(root);
    expect(pages.map((p) => p.path).sort()).toEqual(["/", "/church-admin"]);
  });

  it("finds only app/api/**/route.ts, excluding app/auth/confirm/route.ts", () => {
    const routes = scanRoutes(root);
    expect(routes.map((r) => r.path)).toEqual(["/api/widgets"]);
    expect(routes[0].methods).toEqual(["GET", "POST"]);
  });

  it("finds \"use server\" action modules, including ones with leading comments, and excludes server-only files", () => {
    const actions = scanActions(root);
    const modules = actions.map((a) => a.module).sort();
    expect(modules).toEqual(["app/commented-actions.ts", "app/my-actions.ts"]);
    expect(modules).not.toContain("lib/server-only-thing.ts");

    const myActions = actions.find((a) => a.module === "app/my-actions.ts");
    expect(myActions?.exports).toEqual(["doThingAction", "someConstAction"]);
  });
});

describe("bootstrapManifest", () => {
  it("writes skeleton entries with TODO markers and prefilled file/path", () => {
    const { manifest, added } = bootstrapManifest(root, join(root, "tests", "coverage-manifest.json"));

    expect(added.pages.sort()).toEqual(["/", "/church-admin"]);
    expect(added.routes).toEqual(["/api/widgets"]);
    expect(added.actions.sort()).toEqual(["app/commented-actions.ts", "app/my-actions.ts"]);

    expect(manifest.pages["/church-admin"]).toEqual({
      path: "/church-admin",
      file: "app/church-admin/page.tsx",
      allowedRoles: [],
      public: false,
      controlPlane: false,
      dynamicParams: null,
      envGated: null,
      tests: ["TODO"],
    });
    expect(manifest.routes["/api/widgets"].tests).toEqual(["TODO"]);
    expect(manifest.actions["app/my-actions.ts"].tests).toEqual(["TODO"]);
    expect(manifest.counts).toEqual({ pages: 2, routes: 1, actions: 2 });
  });

  it("never overwrites an existing entry", () => {
    const manifestPath = join(root, "tests", "coverage-manifest.json");
    const { manifest: first } = bootstrapManifest(root, manifestPath);
    first.pages["/church-admin"].allowedRoles = ["church-admin"];
    first.pages["/church-admin"].tests = ["tests/e2e/page-role-sweep.spec.ts"];
    writeManifest(manifestPath, first);

    // Re-running bootstrap must not clobber the hand-filled entry from the
    // first pass, and must not report it as newly added.
    const { manifest: second, added } = bootstrapManifest(root, manifestPath);

    expect(added.pages).not.toContain("/church-admin");
    expect(second.pages["/church-admin"].allowedRoles).toEqual(["church-admin"]);
    expect(second.pages["/church-admin"].tests).toEqual(["tests/e2e/page-role-sweep.spec.ts"]);
  });
});

describe("validateManifest", () => {
  function fullyFilledManifest(): {
    generated_at: string;
    counts: { pages: number; routes: number; actions: number };
    pages: Record<string, Record<string, unknown>>;
    routes: Record<string, Record<string, unknown>>;
    actions: Record<string, Record<string, unknown>>;
  } {
    return {
      generated_at: new Date().toISOString(),
      counts: { pages: 2, routes: 1, actions: 2 },
      pages: {
        "/": {
          path: "/",
          file: "app/page.tsx",
          allowedRoles: [],
          public: true,
          controlPlane: false,
          dynamicParams: null,
          envGated: null,
          tests: ["tests/e2e/page-role-sweep.spec.ts"],
        },
        "/church-admin": {
          path: "/church-admin",
          file: "app/church-admin/page.tsx",
          allowedRoles: ["church-admin"],
          public: false,
          controlPlane: false,
          dynamicParams: null,
          envGated: null,
          tests: ["tests/e2e/page-role-sweep.spec.ts"],
        },
      },
      routes: {
        "/api/widgets": {
          path: "/api/widgets",
          file: "app/api/widgets/route.ts",
          methods: ["GET", "POST"],
          auth: "public",
          tests: ["tests/e2e/api-widgets.spec.ts"],
        },
      },
      actions: {
        "app/my-actions.ts": {
          module: "app/my-actions.ts",
          exports: ["doThingAction", "someConstAction"],
          tests: ["app/my-actions.test.ts"],
        },
        "app/commented-actions.ts": {
          module: "app/commented-actions.ts",
          exports: ["doOtherAction"],
          tests: ["app/commented-actions.test.ts"],
        },
      },
    };
  }

  it("passes with no errors when the manifest fully and correctly covers every scanned surface", () => {
    write("tests/e2e/page-role-sweep.spec.ts", "// spec\n");
    write("tests/e2e/api-widgets.spec.ts", "// spec\n");
    write("app/my-actions.test.ts", "// test\n");
    write("app/commented-actions.test.ts", "// test\n");

    const { errors } = validateManifest(root, fullyFilledManifest());
    expect(errors).toEqual([]);
  });

  it("fails on a missing entry", () => {
    const manifest = fullyFilledManifest();
    delete manifest.pages["/church-admin"];
    manifest.counts.pages = 1;

    const { errors } = validateManifest(root, manifest);
    expect(errors.some((e) => e.includes("missing entry: page /church-admin"))).toBe(true);
  });

  it("fails on a stale entry whose source file is gone", () => {
    const manifest = fullyFilledManifest();
    manifest.pages["/deleted-page"] = {
      path: "/deleted-page",
      file: "app/deleted-page/page.tsx",
      allowedRoles: ["member"],
      public: false,
      controlPlane: false,
      dynamicParams: null,
      envGated: null,
      tests: ["tests/e2e/page-role-sweep.spec.ts"],
    };
    manifest.counts.pages = 3;

    const { errors } = validateManifest(root, manifest);
    expect(errors.some((e) => e.includes("stale entry: page /deleted-page"))).toBe(true);
  });

  it("fails on a missing test file", () => {
    const manifest = fullyFilledManifest();
    manifest.routes["/api/widgets"].tests = ["tests/e2e/api-widgets-does-not-exist.spec.ts"];

    const { errors } = validateManifest(root, manifest);
    expect(
      errors.some((e) => e.includes("missing test file") && e.includes("api-widgets-does-not-exist")),
    ).toBe(true);
  });

  it("fails on a header count mismatch", () => {
    write("tests/e2e/page-role-sweep.spec.ts", "// spec\n");
    write("tests/e2e/api-widgets.spec.ts", "// spec\n");
    write("app/my-actions.test.ts", "// test\n");
    write("app/commented-actions.test.ts", "// test\n");

    const manifest = fullyFilledManifest();
    manifest.counts.pages = 99;

    const { errors } = validateManifest(root, manifest);
    expect(errors.some((e) => e.includes("header count mismatch") && e.includes("counts.pages"))).toBe(
      true,
    );
  });

  it("fails on a page with empty allowedRoles that isn't public or controlPlane", () => {
    const manifest = fullyFilledManifest();
    manifest.pages["/church-admin"].allowedRoles = [];

    const { errors } = validateManifest(root, manifest);
    expect(errors.some((e) => e.includes("empty allowedRoles: page /church-admin"))).toBe(true);
  });

  it("does not require allowedRoles for public or controlPlane pages", () => {
    write("tests/e2e/page-role-sweep.spec.ts", "// spec\n");
    write("tests/e2e/api-widgets.spec.ts", "// spec\n");
    write("app/my-actions.test.ts", "// test\n");
    write("app/commented-actions.test.ts", "// test\n");

    const manifest = fullyFilledManifest();
    manifest.pages["/"].allowedRoles = [];
    manifest.pages["/"].public = true;

    const { errors } = validateManifest(root, manifest);
    expect(errors.some((e) => e.includes("empty allowedRoles"))).toBe(false);
  });

  it("fails on any leftover TODO marker", () => {
    const manifest = fullyFilledManifest();
    manifest.actions["app/my-actions.ts"].tests = ["TODO"];

    const { errors } = validateManifest(root, manifest);
    expect(errors.some((e) => e.includes("leftover TODO marker") && e.includes("actions"))).toBe(true);
  });

  it("reports a clear message when the manifest file is missing entirely", () => {
    const { errors } = validateManifest(root, null);
    expect(errors[0]).toMatch(/bootstrap/i);
  });
});
