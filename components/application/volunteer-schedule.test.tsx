import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";

import type { ServicePlanDetail, VolunteerPoolEntry, VolunteerShift } from "@/lib/volunteer-types";

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const {
  searchSongLibraryActionMock,
  addSongToServicePlanActionMock,
  createSongAndAddToServicePlanActionMock,
  reorderServicePlanItemsActionMock,
  removeServicePlanItemActionMock,
  addPlanPositionActionMock,
  assignVolunteerActionMock,
  suggestVolunteersForPositionActionMock,
  proposePlanAutoFillActionMock,
  applyPlanAutoFillActionMock,
} = vi.hoisted(() => ({
  searchSongLibraryActionMock: vi.fn(),
  addSongToServicePlanActionMock: vi.fn(),
  createSongAndAddToServicePlanActionMock: vi.fn(),
  reorderServicePlanItemsActionMock: vi.fn(),
  removeServicePlanItemActionMock: vi.fn(),
  addPlanPositionActionMock: vi.fn(),
  assignVolunteerActionMock: vi.fn(),
  // Neutral defaults: no suggestions, so the Suggested panel shows its empty
  // state and existing assertions on the full pool list are unaffected.
  suggestVolunteersForPositionActionMock: vi.fn(
    async (): Promise<{ ok: boolean; volunteers: unknown[] }> => ({ ok: true, volunteers: [] }),
  ),
  proposePlanAutoFillActionMock: vi.fn(),
  applyPlanAutoFillActionMock: vi.fn(),
}));

// Captures the onDragEnd handler DndContext is rendered with, so tests can
// invoke it directly with a synthetic drag event instead of simulating real
// pointer-drag physics (which testing-library / jsdom cannot do reliably).
const capturedOnDragEndRef: { current: ((event: DragEndEvent) => void) | null } = { current: null };

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      capturedOnDragEndRef.current = props.onDragEnd ?? null;
      const { DndContext: ActualDndContext } = actual;
      return <ActualDndContext {...props} />;
    },
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/app/church-admin-actions", () => ({
  addRosterAssignmentAction: vi.fn(),
  quickCheckInEventMemberAction: vi.fn(),
}));

vi.mock("@/app/app/volunteer-actions", () => ({
  addPlanPositionAction: addPlanPositionActionMock,
  addRunOfServiceItemAction: vi.fn(),
  addSongToServicePlanAction: addSongToServicePlanActionMock,
  assignVolunteerAction: assignVolunteerActionMock,
  createServicePlanAction: vi.fn(),
  createSongAndAddToServicePlanAction: createSongAndAddToServicePlanActionMock,
  reorderServicePlanItemsAction: reorderServicePlanItemsActionMock,
  removeAssignmentAction: vi.fn(),
  removeServicePlanItemAction: removeServicePlanItemActionMock,
  searchSongLibraryAction: searchSongLibraryActionMock,
  suggestVolunteersForPositionAction: suggestVolunteersForPositionActionMock,
  proposePlanAutoFillAction: proposePlanAutoFillActionMock,
  applyPlanAutoFillAction: applyPlanAutoFillActionMock,
  sendVolunteerReminderAction: vi.fn(),
  updateServicePlanDetailsAction: vi.fn(),
  updateServicePlanStatusAction: vi.fn(),
}));

import { ServicePlanBuilder } from "@/components/application/volunteer-schedule";

