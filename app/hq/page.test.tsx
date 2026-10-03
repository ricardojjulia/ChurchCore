import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, rpcMock, fromMock, releaseRecords } = vi.hoisted(() => {
  // Holds the hq_* reads open until the test releases them, so the loading
  // state can be observed before the records arrive.
  let release: () => void = () => {};
  const recordsReady = () => new Promise<void>((resolve) => (release = resolve));
  let gate = recordsReady();
  return {
    getSessionMock: vi.fn(),
    rpcMock: vi.fn(),
    fromMock: vi.fn((table: string) => {
      if (table === "profiles") {
        const profileChain = { select: () => profileChain, eq: () => profileChain, maybeSingle: async () => ({ data: null, error: null }) };
        return profileChain;
      }
      const chain = {
        select: () => chain,
        order: async () => {
          await gate;
          return { data: [], error: null };
        },
      };
      return chain;
    }),
    releaseRecords: Object.assign(() => release(), { reset: () => (gate = recordsReady()) }),
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("@/components/application/app-shell", () => ({
  ApplicationShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: getSessionMock }, rpc: rpcMock, from: fromMock }),
}));

import ProjectHQPage from "@/app/hq/page";

const HQ_TABLES = ["hq_tasks", "hq_risks", "hq_decisions", "hq_sessions"];
const hqReads = () => fromMock.mock.calls.filter(([table]) => HQ_TABLES.includes(table));

function renderPage() {
  return render(
    <MantineProvider>
      <ProjectHQPage />
    </MantineProvider>,
  );
}

describe("/hq records loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    releaseRecords.reset();
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "platform-1", email: "staff@example.org" } } } });
  });

  it("shows the loading state from the first render until a platform admin's records arrive, loading each table once", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    renderPage();

    expect(await screen.findByText("Syncing database changes...")).toBeInTheDocument();
    await waitFor(() => expect(hqReads()).toHaveLength(HQ_TABLES.length));

    releaseRecords();
    await waitFor(() => expect(screen.queryByText("Syncing database changes...")).not.toBeInTheDocument());
    expect(hqReads().map(([table]) => table).sort()).toEqual([...HQ_TABLES].sort());
  });

  it("never loads the register for a signed-in user who isn't a platform admin", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    renderPage();

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("is_platform_admin"));
    await waitFor(() => expect(screen.queryByText("Syncing database changes...")).not.toBeInTheDocument());
    expect(hqReads()).toHaveLength(0);
  });
});
