import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// ADR 0026, decision 4: new screens take their colours from the theme
// (components/theme-provider.tsx) or the CSS variables in app/globals.css,
// never from new hard-coded literals. This is a ratchet: each file's count of
// colour literals in app/ and components/ may only go down. The literals left are
// real colours (state, category and chart hues) or dark tokens from the
// D1 sweep. The old light theme's palette is banned outright, so a copied
// light-theme snippet fails here instead of rendering unreadable.

const ROOT = join(__dirname, "..");
const SCANNED = ["app", "components"];
const EXEMPT = new Set(["components/theme-provider.tsx"]);

/**
 * Each file's allowance of colour literals at the time of D1 (Council
 * Review 37, made per file after the PR #176 review, so a new literal can't
 * be offset by removing one elsewhere). Lower a file's number when you
 * remove some; a file not listed may have none.
 */
const ALLOWANCE: Record<string, number> = {
  "app/hq/page.tsx": 10,
  "app/page.tsx": 23,
  "app/sign-in/page.tsx": 4,
  "components/application/app-shell.tsx": 32,
  "components/application/bible-study-client.tsx": 1,
  "components/application/calendar-live-board.tsx": 18,
  "components/application/ccm-badge-preview.tsx": 15,
  "components/application/ccm-child-profile.tsx": 1,
  "components/application/ccm-dashboard.tsx": 4,
  "components/application/church-admin-dashboard-summary.tsx": 21,
  "components/application/church-admin-event-workspace.tsx": 1,
  "components/application/church-admin-people-bulk-actions.tsx": 1,
  "components/application/church-admin-people-import-workspace.tsx": 1,
  "components/application/church-admin-people-workspace.tsx": 3,
  "components/application/church-admin-workspace-details.tsx": 7,
  "components/application/church-app-context-banner.tsx": 5,
  "components/application/communications-compose-client.tsx": 1,
  "components/application/communications-history-workspace.tsx": 1,
  "components/application/communications-message-detail-client.tsx": 6,
  "components/application/communications-template-form-client.tsx": 1,
  "components/application/communications-templates-workspace.tsx": 2,
  "components/application/control-plane-dashboard.tsx": 37,
  "components/application/custom-reports-workspace.tsx": 10,
  "components/application/finance-journal-workspace.tsx": 1,
  "components/application/giving-analytics.tsx": 1,
  "components/application/member-bottom-nav.tsx": 2,
  "components/application/member-event-registration-panel.tsx": 1,
  "components/application/ministry-track-marriage.tsx": 2,
  "components/application/ministry-track-mens.tsx": 3,
  "components/application/ministry-track-missions.tsx": 4,
  "components/application/ministry-track-womens.tsx": 2,
  "components/application/ministry-track-worship.tsx": 2,
  "components/application/operations-confirm-delete-modal.tsx": 1,
  "components/application/operations-document-detail-client.tsx": 3,
  "components/application/operations-document-form-client.tsx": 2,
  "components/application/operations-documents-workspace.tsx": 6,
  "components/application/operations-instance-detail-client.tsx": 18,
  "components/application/operations-onboarding-instances-workspace.tsx": 7,
  "components/application/operations-onboarding-template-detail-client.tsx": 7,
  "components/application/operations-onboarding-template-form-client.tsx": 3,
  "components/application/operations-onboarding-workspace.tsx": 11,
  "components/application/operations-start-instance-client.tsx": 1,
  "components/application/portal-workspace.tsx": 25,
  "components/application/public-giving-page.tsx": 3,
  "components/application/reports-dashboards.tsx": 14,
  "components/application/shepherd-workflow-queue.tsx": 1,
  "components/application/sign-in-preview-panel.tsx": 3,
  "components/application/volunteer-schedule.tsx": 1,
  "components/application/workspace-live-panels.tsx": 3,
  "components/marketing/churchcore-ops-hero-icon.tsx": 7,
  "components/marketing/landing-workspace-preview.tsx": 25,
  "components/onboarding/onboarding-workspace.tsx": 1,
  "components/portal/donor-portal.tsx": 1,
  "components/portal/public-event-registration-panel.tsx": 1,
  "components/portal/registration-payment-step.tsx": 5,
  "components/portal/volunteer-confirm-client.tsx": 1,
  "components/ui/card.tsx": 1,
};

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
  it("adds no new hard-coded colour literals to any file: use the theme or CSS variables", () => {
    const over = files.flatMap(({ path, text }) => {
      const count = text.match(COLOUR)?.length ?? 0;
      const allowed = ALLOWANCE[path] ?? 0;
      return count > allowed ? [`${path}: ${count} colour literals (allowed ${allowed})`] : [];
    });
    expect(
      over,
      'Use a theme colour (e.g. c="dimmed", color="indigo") or a CSS variable from app/globals.css instead of a new literal.',
    ).toEqual([]);
  });

  it("uses none of the old light theme's colours", () => {
    const offenders = files.flatMap(({ path, text }) =>
      BANNED.filter((colour) => text.toLowerCase().includes(colour.toLowerCase())).map((colour) => `${path}: ${colour}`),
    );
    expect(offenders).toEqual([]);
  });
});