function baseDetail(): ServicePlanDetail {
  return {
    plan: {
      id: "plan-1",
      churchId: "church-1",
      eventId: null,
      name: "Sunday Worship",
      serviceDate: "2026-04-21",
      serviceTime: "09:00",
      serviceType: "worship",
      scriptureReference: null,
      sermonTitle: null,
      sermonSpeaker: null,
      status: "draft",
      notes: null,
      createdBy: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
    runOfService: [
      {
        id: "item-1",
        planId: "plan-1",
        churchId: "church-1",
        startsAt: null,
        endsAt: null,
        title: "Call to Worship",
        itemType: "segment",
        leaderName: null,
        notes: null,
        attachmentUrl: null,
        sortOrder: 0,
        songKey: null,
        durationSeconds: null,
        artist: null,
      },
      {
        id: "item-2",
        planId: "plan-1",
        churchId: "church-1",
        startsAt: null,
        endsAt: null,
        title: "Sermon",
        itemType: "sermon",
        leaderName: null,
        notes: null,
        attachmentUrl: null,
        sortOrder: 1,
        songKey: null,
        durationSeconds: null,
        artist: null,
      },
    ],
    positions: [],
    unfilledCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
  };
}

function renderBuilder(
  detail: ServicePlanDetail = baseDetail(),
  options: {
    roleTypes?: Array<{ id: string; name: string }>;
    pool?: VolunteerPoolEntry[];
  } = {},
) {
  const { roleTypes = [{ id: "role-1", name: "Greeter" }], pool = [] } = options;
  return render(
    <MantineProvider>
      <ServicePlanBuilder
        detail={detail}
        events={[]}
        pool={pool}
        linkedEventOps={null}
        roleTypes={roleTypes}
      />
    </MantineProvider>,
  );
}

function baseShift(overrides: Partial<VolunteerShift> = {}): VolunteerShift {
  return {
    id: "shift-1",
    churchId: "church-1",
    eventId: null,
    planId: "plan-1",
    positionId: "pos-1",
    assignedUserId: "member-1",
    title: "Greeter",
    startsAt: "2026-04-21T09:00:00Z",
    endsAt: "2026-04-21T10:00:00Z",
    status: "assigned",
    confirmationStatus: "confirmed",
    declineReason: null,
    respondedAt: null,
    volunteerNotes: null,
    reminderCount: 0,
    lastReminderAt: null,
    volunteerName: "Jamie Lee",
    volunteerEmail: null,
    volunteerPhone: null,
    ...overrides,
  };
}

function basePosition(
  overrides: Partial<ServicePlanDetail["positions"][number]> = {},
): ServicePlanDetail["positions"][number] {
  return {
    id: "pos-1",
    planId: "plan-1",
    churchId: "church-1",
    roleTypeId: "role-1",
    roleName: "Greeter",
    requiredSkills: [],
    quantityNeeded: 1,
    ministryId: null,
    sortOrder: 0,
    shifts: [],
    filled: 0,
    pending: 0,
    ...overrides,
  };
}

function basePoolEntry(overrides: Partial<VolunteerPoolEntry> = {}): VolunteerPoolEntry {
  return {
    profileId: "member-1",
    fullName: "Jamie Lee",
    email: "jamie@example.com",
    phone: null,
    skills: [],
    maxServicesPerMonth: null,
    isVolunteer: true,
    isBlocked: false,
    servingOnDate: false,
    recentShiftCount: 0,
    monthShiftCount: 0,
    lastServedAt: null,
    roleServedCount: 0,
    totalHours: 0,
    ...overrides,
  };
}

describe("ServicePlanBuilder — song search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEndRef.current = null;
  });

  it("shows a 'create new' affordance when the search has no results", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({ ok: true, results: [] });
    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "Amazing Grace");

    await waitFor(() => {
      expect(searchSongLibraryActionMock).toHaveBeenCalledWith({ query: "Amazing Grace" });
    });

    expect(
      await screen.findByRole("button", { name: /create "amazing grace" as a new song/i }),
    ).toBeInTheDocument();
  });

  it("shows the empty-library message the first time a search returns nothing", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({ ok: true, results: [] });
    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "xyz");

    expect(
      await screen.findByText("Your song library is empty — search to add your first song."),
    ).toBeInTheDocument();
  });

  it("selecting a result calls addSongToServicePlanAction and adds it to the list", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({
      ok: true,
      results: [
        {
          id: "song-1",
          title: "How Great Is Our God",
          artist: "Chris Tomlin",
          defaultKey: "G",
          defaultDurationSeconds: 240,
          lastUsedDate: null,
        },
      ],
    });
    addSongToServicePlanActionMock.mockResolvedValue({ ok: true, id: "new-item-1" });

    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "great");

    const addButton = await screen.findByRole("button", { name: "Add" });
    await user.click(addButton);

    await waitFor(() => {
      expect(addSongToServicePlanActionMock).toHaveBeenCalledWith({
        planId: "plan-1",
        songLibraryId: "song-1",
      });
    });

    expect(await screen.findByText("How Great Is Our God")).toBeInTheDocument();
  });

  it("renders a dismissible repeat-use warning without removing the added song", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({
      ok: true,
      results: [
        {
          id: "song-1",
          title: "How Great Is Our God",
          artist: "Chris Tomlin",
          defaultKey: "G",
          defaultDurationSeconds: 240,
          lastUsedDate: "2026-02-24",
        },
      ],
    });
    addSongToServicePlanActionMock.mockResolvedValue({
      ok: true,
      id: "new-item-1",
      warning: "Last used 2026-02-24 — 8 weeks ago",
    });

    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "great");
    const addButton = await screen.findByRole("button", { name: "Add" });
    await user.click(addButton);

    const warning = await screen.findByText("Last used 2026-02-24 — 8 weeks ago");
    expect(warning).toBeInTheDocument();
    expect(screen.getByText("How Great Is Our God")).toBeInTheDocument();

    // Dismiss the warning — the added song must remain in the list.
    const alert = warning.closest(".mantine-Alert-root") as HTMLElement;
    const closeButton = alert.querySelector("button") as HTMLButtonElement;
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Last used 2026-02-24 — 8 weeks ago")).not.toBeInTheDocument();
    });
    expect(screen.getByText("How Great Is Our God")).toBeInTheDocument();
  });

  it("shows a generic error and leaves the list unchanged when adding a song fails", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({
      ok: true,
      results: [
        {
          id: "song-1",
          title: "How Great Is Our God",
          artist: null,
          defaultKey: null,
          defaultDurationSeconds: null,
          lastUsedDate: null,
        },
      ],
    });
    addSongToServicePlanActionMock.mockResolvedValue({ ok: false, error: "Cannot add songs to a cancelled service plan." });

    renderBuilder();

    const itemsBefore = screen.getAllByText(/^(Call to Worship|Sermon)$/);
    expect(itemsBefore).toHaveLength(2);

    await user.type(screen.getByLabelText("Search song library"), "great");
    const addButton = await screen.findByRole("button", { name: "Add" });
    await user.click(addButton);

    expect(
      await screen.findByText("Cannot add songs to a cancelled service plan."),
    ).toBeInTheDocument();
    // The search result row itself still legitimately shows the title (so
    // the user can retry) — what must NOT have happened is a second,
    // added-to-plan copy showing up in the run-of-service list below.
    expect(screen.getAllByText("How Great Is Our God")).toHaveLength(1);
    expect(screen.getAllByText(/^(Call to Worship|Sermon)$/)).toHaveLength(2);
  });

  it("shows a re-auth prompt (not a generic error) when adding a song throws an Unauthorized error", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({
      ok: true,
      results: [
        {
          id: "song-1",
          title: "How Great Is Our God",
          artist: null,
          defaultKey: null,
          defaultDurationSeconds: null,
          lastUsedDate: null,
        },
      ],
    });
    addSongToServicePlanActionMock.mockRejectedValue(new Error("Unauthorized"));

    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "great");
    const addButton = await screen.findByRole("button", { name: "Add" });
    await user.click(addButton);

    expect(await screen.findByText("Sign-in required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in again/i })).toHaveAttribute("href", "/sign-in");
    // Only the still-visible search result row shows the title — nothing
    // was added to the run-of-service list.
    expect(screen.getAllByText("How Great Is Our God")).toHaveLength(1);
    expect(screen.getAllByText(/^(Call to Worship|Sermon)$/)).toHaveLength(2);
  });
});

