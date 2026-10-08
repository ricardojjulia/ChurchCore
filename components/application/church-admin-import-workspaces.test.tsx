import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  groupsDry: vi.fn(),
  groupsCommit: vi.fn(),
  attendanceDry: vi.fn(),
  peopleDry: vi.fn(),
  giftsDry: vi.fn(),
  eventsDry: vi.fn(),
}));

vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/app/app/church-admin/groups/import/actions", () => ({
  runGroupsImportDryRunAction: mocks.groupsDry,
  commitGroupsImportBatchAction: mocks.groupsCommit,
}));
vi.mock("@/app/app/church-admin/attendance/import/actions", () => ({
  runAttendanceImportDryRunAction: mocks.attendanceDry,
  commitAttendanceImportBatchAction: vi.fn(),
}));
vi.mock("@/app/app/church-admin/people/import/actions", () => ({
  runPeopleImportDryRunAction: mocks.peopleDry,
  commitPeopleImportBatchAction: vi.fn(),
}));
vi.mock("@/app/app/church-admin/giving/import/actions", () => ({
  runGivingImportDryRunAction: mocks.giftsDry,
  commitGivingImportBatchAction: vi.fn(),
}));
vi.mock("@/app/app/church-admin/events/import/actions", () => ({
  runEventsImportDryRunAction: mocks.eventsDry,
  commitEventsImportBatchAction: vi.fn(),
}));

import { ChurchAdminAttendanceImportWorkspace } from "@/components/application/church-admin-attendance-import-workspace";
import { ChurchAdminPeopleImportWorkspace } from "@/components/application/church-admin-people-import-workspace";
import { ChurchAdminGroupsImportWorkspace } from "@/components/application/church-admin-groups-import-workspace";
import { ImportCsvFileInput } from "@/components/application/church-admin-import-intake";
import type { ChurchAppSession } from "@/lib/auth";

const session = { appContext: { church: { name: "Test Church" } } } as unknown as ChurchAppSession;

function wrap(node: React.ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>);
}

const baseCounts = { create: 0, update: 0, skip: 0, reject: 0, unmatchedLeaders: 0, unmatchedMembers: 0 };

