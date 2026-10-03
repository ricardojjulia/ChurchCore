import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { COUNCIL_SEATS, SYNTHESIS_SYSTEM_PROMPT, seatSystemPrompt, type CouncilSeat } from "./seats";

// Runs the in-app Council (improve-software.md §6): each of the five audit
// seats is a separate model call with its own brief, in parallel, so no
// single response votes as several seats; then one synthesis call drafts
// the recommendation. The owner decides.

export type CouncilStatus = "RATIFIED" | "AMENDED" | "REJECTED";

export type CouncilRun = {
  status: CouncilStatus | null;
  synthesis: string;
  seats: Array<{ id: CouncilSeat["id"]; name: string; review: string; recommendation: CouncilStatus | null }>;
};

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

const STATUS = "(RATIFIED|AMENDED|REJECTED)";
const SEAT_MARKER = new RegExp(`^Seat recommendation:\\s*${STATUS}\\s*$`, "i");
const SYNTHESIS_MARKER = new RegExp(`^Status:\\s*${STATUS}\\s*$`, "i");

/**
 * The status on one required line, or null when that line isn't the marker.
 * Only that line is read, so a status quoted elsewhere (from the proposal,
 * the register or a seat) can't stand in for a missing one.
 */
export function parseStatus(text: string, where: "first" | "last"): CouncilStatus | null {
  // Markdown emphasis around the marker ("**Status: AMENDED**") is tolerated.
  const lines = text.split("\n").map((line) => line.replace(/^[\s*_#>]+|[\s*_]+$/g, "")).filter(Boolean);
  const line = where === "first" ? lines[0] : lines[lines.length - 1];
  const match = line?.match(where === "first" ? SYNTHESIS_MARKER : SEAT_MARKER);
  return match ? (match[1].toUpperCase() as CouncilStatus) : null;
}

export async function runCouncil(input: {
  client: Pick<Anthropic, "messages">;
  model: string;
  /** The proposal under review, PII-scrubbed. */
  proposal: string;
  /** HQ's register, as text, PII-free. */
  register: string;
}): Promise<CouncilRun> {
  const subject = `PROPOSAL UNDER REVIEW:\n${input.proposal}\n\nHQ REGISTER (context):\n${input.register}`;

  const seats = await Promise.all(
    COUNCIL_SEATS.map(async (seat) => {
      const message = await input.client.messages.create({
        model: input.model,
        max_tokens: 900,
        system: seatSystemPrompt(seat),
        messages: [{ role: "user", content: subject }],
      });
      const review = textOf(message);
      return {
        id: seat.id,
        name: seat.name,
        review,
        recommendation: parseStatus(review, "last"),
      };
    }),
  );

  const reviews = seats.map((seat) => `=== ${seat.name} ===\n${seat.review}`).join("\n\n");
  const synthesisMessage = await input.client.messages.create({
    model: input.model,
    max_tokens: 1200,
    system: SYNTHESIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${subject}\n\nSEAT REVIEWS:\n${reviews}` }],
  });
  const synthesis = textOf(synthesisMessage);
  return { status: parseStatus(synthesis, "first"), synthesis, seats };
}
