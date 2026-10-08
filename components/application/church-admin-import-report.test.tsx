import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children, topActions }: { children: React.ReactNode; topActions?: React.ReactNode }) => (
    <div>
      {topActions}
      {children}
    </div>
  ),
}));

import { ChurchAdminImportReport, type ReportPaging } from "@/components/application/church-admin-import-report";
import type { ChurchAppSession } from "@/lib/auth";
import type { ReconciliationResult } from "@/lib/import-reconciliation";

const session = {
  appContext: { church: { name: "Test Church", timezone: "America/New_York" } },
} as unknown as ChurchAppSession;

const batch = {
  id: "11111111-1111-4111-8111-111111111111",
  importType: "giving_csv",
  sourceSystem: "planning_center",
  sourceFilename: "gifts.csv",
  status: "committed",
  createdAt: "2026-10-07T18:00:00Z",
  committedAt: "2026-10-07T18:05:00Z",
};
const counts = { sourceRows: 10, expected: 8, written: 8, failed: 0, notAttempted: 0, skipped: 1, rejected: 1 };
const zeroPaging: ReportPaging = { mp: 1, cp: 1, sp: 1, mismatchTotal: 0, changedTotal: 0, skippedTotal: 0 };

type Ready = Extract<ReconciliationResult, { state: "ready" }>;
function ready(overrides: Partial<Ready> = {}): Ready {
  return {
    state: "ready",
    batch,
    counts,
    giving: { sourceCents: 125050, writtenAtCommitCents: 125050, currentCents: 125050, differenceCents: 0 },
    mismatchCount: 0,
    mismatches: [],
    changedSinceImport: [],
    skipped: [],
    rejected: [],
    ...overrides,
  };
}

function show(report: ReconciliationResult, paging = zeroPaging, skippedRejected: never[] | Ready["skipped"] = []) {
  return render(
    <MantineProvider>
      <ChurchAdminImportReport session={session} report={report} paging={paging} skippedRejected={skippedRejected} />
    </MantineProvider>,
  );
}

