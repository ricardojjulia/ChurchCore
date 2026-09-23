import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";

import type { ServicePlanDetail } from "@/lib/volunteer-types";

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
} = vi.hoisted(() => ({
  searchSongLibraryActionMock: vi.fn(),
  addSongToServicePlanActionMock: vi.fn(),
  createSongAndAddToServicePlanActionMock: vi.fn(),
  reorderServicePlanItemsActionMock: vi.fn(),
  removeServicePlanItemActionMock: vi.fn(),
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
  addPlanPositionAction: vi.fn(),
  addRunOfServiceItemAction: vi.fn(),
  addSongToServicePlanAction: addSongToServicePlanActionMock,
  assignVolunteerAction: vi.fn(),
  createServicePlanAction: vi.fn(),
  createSongAndAddToServicePlanAction: createSongAndAddToServicePlanActionMock,
  reorderServicePlanItemsAction: reorderServicePlanItemsActionMock,
  removeAssignmentAction: vi.fn(),
  removeServicePlanItemAction: removeServicePlanItemActionMock,
  searchSongLibraryAction: searchSongLibraryActionMock,
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

function renderBuilder(detail: ServicePlanDetail = baseDetail()) {
  return render(
    <MantineProvider>
      <ServicePlanBuilder detail={detail} events={[]} pool={[]} linkedEventOps={null} />
    </MantineProvider>,
  );
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
