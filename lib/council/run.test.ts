import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseStatus, runCouncil } from "./run";
import { COUNCIL_SEATS, SYNTHESIS_SYSTEM_PROMPT, seatSystemPrompt } from "./seats";

const reply = (text: string) => ({ content: [{ type: "text", text }] });

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
    const create = vi.fn(async (params: { system: string }) => {
      if (params.system === SYNTHESIS_SYSTEM_PROMPT) return reply("Status: AMENDED\n1. Verdict — fix the RLS gap.");
      const seat = COUNCIL_SEATS.find((candidate) => params.system.startsWith(candidate.brief))!;
      return reply(`${seat.name} review.\nSeat recommendation: ${seat.id === "security" ? "AMENDED" : "RATIFIED"}`);
    });

    const run = await runCouncil({
      client: { messages: { create } } as never,
      model: "claude-test",
      proposal: "Add a pledges table",
      register: "Open tasks: none recorded",
    });

    expect(create).toHaveBeenCalledTimes(6);
    const systems = create.mock.calls.map(([params]) => params.system);
    for (const seat of COUNCIL_SEATS) expect(systems).toContain(seatSystemPrompt(seat));
    const synthesisCall = create.mock.calls.find(([params]) => params.system === SYNTHESIS_SYSTEM_PROMPT)![0] as unknown as {
      messages: Array<{ content: string }>;
      model: string;
    };
    expect(synthesisCall.model).toBe("claude-test");
    for (const seat of COUNCIL_SEATS) expect(synthesisCall.messages[0].content).toContain(`=== ${seat.name} ===`);
    expect(synthesisCall.messages[0].content).toContain("Add a pledges table");

    expect(run.status).toBe("AMENDED");
    expect(run.seats.find((seat) => seat.id === "security")?.recommendation).toBe("AMENDED");
    expect(run.seats.find((seat) => seat.id === "data")?.recommendation).toBe("RATIFIED");
  });

  it("reports no status when the synthesis doesn't give one, rather than guessing", async () => {
    const create = vi.fn(async () => reply("I think it's probably fine."));
    const run = await runCouncil({ client: { messages: { create } } as never, model: "m", proposal: "p", register: "r" });
    expect(run.status).toBeNull();
    expect(run.seats.every((seat) => seat.recommendation === null)).toBe(true);
  });
});

describe("parseStatus", () => {
  it("only reads a status on its own Status: line", () => {
    const marker = /^\s*Status:\s*(RATIFIED|AMENDED|REJECTED)/im;
    expect(parseStatus("Status: rejected\nbecause", marker)).toBe("REJECTED");
    expect(parseStatus("The seats would have RATIFIED it", marker)).toBeNull();
  });
});
