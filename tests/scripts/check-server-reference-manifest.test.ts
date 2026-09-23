import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FORBIDDEN_EXPORTED_NAMES,
  findForbiddenServerActions,
  loadManifest,
} from "../../scripts/check-server-reference-manifest.mjs";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "server-ref-manifest-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeManifest(content: unknown) {
  const path = join(dir, "server-reference-manifest.json");
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describe("findForbiddenServerActions", () => {
  it("finds no violations in a manifest containing only legitimate actions", () => {
    const manifest = {
      node: {
        abc123: {
          filename: "app/app/daily-desk-actions.ts",
          exportedName: "createDailyWorkItemAction",
          workers: {},
        },
      },
      edge: {},
    };
    expect(findForbiddenServerActions(manifest)).toEqual([]);
  });

  for (const forbiddenName of FORBIDDEN_EXPORTED_NAMES) {
    it(`flags ${forbiddenName} if it were ever registered as a node server action`, () => {
      const manifest = {
        node: {
          deadbeef: {
            filename: "lib/actions/audit.ts",
            exportedName: forbiddenName,
            workers: {},
          },
        },
        edge: {},
      };
      const violations = findForbiddenServerActions(manifest);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({
        runtime: "node",
        exportedName: forbiddenName,
        filename: "lib/actions/audit.ts",
      });
    });

    it(`flags ${forbiddenName} if it were ever registered as an edge server action`, () => {
      const manifest = {
        node: {},
        edge: {
          deadbeef: {
            filename: "lib/notifications/queue-communication.ts",
            exportedName: forbiddenName,
            workers: {},
          },
        },
      };
      const violations = findForbiddenServerActions(manifest);
      expect(violations).toHaveLength(1);
      expect(violations[0].runtime).toBe("edge");
    });
  }

  it("handles a missing or empty manifest without throwing", () => {
    expect(findForbiddenServerActions(null)).toEqual([]);
    expect(findForbiddenServerActions({})).toEqual([]);
  });
});

describe("loadManifest + findForbiddenServerActions — end-to-end against a temp file", () => {
  it("proves the check fails on a temp manifest containing a forbidden name", () => {
    const path = writeManifest({
      node: {
        "some-hash": {
          filename: "lib/notifications/queue-communication.ts",
          exportedName: "queueCommunicationAction",
          workers: {},
        },
      },
      edge: {},
    });

    const manifest = loadManifest(path);
    const violations = findForbiddenServerActions(manifest);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes on a temp manifest containing only legitimate actions", () => {
    const path = writeManifest({
      node: {
        "some-hash": {
          filename: "app/language-actions.ts",
          exportedName: "setLocaleAction",
          workers: {},
        },
      },
      edge: {},
    });

    const manifest = loadManifest(path);
    expect(findForbiddenServerActions(manifest)).toEqual([]);
  });

  it("loadManifest returns null for a manifest that doesn't exist", () => {
    expect(loadManifest(join(dir, "does-not-exist.json"))).toBeNull();
  });
});