describe("import workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no document.fonts; Mantine autosize Textarea listens on it.
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { addEventListener: () => {}, removeEventListener: () => {} },
    });
  });

  it("renders ignored columns and the supported-files hint", async () => {
    mocks.groupsDry.mockResolvedValue({
      batchId: "b1",
      mode: "groups",
      counts: baseCounts,
      groupCreates: 0,
      rows: [],
      membershipRows: [],
      totalRows: 120,
      ignoredColumns: ["Favorite Color", "Shoe Size"],
    });
    wrap(<ChurchAdminGroupsImportWorkspace session={session} />);
    expect(screen.getByText(/Planning Center CSV exports and Breeze CSV exports/)).toBeTruthy();
    expect(screen.queryByText("Ignored columns (2)")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Run dry import" }));
    expect(await screen.findByText("Ignored columns (2)")).toBeTruthy();
    expect(screen.getByText("These columns were not imported.")).toBeTruthy();
    expect(screen.getByText("Shoe Size")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Ignored columns" })).toBeTruthy();
    expect(screen.getByText(/Showing 0 of 120 rows/)).toBeTruthy();
  });

  it("detects a Breeze file on paste, clears the stale result, and disables commit after success", async () => {
    mocks.groupsDry.mockResolvedValue({
      batchId: "b4", mode: "groups", counts: { ...baseCounts, create: 1 }, groupCreates: 0,
      rows: [], membershipRows: [], ignoredColumns: [], totalRows: 1,
    });
    mocks.groupsCommit.mockResolvedValue({
      status: "partial", created: 0, updated: 0, failed: 2, failureReasons: ["Group name is required."],
    });
    wrap(<ChurchAdminGroupsImportWorkspace session={session} />);
    await userEvent.click(screen.getByRole("button", { name: "Run dry import" }));
    const commitButton = await screen.findByRole("button", { name: "Commit batch" });
    await userEvent.click(commitButton);
    expect(await screen.findByText("Group name is required.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Commit batch" }) as HTMLButtonElement).disabled).toBe(true);

    const box = screen.getByLabelText("CSV content");
    fireEvent.change(box, { target: { value: "Breeze ID,First Name,Last Name,Tag Name\n1,A,B,Choir" } });
    expect(screen.getByText("Detected a Breeze file; source set to Breeze.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Commit batch" })).toBeNull();
    expect(screen.queryByText("Group name is required.")).toBeNull();
  });

  it("lists recent imports with report links and offers the report after a commit", async () => {
    mocks.groupsDry.mockResolvedValue({
      batchId: "b9", mode: "groups", counts: { ...baseCounts, create: 1 }, groupCreates: 0,
      rows: [], membershipRows: [], ignoredColumns: [], totalRows: 1,
    });
    mocks.groupsCommit.mockResolvedValue({
      batchId: "b9", status: "committed", created: 1, updated: 0, failed: 0, failureReasons: [],
    });
    wrap(
      <ChurchAdminGroupsImportWorkspace
        session={session}
        recentImports={[
          { id: "r1", createdAt: "2026-10-07T15:00:00Z", sourceFilename: "tags.csv", status: "committed", mismatchCount: 2, legacy: false },
          { id: "r2", createdAt: "2026-09-01T15:00:00Z", sourceFilename: "old.csv", status: "committed", mismatchCount: null, legacy: true },
        ]}
      />,
    );
    expect(screen.getByText("Recent imports")).toBeTruthy();
    expect(screen.getByText("2 mismatches")).toBeTruthy();
    expect(screen.getByText("mismatches not recorded")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open report for tags.csv" }).getAttribute("href")).toBe(
      "/app/church-admin/imports/r1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Run dry import" }));
    await userEvent.click(await screen.findByRole("button", { name: "Commit batch" }, { timeout: 5000 }));
    const link = await screen.findByRole("link", { name: "View reconciliation report" }, { timeout: 5000 });
    expect(link.getAttribute("href")).toBe("/app/church-admin/imports/b9");
  }, 15_000);

  it("says when there are no recent imports", () => {
    wrap(<ChurchAdminPeopleImportWorkspace session={session} recentImports={[]} />);
    expect(screen.getByText("No imports yet.")).toBeTruthy();
  });

  it("shows per-source required columns", () => {
    wrap(<ChurchAdminPeopleImportWorkspace session={session} />);
    expect(screen.getByText(/Required columns: household_name, full_name/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("CSV content"), {
      target: { value: "Person ID,First Name,Last Name\n1,A,B" },
    });
    expect(screen.getByText(/Required columns: Person ID, First Name, Last Name/)).toBeTruthy();
  });

  it("hides ignored columns when empty and shows skipped anonymous for attendance", async () => {
    mocks.attendanceDry.mockResolvedValue({
      batchId: "b2",
      counts: {
        create: 1, update: 0, skip: 0, reject: 0,
        unmatchedProfiles: 0, unmatchedEvents: 0, skippedAnonymous: 4,
      },
      rows: [],
      ignoredColumns: [],
    });
    wrap(<ChurchAdminAttendanceImportWorkspace session={session} />);
    await userEvent.click(screen.getByRole("button", { name: "Run dry import" }));
    expect(await screen.findByText("4 skipped (anonymous)")).toBeTruthy();
    expect(screen.queryByText(/Ignored columns/)).toBeNull();
  });

  it("renders the memberships table with truncated names", async () => {
    mocks.groupsDry.mockResolvedValue({
      batchId: "b3",
      mode: "memberships",
      counts: { ...baseCounts, create: 1, unmatchedMembers: 2 },
      groupCreates: 3,
      rows: [],
      membershipRows: [
        {
          rowNumber: 2, memberNumber: "B-1", groupName: "x".repeat(250), folder: "Folder A",
          profileResolved: true, groupExists: false, action: "create", reason: null,
        },
      ],
      ignoredColumns: [],
    });
    wrap(<ChurchAdminGroupsImportWorkspace session={session} />);
    await userEvent.click(screen.getByRole("button", { name: "Run dry import" }));
    expect(await screen.findByText("Tags (memberships)")).toBeTruthy();
    expect(screen.getByText("2 unmatched member(s)")).toBeTruthy();
    expect(screen.getByText("groups +3")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Tag membership rows" })).toBeTruthy();
    expect(screen.getByText("B-1")).toBeTruthy();
    expect(screen.getByText(`${"x".repeat(200)}...`)).toBeTruthy();
  });
});

describe("ImportCsvFileInput", () => {
  it("loads file text and rejects oversized files", async () => {
    const onText = vi.fn();
    const onClear = vi.fn();
    const { container } = wrap(<ImportCsvFileInput onText={onText} onClear={onClear} />);
    expect(screen.getByText("Upload a CSV file")).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe(".csv,text/csv");

    const ok = new File(["a,b\n1,2"], "ok.csv", { type: "text/csv" });
    await userEvent.upload(input, ok);
    await waitFor(() => expect(onText).toHaveBeenCalledWith("a,b\n1,2"));

    onText.mockClear();
    const big = new File(["x"], "big.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 3.5 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/larger than 3.5 MB/)).toBeTruthy();
    expect(onText).not.toHaveBeenCalled();
  });

  it("clears the text when the chosen file is cleared", async () => {
    const onText = vi.fn();
    const onClear = vi.fn();
    const { container } = wrap(<ImportCsvFileInput onText={onText} onClear={onClear} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["a"], "a.csv", { type: "text/csv" }));
    await waitFor(() => expect(onText).toHaveBeenCalledWith("a"));
    await userEvent.click(screen.getByRole("button", { name: "Clear selected file" }));
    expect(onClear).toHaveBeenCalled();
  });
});
