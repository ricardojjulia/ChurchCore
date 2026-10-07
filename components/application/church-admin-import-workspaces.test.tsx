import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  groupsDry: vi.fn(),
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
  commitGroupsImportBatchAction: vi.fn(),
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
      ignoredColumns: ["Favorite Color", "Shoe Size"],
    });
    wrap(<ChurchAdminGroupsImportWorkspace session={session} />);
    expect(screen.getByText(/Planning Center CSV exports and Breeze CSV exports/)).toBeTruthy();
    expect(screen.queryByText("Ignored columns (2)")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Run dry import" }));
    expect(await screen.findByText("Ignored columns (2)")).toBeTruthy();
    expect(screen.getByText("These columns were not imported.")).toBeTruthy();
    expect(screen.getByText("Shoe Size")).toBeTruthy();
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
    const { container } = wrap(<ImportCsvFileInput onText={onText} />);
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
});