describe("ServicePlanBuilder — create new song", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEndRef.current = null;
  });

  it("submits the create-song form with a required title and adds the item on success", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({ ok: true, results: [] });
    createSongAndAddToServicePlanActionMock.mockResolvedValue({
      ok: true,
      songLibraryId: "song-new",
      itemId: "item-new",
    });

    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "Great Are You Lord");
    const createButton = await screen.findByRole("button", { name: /create "great are you lord" as a new song/i });
    await user.click(createButton);

    const titleInput = await screen.findByLabelText(/^Title/, { selector: "input" });
    expect(titleInput).toHaveValue("Great Are You Lord");

    await user.click(screen.getByRole("button", { name: "Add song" }));

    await waitFor(() => {
      expect(createSongAndAddToServicePlanActionMock).toHaveBeenCalledTimes(1);
    });
    const firstCallArgs = createSongAndAddToServicePlanActionMock.mock.calls[0][0];
    expect(firstCallArgs.title).toBe("Great Are You Lord");
    expect(firstCallArgs.planId).toBe("plan-1");
    expect(typeof firstCallArgs.idempotencyKey).toBe("string");
    expect(firstCallArgs.idempotencyKey.length).toBeGreaterThan(0);

    expect(await screen.findByText("Great Are You Lord")).toBeInTheDocument();
  });

  it("requires a title before submitting", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({ ok: true, results: [] });
    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "  ");
    // Whitespace-only query never triggers a search or the empty-results panel.
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
  });

  it("reuses the same idempotencyKey on a retry after a simulated failure", async () => {
    const user = userEvent.setup();
    searchSongLibraryActionMock.mockResolvedValue({ ok: true, results: [] });
    createSongAndAddToServicePlanActionMock
      .mockResolvedValueOnce({ ok: false, error: "Network error, try again." })
      .mockResolvedValueOnce({ ok: true, songLibraryId: "song-new", itemId: "item-new" });

    renderBuilder();

    await user.type(screen.getByLabelText("Search song library"), "Great Are You Lord");
    const createButton = await screen.findByRole("button", { name: /create "great are you lord" as a new song/i });
    await user.click(createButton);

    await user.click(screen.getByRole("button", { name: "Add song" }));
    await waitFor(() => expect(createSongAndAddToServicePlanActionMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Network error, try again.")).toBeInTheDocument();

    // Retry the same submission.
    await user.click(screen.getByRole("button", { name: "Add song" }));
    await waitFor(() => expect(createSongAndAddToServicePlanActionMock).toHaveBeenCalledTimes(2));

    const firstKey = createSongAndAddToServicePlanActionMock.mock.calls[0][0].idempotencyKey;
    const secondKey = createSongAndAddToServicePlanActionMock.mock.calls[1][0].idempotencyKey;
    expect(secondKey).toBe(firstKey);
  });
});

