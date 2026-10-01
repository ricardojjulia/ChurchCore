import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomReportsWorkspace } from "@/components/application/custom-reports-workspace";
import type { ChurchAppSession } from "@/lib/auth";

// Council Review 30: the export used a bare <a download> link, so a failed
// export saved its error (or the sign-in page) as the CSV and showed nothing,
// and the data-source cards were mouse-only.

const session = {
  appContext: { roleId: "pastor", church: { id: "church-1", name: "Grace Church" } },
} as unknown as ChurchAppSession;

function renderWorkspace() {
  return render(
    <MantineProvider>
      <CustomReportsWorkspace session={session} />
    </MantineProvider>,
  );
}

// jsdom has no URL.createObjectURL; stub a subclass rather than mutating the
// real URL, so unstubAllGlobals() restores it untouched.
function stubBlobUrls() {
  const createObjectURL = vi.fn(() => "blob:export");
  class StubURL extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", StubURL);
  return createObjectURL;
}

function stubFetch(response: { status: number; type?: ResponseType; contentType?: string; body?: string }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    type: response.type ?? "basic",
    headers: new Headers(response.contentType ? { "content-type": response.contentType } : {}),
    blob: async () => new Blob([response.body ?? ""]),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CustomReportsWorkspace export", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows an error, and saves nothing, when the export fails", async () => {
    stubFetch({ status: 500, contentType: "application/json" });
    const createObjectURL = stubBlobUrls();
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    expect(await screen.findByText(/couldn't be generated/)).toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("tells a caller without access, rather than saving the error", async () => {
    stubFetch({ status: 403, contentType: "application/json" });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect(await screen.findByText(/don't have access/)).toBeInTheDocument();
  });

  it("saves the CSV when the export succeeds", async () => {
    const fetchMock = stubFetch({ status: 200, contentType: "text/csv; charset=utf-8", body: "id\n1" });
    stubBlobUrls();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/custom?entity=people", { redirect: "manual" });
    expect(screen.queryByText("Export failed")).not.toBeInTheDocument();
  });

  it("is a radio group: Tab reaches only the checked card, arrows move and check", async () => {
    const fetchMock = stubFetch({ status: 500 });
    renderWorkspace();

    const people = screen.getByRole("radio", { name: "People Directory" });
    const giving = screen.getByRole("radio", { name: "Giving & Generosity" });
    const events = screen.getByRole("radio", { name: "Events & Attendance" });
    expect([people, giving, events].map((card) => card.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);

    fireEvent.keyDown(people, { key: "ArrowRight" });
    expect(giving).toHaveAttribute("aria-checked", "true");
    expect(giving).toHaveFocus();
    expect([people, giving, events].map((card) => card.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);

    fireEvent.keyDown(people, { key: "ArrowLeft" });
    expect(events).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(events, { key: "ArrowDown" });
    fireEvent.keyDown(people, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/reports/custom?entity=giving", { redirect: "manual" }),
    );
  });
});