describe("ChurchAdminImportReport", () => {
  it("shows a clean import with counts, USD totals, the GL note and the CSV link", () => {
    show(ready());
    expect(screen.getByText("0 mismatches")).toBeTruthy();
    expect(screen.getByText("gifts.csv")).toBeTruthy();
    expect(screen.getByText(/Giving from Planning Center/)).toBeTruthy();
    expect(screen.getAllByText("$1,250.50").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Imported gifts are not posted to the general ledger; ledger totals are not reconciled here.")).toBeTruthy();
    expect(screen.getByText(/gift date is compared as well/)).toBeTruthy();
    expect(screen.getByText("Source rows")).toBeTruthy();
    expect(screen.getByText("Not attempted")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Download reconciliation report (CSV)" });
    expect(link.getAttribute("href")).toBe(`/api/church-admin/imports/${batch.id}/report`);
    expect(link.hasAttribute("download")).toBe(true);
    expect(screen.getByText("Nothing has changed since the import.")).toBeTruthy();
  });

  it("omits giving totals for other import types", () => {
    show(ready({ batch: { ...batch, importType: "people_households_csv" }, giving: null }));
    expect(screen.queryByText(/Giving totals/)).toBeNull();
    expect(screen.queryByText(/general ledger/)).toBeNull();
  });

  it("lists mismatches with reasons and source versus stored values", () => {
    show(
      ready({
        mismatchCount: 3,
        mismatches: [
          { rowNumber: 4, sourceId: "G-4", kind: "failed", reason: "Donor was not found.", differences: [] },
          { rowNumber: 9, sourceId: null, kind: "not_attempted", reason: null, differences: [] },
          {
            rowNumber: 6,
            sourceId: "G-6",
            kind: "value_mismatch",
            reason: null,
            differences: [{ field: "amount", source: 5000, stored: 4000 }],
          },
        ],
      }),
      { ...zeroPaging, mismatchTotal: 3 },
    );
    expect(screen.getByText("3 mismatches")).toBeTruthy();
    const region = screen.getByRole("region", { name: "Mismatches" });
    expect(within(region).getByText("Donor was not found.")).toBeTruthy();
    expect(within(region).getByText("The import stopped before this row.")).toBeTruthy();
    expect(within(region).getByText("Amount: file $50.00, stored $40.00")).toBeTruthy();
    expect(screen.getByText("Rows the import did not save as the file says")).toBeTruthy();
  });

  it("keeps changed-since-import separate and not counted", () => {
    show(
      ready({
        changedSinceImport: [
          {
            rowNumber: 2,
            sourceId: "G-2",
            change: "edited",
            differences: [{ field: "amount", atImport: 2500, now: 9900 }],
          },
          { rowNumber: 3, sourceId: "G-3", change: "deleted", differences: [] },
        ],
      }),
      { ...zeroPaging, changedTotal: 2 },
    );
    expect(screen.getByText("0 mismatches")).toBeTruthy();
    expect(screen.getByText(/Does not count against this import/)).toBeTruthy();
    const region = screen.getByRole("region", { name: "Changed since import" });
    expect(within(region).getByText("Amount: at import $25.00, now $99.00")).toBeTruthy();
    expect(within(region).getByText("Deleted")).toBeTruthy();
  });

  it("lists skipped and rejected rows with reasons and pages with links", () => {
    show(
      ready(),
      { ...zeroPaging, skippedTotal: 120 },
      [
        { rowNumber: 1, sourceId: "G-1", classification: "skip", reason: "Duplicate row." },
        { rowNumber: 2, sourceId: "G-2", classification: "reject", reason: "Amount must be positive." },
      ],
    );
    const region = screen.getByRole("region", { name: "Skipped and rejected rows" });
    expect(within(region).getByText("Duplicate row.")).toBeTruthy();
    expect(within(region).getByText("Rejected")).toBeTruthy();
    expect(screen.getByText("Showing 1-50 of 120")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      `/app/church-admin/imports/${batch.id}?sp=2`,
    );
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
  });

  it("explains a legacy import without showing zeros", () => {
    show({ state: "legacy", recording: "never", batch, summary: { created: 5, updated: 0, failed: 1 } });
    expect(screen.getByText("Row-level outcomes were not recorded for this import")).toBeTruthy();
    expect(screen.queryByText("0 mismatches")).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("says when recording was only partly completed", () => {
    show({ state: "legacy", recording: "incomplete", batch, summary: { created: 5, updated: 0, failed: 1 } });
    expect(screen.getByText("Row-level outcomes were not fully recorded for this import")).toBeTruthy();
    expect(screen.queryByText("Row-level outcomes were not recorded for this import")).toBeNull();
  });

  it("links back to the importer for the batch type and uses human status labels", () => {
    show({ state: "not_available", batch: { ...batch, importType: "group_memberships_csv", status: "dry_run_completed", committedAt: null } });
    expect(screen.getByRole("link", { name: /Back to Group memberships/ }).getAttribute("href")).toBe("/app/church-admin/groups/import");
    expect(screen.getByText(/Status: Not committed yet\./)).toBeTruthy();
  });

  it("says an uncommitted import has no report yet", () => {
    show({ state: "not_available", batch: { ...batch, status: "dry_run", committedAt: null } });
    expect(screen.getByText("This import has not been committed yet", { exact: false })).toBeTruthy();
    expect(screen.queryByText("0 mismatches")).toBeNull();
  });

  it("renders no names, emails or phones", () => {
    show(
      ready({
        mismatchCount: 1,
        mismatches: [{ rowNumber: 1, sourceId: "G-1", kind: "failed", reason: "Donor was not found.", differences: [] }],
      }),
      { ...zeroPaging, mismatchTotal: 1 },
    );
    expect(document.body.querySelector('[role="region"]')?.textContent ?? "").not.toMatch(/@|\+?\d{3}[-. ]\d{3}[-. ]\d{4}/);
    expect(screen.queryByRole("columnheader", { name: /name|email|phone/i })).toBeNull();
  });
});