describe("ServicePlanBuilder — reorder (buttons + drag-and-drop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEndRef.current = null;
  });

  it("move-up/move-down buttons still reorder items and call reorderServicePlanItemsAction", async () => {
    const user = userEvent.setup();
    reorderServicePlanItemsActionMock.mockResolvedValue({ ok: true });
    renderBuilder();

    const moveDownButton = screen.getByRole("button", { name: "Move down: Call to Worship" });
    await user.click(moveDownButton);

    await waitFor(() => {
      expect(reorderServicePlanItemsActionMock).toHaveBeenCalledWith({
        planId: "plan-1",
        orderedIds: ["item-2", "item-1"],
      });
    });

    const titles = screen.getAllByText(/^(Call to Worship|Sermon)$/).map((el) => el.textContent);
    expect(titles).toEqual(["Sermon", "Call to Worship"]);
  });

  it("drag-and-drop persists the new order via reorderServicePlanItemsAction", async () => {
    reorderServicePlanItemsActionMock.mockResolvedValue({ ok: true });
    renderBuilder();

    await waitFor(() => expect(capturedOnDragEndRef.current).not.toBeNull());

    await act(async () => {
      capturedOnDragEndRef.current!({
        active: { id: "item-1" },
        over: { id: "item-2" },
      } as unknown as DragEndEvent);
    });

    await waitFor(() => {
      expect(reorderServicePlanItemsActionMock).toHaveBeenCalledWith({
        planId: "plan-1",
        orderedIds: ["item-2", "item-1"],
      });
    });

    const titles = screen.getAllByText(/^(Call to Worship|Sermon)$/).map((el) => el.textContent);
    expect(titles).toEqual(["Sermon", "Call to Worship"]);
  });

  it("drag handles expose an aria-label and a tabIndex, so keyboard-only reordering is reachable via dnd-kit's KeyboardSensor", () => {
    // Full pick-up/move/drop keyboard interaction relies on dnd-kit computing
    // real bounding-box geometry (getBoundingClientRect) to decide the next
    // sortable index; jsdom returns zero-sized rects for every element, so
    // the coordinate math dnd-kit's KeyboardSensor depends on can't produce
    // a meaningful index change in this environment. This is verified
    // manually in-browser (see handoff notes) instead. What IS verified
    // here: the drag handle is a real, focusable, labeled control that
    // dnd-kit's KeyboardSensor (wired via useSensors in the component) can
    // attach its keydown handler to — the accessibility contract the story
    // requires, decoupled from jsdom's layout limitation.
    renderBuilder();

    const handle = screen.getByRole("button", { name: "Reorder: Call to Worship" });
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Reorder: Sermon" })).toBeInTheDocument();
  });

  it("shows an error and leaves the list unchanged when reorder fails", async () => {
    const user = userEvent.setup();
    reorderServicePlanItemsActionMock.mockResolvedValue({ ok: false, error: "Cannot reorder items on a cancelled service plan." });
    renderBuilder();

    const moveDownButton = screen.getByRole("button", { name: "Move down: Call to Worship" });
    await user.click(moveDownButton);

    expect(
      await screen.findByText("Cannot reorder items on a cancelled service plan."),
    ).toBeInTheDocument();

    const titles = screen.getAllByText(/^(Call to Worship|Sermon)$/).map((el) => el.textContent);
    expect(titles).toEqual(["Call to Worship", "Sermon"]);
  });

  it("shows a re-auth prompt and rolls back the order when reorder throws an Unauthorized error", async () => {
    const user = userEvent.setup();
    reorderServicePlanItemsActionMock.mockRejectedValue(new Error("Unauthorized"));
    renderBuilder();

    const moveDownButton = screen.getByRole("button", { name: "Move down: Call to Worship" });
    await user.click(moveDownButton);

    expect(await screen.findByText("Sign-in required")).toBeInTheDocument();

    const titles = screen.getAllByText(/^(Call to Worship|Sermon)$/).map((el) => el.textContent);
    expect(titles).toEqual(["Call to Worship", "Sermon"]);
  });
});

