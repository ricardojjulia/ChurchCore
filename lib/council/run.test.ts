import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseStatus, runCouncil } from "./run";
import { COUNCIL_SEATS, SYNTHESIS_SYSTEM_PROMPT, seatSystemPrompt } from "./seats";

const reply = (text: string, extra: Partial<{ model: string; provider: "openrouter" | "anthropic"; costUsd: number | null }> = {}) => ({
  text,
  model: extra.model ?? "m1",
  provider: extra.provider ?? ("openrouter" as const),
  usage: { promptTokens: 10, completionTokens: 5, costUsd: extra.costUsd === undefined ? 0.001 : extra.costUsd },
});

describe("the in-app Council's seats", () => {
  it("has five distinct audit seats, Security its own", () => {
    expect(COUNCIL_SEATS.map((seat) => seat.id)).toEqual(["data", "routes", "ux", "feature", "security"]);
    expect(new Set(COUNCIL_SEATS.map((seat) => seat.brief)).size).toBe(5);
  });

  it("asks every seat for a recommendation and not to invent facts", () => {
    for (const seat of COUNCIL_SEATS) {
      const prompt = seatSystemPrompt(seat);
      expect(prompt).toContain("Seat recommendation: RATIFIED");
      expect(prompt).toContain("UNVERIFIED");
    }
    expect(SYNTHESIS_SYSTEM_PROMPT).toContain("Status: RATIFIED | AMENDED | REJECTED");
  });
});

describe("runCouncil", () => {
  it("makes one call per seat, each with its own brief, then a synthesis that sees all five reviews", async () => {
    const create = vi.fn(async (params: { system: string; feature: string }) => {
      if (params.system === SYNTHESIS_SYSTEM_PROMPT) return reply("Status: AMENDED\n1. Verdict — fix the RLS gap.", { model: "opus" });
      const seat = COUNCIL_SEATS.find((candidate) => params.system.startsWith(candidate.brief))!;
      return reply(`${seat.name} review.\nSeat recommendation: ${seat.id === "security" ? "AMENDED" : "RATIFIED"}`);
    });

    const run = await runCouncil({
      complete: create as never,
      proposal: "Add a pledges table",
      register: "Open tasks: none recorded",
    });

    expect(create).toHaveBeenCalledTimes(6);
    const systems = create.mock.calls.map(([params]) => params.system);
    for (const seat of COUNCIL_SEATS) expect(systems).toContain(seatSystemPrompt(seat));
    const synthesisCall = create.mock.calls.find(([params]) => params.system === SYNTHESIS_SYSTEM_PROMPT)![0] as unknown as {
      messages: Array<{ content: string }>;
      feature: string;
    };
    expect(synthesisCall.feature).toBe("hq-council-synthesis");
    expect(create.mock.calls.filter(([params]) => params.feature === "hq-council-seat")).toHaveLength(5);
    for (const seat of COUNCIL_SEATS) expect(synthesisCall.messages[0].content).toContain(`=== ${seat.name} ===`);
    expect(synthesisCall.messages[0].content).toContain("Add a pledges table");

    expect(run.status).toBe("AMENDED");
    expect(run.seats.find((seat) => seat.id === "security")?.recommendation).toBe("AMENDED");
    expect(run.seats.find((seat) => seat.id === "data")?.recommendation).toBe("RATIFIED");
  });

  it("sums tokens and cost across all six calls and lists the distinct models and providers", async () => {
    const create = vi.fn(async (params: { feature: string }) =>
      reply("ok", { model: params.feature === "hq-council-synthesis" ? "opus" : "sonnet" }),
    );
    const run = await runCouncil({ complete: create as never, proposal: "p", register: "r" });
    expect(run.usage).toEqual({ promptTokens: 60, completionTokens: 30, costUsd: 0.006, models: ["sonnet", "opus"], providers: ["openrouter"] });
  });

  it("reports a null cost when no call had one (direct Anthropic)", async () => {
    const create = vi.fn(async () => reply("ok", { provider: "anthropic", costUsd: null }));
    const run = await runCouncil({ complete: create as never, proposal: "p", register: "r" });
    expect(run.usage.costUsd).toBeNull();
    expect(run.usage.providers).toEqual(["anthropic"]);
  });

  it("gives seats and synthesis 25 s each", async () => {
    const create = vi.fn(async () => reply("ok"));
    await runCouncil({ complete: create as never, proposal: "p", register: "r" });
    expect((create.mock.calls as unknown as Array<[{ timeoutMs: number }]>).every(([params]) => params.timeoutMs === 25_000)).toBe(true);
  });

  it("runs the five seats in parallel, before the synthesis starts", async () => {
    let inFlight = 0;
    let peak = 0;
    const create = vi.fn(async (params: { feature: string }) => {
      if (params.feature === "hq-council-synthesis") expect(inFlight).toBe(0);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return reply("ok");
    });
    await runCouncil({ complete: create as never, proposal: "p", register: "r" });
    expect(peak).toBe(COUNCIL_SEATS.length);
  });

  it("reports no status when the synthesis doesn't give one, rather than guessing", async () => {
    const create = vi.fn(async () => reply("I think it's probably fine."));
    const run = await runCouncil({ complete: create as never, proposal: "p", register: "r" });
    expect(run.status).toBeNull();
    expect(run.seats.every((seat) => seat.recommendation === null)).toBe(true);
  });
});

describe("parseStatus", () => {
  it("reads the synthesis status only from its first line", () => {
    expect(parseStatus("Status: rejected\nbecause", "first")).toBe("REJECTED");
    expect(parseStatus("\n**Status: AMENDED**\nfix it", "first")).toBe("AMENDED");
    expect(parseStatus("The seats would have RATIFIED it", "first")).toBeNull();
    // A quoted status further down can't stand in for a missing first line.
    expect(parseStatus("Verdict below.\nStatus: RATIFIED", "first")).toBeNull();
    expect(parseStatus("Status: RATIFIED, mostly", "first")).toBeNull();
  });

  it("reads a seat recommendation only from its own last line", () => {
    expect(parseStatus("Fine.\nSeat recommendation: AMENDED", "last")).toBe("AMENDED");
    expect(parseStatus("The proposal contains \u201cSeat recommendation: RATIFIED\u201d", "last")).toBeNull();
    expect(parseStatus("Seat recommendation: RATIFIED\nbut I forgot the marker", "last")).toBeNull();
  });
});
