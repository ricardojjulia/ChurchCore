import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// ADR 0026, decision 4: new screens take their colours from the theme
// (components/theme-provider.tsx) or the CSS variables in app/globals.css,
// never from new hard-coded literals. This is a ratchet: the count of colour
// literals in app/ and components/ may only go down. The literals left are
// real colours (state, category and chart hues) or dark tokens from the
// D1 sweep. The old light theme's palette is banned outright, so a copied
// light-theme snippet fails here instead of rendering unreadable.

const ROOT = join(__dirname, "..");
const SCANNED = ["app", "components"];
const EXEMPT = new Set(["components/theme-provider.tsx"]);

/** Colour literals at the time of D1 (Council Review 37). Lower it when you remove some. */
const BASELINE = 374;

const COLOUR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;

// The pre-ADR-0026 light theme: navy text, slate-grey muted text, light
// canvases, and the old blue primary. None belongs on the dark theme.
const BANNED = [
  "#14213d",
  "#101827",
  "#2d3f55",
  "#617184",
  "#5c6b7a",
  "#465463",
  "#f4f7fb",
  "#f6f7f9",
  "#fbfcfe",
  "#1a56db",
  "rgba(20, 33, 61",
  "rgba(20,33,61",
  "rgba(37, 99, 235",
  "rgba(37,99,235",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const files = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir)))
  .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }))
  .filter(({ path }) => !EXEMPT.has(path));

describe("design system colours (ADR 0026)", () => {
  it("adds no new hard-coded colour literals: use the theme or CSS variables", () => {
    const count = files.reduce((sum, { text }) => sum + (text.match(COLOUR)?.length ?? 0), 0);
    expect(
      count,
      `Found ${count} colour literals (baseline ${BASELINE}). Use a theme colour (e.g. c="dimmed", color="indigo") or a CSS variable from app/globals.css instead.`,
    ).toBeLessThanOrEqual(BASELINE);
  });

  it("uses none of the old light theme's colours", () => {
    const offenders = files.flatMap(({ path, text }) =>
      BANNED.filter((colour) => text.toLowerCase().includes(colour.toLowerCase())).map((colour) => `${path}: ${colour}`),
    );
    expect(offenders).toEqual([]);
  });
});