describe("ServicePlanBuilder — remove run-of-service item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the item from the list on success, without touching the other item", async () => {
    const user = userEvent.setup();
    removeServicePlanItemActionMock.mockResolvedValue({ ok: true });
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Remove: Call to Worship" }));

    await waitFor(() => {
      expect(removeServicePlanItemActionMock).toHaveBeenCalledWith({
        planId: "plan-1",
        itemId: "item-1",
      });
    });

    expect(screen.queryByText("Call to Worship")).not.toBeInTheDocument();
    expect(screen.getByText("Sermon")).toBeInTheDocument();
  });

  it("shows an error and leaves the list unchanged when removal fails", async () => {
    const user = userEvent.setup();
    removeServicePlanItemActionMock.mockResolvedValue({
      ok: false,
      error: "Cannot remove items on a cancelled service plan.",
    });
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Remove: Call to Worship" }));

    expect(
      await screen.findByText("Cannot remove items on a cancelled service plan."),
    ).toBeInTheDocument();
    expect(screen.getByText("Call to Worship")).toBeInTheDocument();
    expect(screen.getByText("Sermon")).toBeInTheDocument();
  });

  it("shows a re-auth prompt and leaves the list unchanged when removal throws an Unauthorized error", async () => {
    const user = userEvent.setup();
    removeServicePlanItemActionMock.mockRejectedValue(new Error("Unauthorized"));
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Remove: Call to Worship" }));

    expect(await screen.findByText("Sign-in required")).toBeInTheDocument();
    expect(screen.getByText("Call to Worship")).toBeInTheDocument();
    expect(screen.getByText("Sermon")).toBeInTheDocument();
  });
});

describe("ServicePlanBuilder — add position (role type picker)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a role-type Select, not free text", async () => {
    const user = userEvent.setup();
    renderBuilder(baseDetail(), {
      roleTypes: [
        { id: "role-1", name: "Greeter" },
        { id: "role-2", name: "Sound Tech" },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Add Position" }));

    expect(screen.getByRole("combobox", { name: /role type/i })).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Worship Leader, Sound Tech, Greeter…"),
    ).not.toBeInTheDocument();
  });

  it("shows a validation message when submitting without a role type selected", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Add Position" }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Select a role type.")).toBeInTheDocument();
    expect(addPlanPositionActionMock).not.toHaveBeenCalled();
  });

  it("submits with the selected role type's id (not a free-text role name)", async () => {
    const user = userEvent.setup();
    addPlanPositionActionMock.mockResolvedValue({ ok: true, id: "pos-1" });
    renderBuilder(baseDetail(), { roleTypes: [{ id: "role-1", name: "Greeter" }] });

    await user.click(screen.getByRole("button", { name: "Add Position" }));
    await user.click(screen.getByRole("combobox", { name: /role type/i }));
    await user.click(await screen.findByText("Greeter"));
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(addPlanPositionActionMock).toHaveBeenCalledWith({
        planId: "plan-1",
        roleTypeId: "role-1",
        quantityNeeded: 1,
        sortOrder: 0,
      });
    });
  });

  it("surfaces the server's own validation error when the action rejects the submission", async () => {
    const user = userEvent.setup();
    addPlanPositionActionMock.mockResolvedValue({
      ok: false,
      error: "A valid, active role type is required.",
    });
    renderBuilder(baseDetail(), { roleTypes: [{ id: "role-1", name: "Greeter" }] });

    await user.click(screen.getByRole("button", { name: "Add Position" }));
    await user.click(screen.getByRole("combobox", { name: /role type/i }));
    await user.click(await screen.findByText("Greeter"));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("A valid, active role type is required."),
    ).toBeInTheDocument();
  });

  it("shows an empty-state prompt instead of the Add Position trigger when there are zero active role types", () => {
    renderBuilder(baseDetail(), { roleTypes: [] });

    expect(screen.queryByRole("button", { name: "Add Position" })).not.toBeInTheDocument();
    expect(screen.getByText("No role types yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage role types" })).toHaveAttribute(
      "href",
      "/app/church-admin/volunteers/role-types",
    );
  });
});

describe("ServicePlanBuilder — Team Roster table", () => {
  it("renders one row per unfilled slot; unassigned rows are visually flagged, never blank", () => {
    const detail = baseDetail();
    detail.positions = [
      basePosition({
        quantityNeeded: 3,
        shifts: [baseShift()],
        filled: 1,
        pending: 0,
      }),
    ];
    renderBuilder(detail);

    const roster = within(screen.getByTestId("team-roster"));
    // 1 filled slot, rendered once in the desktop table and once in the
    // mobile card list (jsdom renders both trees regardless of viewport).
    expect(roster.getAllByText("Jamie Lee")).toHaveLength(2);
    // 2 unfilled slots (quantityNeeded 3, filled 1) — each rendered in both
    // trees, and never left blank: "Unassigned" in the volunteer column,
    // an "Open" status badge alongside it.
    expect(roster.getAllByText("Unassigned")).toHaveLength(4);
    expect(roster.getAllByText("Open")).toHaveLength(4);
  });

  it("shows a clear empty state when the plan has zero positions", () => {
    renderBuilder(baseDetail());

    const roster = within(screen.getByTestId("team-roster"));
    expect(
      roster.getByText("No positions yet — add positions to build a roster."),
    ).toBeInTheDocument();
  });

  it("renders both a desktop table and a mobile card list (jsdom cannot evaluate visibleFrom/hiddenFrom media queries)", () => {
    const detail = baseDetail();
    detail.positions = [basePosition({ shifts: [baseShift()], filled: 1 })];
    renderBuilder(detail);

    const roster = within(screen.getByTestId("team-roster"));
    expect(roster.getByRole("table")).toBeInTheDocument();
    expect(roster.getAllByText("Jamie Lee")).toHaveLength(2);
  });
});

/**
 * A Mantine button is disabled while its `loading` prop is set. The Apply
 * button shares the page's pending state with the proposal request, so on a
 * slow runner it can still be loading when it first appears; clicking it
 * then does nothing.
 */
async function clickWhenEnabled(user: ReturnType<typeof userEvent.setup>, button: HTMLElement) {
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

describe("ServicePlanBuilder — rotation planner feedback (Council Review 19)", () => {
  it("a successful assign closes the modal and shows the volunteer on the position", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.positions = [basePosition({ id: "pos-1", roleName: "Greeter", quantityNeeded: 2 })];
    assignVolunteerActionMock.mockResolvedValue({ ok: true });
    renderBuilder(detail, { pool: [basePoolEntry({ profileId: "p-1", fullName: "Alice Helper" })] });

    await user.click(screen.getByRole("button", { name: "Assign" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Alice Helper assigned as Greeter.")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 filled")).toBeInTheDocument();
  });

  it("an assign error is shown inside the modal, not behind it", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.positions = [basePosition({ id: "pos-1", roleName: "Greeter", quantityNeeded: 1 })];
    assignVolunteerActionMock.mockResolvedValue({ ok: false, error: "This volunteer is already assigned on this service date." });
    renderBuilder(detail, { pool: [basePoolEntry({ profileId: "p-1", fullName: "Alice Helper" })] });

    await user.click(screen.getByRole("button", { name: "Assign" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Assign" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This volunteer is already assigned on this service date.",
    );
  });

  it("shows an error, not 'no available volunteer', when suggestions fail to load", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.positions = [basePosition({ id: "pos-1", roleName: "Greeter" })];
    suggestVolunteersForPositionActionMock.mockRejectedValueOnce(new Error("network"));
    renderBuilder(detail, { pool: [] });

    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByText(/Couldn't load suggestions\./)).toBeInTheDocument();
    expect(screen.queryByText(/No available volunteer for this date/)).not.toBeInTheDocument();
  });

  it("the full list explains why someone isn't suggested, and won't double-book", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.positions = [basePosition({ id: "pos-1", roleName: "Greeter" })];
    renderBuilder(detail, {
      pool: [
        basePoolEntry({ profileId: "p-cap", fullName: "Capped Carl", maxServicesPerMonth: 1, monthShiftCount: 1 }),
        basePoolEntry({ profileId: "p-busy", fullName: "Busy Bea", servingOnDate: true }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Assign" }));
    const dialog = await screen.findByRole("dialog");

    const capped = within(dialog).getByText("Capped Carl").closest(".mantine-Paper-root") as HTMLElement;
    expect(within(capped).getByText("At monthly limit (1/1)")).toBeInTheDocument();
    expect(within(capped).getByRole("button", { name: "Assign" })).toBeEnabled();

    const busy = within(dialog).getByText("Busy Bea").closest(".mantine-Paper-root") as HTMLElement;
    expect(within(busy).getByText("Already serving that day")).toBeInTheDocument();
    expect(within(busy).getByRole("button", { name: "Assign" })).toBeDisabled();
  });

  it("applied auto-fill results appear on the plan without a page reload", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.unfilledCount = 1;
    detail.positions = [basePosition({ id: "pos-1", roleName: "Greeter", quantityNeeded: 1 })];
    proposePlanAutoFillActionMock.mockResolvedValueOnce({
      ok: true,
      proposal: [{ positionId: "pos-1", roleName: "Greeter", profileId: "p-maya", fullName: "Maya Martinez", reasons: [] }],
    });
    applyPlanAutoFillActionMock.mockResolvedValueOnce({
      ok: true,
      results: [{ positionId: "pos-1", profileId: "p-maya", ok: true }],
    });
    renderBuilder(detail, { pool: [] });

    await user.click(screen.getByRole("button", { name: "Auto-fill plan" }));
    await clickWhenEnabled(user, await screen.findByRole("button", { name: "Apply 1 assignment" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("1 / 1 filled")).toBeInTheDocument();
    // Nothing is left to fill, so the button is gone.
    expect(screen.queryByRole("button", { name: "Auto-fill plan" })).not.toBeInTheDocument();
  });

  it("an apply error is shown inside the auto-fill modal", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.unfilledCount = 1;
    detail.positions = [basePosition({ id: "pos-1", roleName: "Greeter", quantityNeeded: 1 })];
    proposePlanAutoFillActionMock.mockResolvedValueOnce({
      ok: true,
      proposal: [{ positionId: "pos-1", roleName: "Greeter", profileId: "p-maya", fullName: "Maya Martinez", reasons: [] }],
    });
    applyPlanAutoFillActionMock.mockResolvedValueOnce({ ok: false, error: "Service plan not found." });
    renderBuilder(detail, { pool: [] });

    await user.click(screen.getByRole("button", { name: "Auto-fill plan" }));
    await clickWhenEnabled(user, await screen.findByRole("button", { name: "Apply 1 assignment" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Service plan not found.");
  });
});

describe("ServicePlanBuilder — assign modal skill-based ranking", () => {
  it("shows ranked suggestions with their reasons and assigns from them with a valid shift window", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.plan.serviceTime = "10:00:00";
    detail.positions = [basePosition({ id: "pos-1", roleName: "Worship Leader", quantityNeeded: 1 })];
    suggestVolunteersForPositionActionMock.mockResolvedValueOnce({
      ok: true,
      volunteers: [
        { profileId: "p-aisha", fullName: "Aisha Thompson", eligible: true, ineligibleReasons: [], matchedSkills: 2, requiredSkills: 2, recentShiftCount: 0, lastServedAt: null, roleServedCount: 0, reasons: ["2/2 skills", "Hasn't served yet"] },
        { profileId: "p-elena", fullName: "Elena Martinez", eligible: false, ineligibleReasons: ["blocked"], matchedSkills: 0, requiredSkills: 2, recentShiftCount: 0, lastServedAt: null, roleServedCount: 0, reasons: ["Unavailable that day"] },
      ],
    });
    assignVolunteerActionMock.mockResolvedValue({ ok: true });
    renderBuilder(detail, { pool: [] });

    await user.click(screen.getByRole("button", { name: "Assign" }));

    const suggested = await screen.findByTestId("suggested-volunteers");
    expect(within(suggested).getByText("Aisha Thompson")).toBeInTheDocument();
    expect(within(suggested).getByText("Hasn't served yet")).toBeInTheDocument();
    // Ineligible volunteers are never suggested.
    expect(within(suggested).queryByText("Elena Martinez")).not.toBeInTheDocument();
    expect(suggestVolunteersForPositionActionMock).toHaveBeenCalledWith({ planId: "plan-1", positionId: "pos-1" });

    await user.click(within(suggested).getByRole("button", { name: "Assign" }));

    expect(assignVolunteerActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "p-aisha",
        startsAt: `${detail.plan.serviceDate}T10:00:00`,
        endsAt: `${detail.plan.serviceDate}T12:00:00`,
      }),
    );
  });

  it("auto-fill proposes volunteers, lets the admin remove one, and applies only the rest", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.unfilledCount = 2;
    detail.positions = [basePosition({ id: "pos-1", roleName: "Greeter", quantityNeeded: 2 })];
    proposePlanAutoFillActionMock.mockResolvedValueOnce({
      ok: true,
      proposal: [
        { positionId: "pos-1", roleName: "Greeter", profileId: "p-maya", fullName: "Maya Martinez", reasons: ["Hasn't served yet"] },
        { positionId: "pos-1", roleName: "Greeter", profileId: "p-sam", fullName: "Samuel Price", reasons: ["1 shift in 30 days"] },
      ],
    });
    applyPlanAutoFillActionMock.mockResolvedValueOnce({
      ok: true,
      results: [{ positionId: "pos-1", profileId: "p-maya", ok: true }],
    });
    renderBuilder(detail, { pool: [] });

    await user.click(screen.getByRole("button", { name: "Auto-fill plan" }));
    const proposal = await screen.findByTestId("auto-fill-proposal");
    expect(within(proposal).getByText("Maya Martinez")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Samuel Price from the proposal" }));
    await clickWhenEnabled(user, screen.getByRole("button", { name: "Apply 1 assignment" }));

    expect(applyPlanAutoFillActionMock).toHaveBeenCalledWith({
      planId: "plan-1",
      assignments: [{ positionId: "pos-1", profileId: "p-maya" }],
    });
    expect(await screen.findByText("Assigned")).toBeInTheDocument();
  });

  it("sorts volunteers matching at least one required skill first, with a match-count badge", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.positions = [
      basePosition({
        id: "pos-1",
        requiredSkills: ["Sound", "Lighting"],
        quantityNeeded: 2,
      }),
    ];
    const pool = [
      basePoolEntry({ profileId: "p-1", fullName: "Alice NoSkills", skills: [] }),
      basePoolEntry({ profileId: "p-2", fullName: "Bob OneSkill", skills: ["Sound"] }),
      basePoolEntry({ profileId: "p-3", fullName: "Cara TwoSkills", skills: ["Sound", "Lighting"] }),
    ];
    renderBuilder(detail, { pool });

    await user.click(screen.getByRole("button", { name: "Assign" }));

    const names = screen
      .getAllByText(/NoSkills|OneSkill|TwoSkills/)
      .map((el) => el.textContent);
    // Highest skill match first, then descending match count, unmatched last.
    expect(names).toEqual(["Cara TwoSkills", "Bob OneSkill", "Alice NoSkills"]);

    expect(screen.getByText("2/2 skills")).toBeInTheDocument();
    expect(screen.getByText("1/2 skills")).toBeInTheDocument();
  });

  it("never filters anyone out of the pool, even when a required skill matches zero volunteers", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.positions = [
      basePosition({ id: "pos-1", requiredSkills: ["Drone Piloting"], quantityNeeded: 1 }),
    ];
    const pool = [
      basePoolEntry({ profileId: "p-1", fullName: "Alice NoSkills", skills: [] }),
      basePoolEntry({ profileId: "p-2", fullName: "Bob OtherSkill", skills: ["Sound"] }),
    ];
    renderBuilder(detail, { pool });

    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(screen.getByText("Alice NoSkills")).toBeInTheDocument();
    expect(screen.getByText("Bob OtherSkill")).toBeInTheDocument();
    expect(screen.queryByText(/\d\/\d skills/)).not.toBeInTheDocument();
  });

  it("leaves the pool unranked for a role type with no required skills (Story 1 baseline regression guard)", async () => {
    const user = userEvent.setup();
    const detail = baseDetail();
    detail.positions = [
      basePosition({ id: "pos-1", requiredSkills: [], quantityNeeded: 1 }),
    ];
    const pool = [
      basePoolEntry({ profileId: "p-1", fullName: "Zed LastAlphabetically", skills: ["Sound"] }),
      basePoolEntry({ profileId: "p-2", fullName: "Amy FirstAlphabetically", skills: [] }),
    ];
    renderBuilder(detail, { pool });

    await user.click(screen.getByRole("button", { name: "Assign" }));

    const names = screen
      .getAllByText(/LastAlphabetically|FirstAlphabetically/)
      .map((el) => el.textContent);
    // Pool order preserved exactly as passed in — no sort applied.
    expect(names).toEqual(["Zed LastAlphabetically", "Amy FirstAlphabetically"]);
    expect(screen.queryByText(/\d\/\d skills/)).not.toBeInTheDocument();
  });
});
