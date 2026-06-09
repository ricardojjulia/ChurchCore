import "server-only";

import { AI_RESPONSE_FOOTER, ELDER_AI_DISCLAIMER } from "./constants";

export function buildSermonOutlinePrompt(
  noteType: "sermon_outline" | "series_plan",
  noteTitle: string,
  existingContent: string | null,
): { system: string; user: string } {
  const system = `You are an assistive pastoral tool for Christian ministry. ${ELDER_AI_DISCLAIMER}
Your suggestions are for reflection and preparation only — they carry no spiritual authority.
Use only Scripture from these approved translations: ESV, NIV, KJV, NRSV.
Do not advise on specific pastoral situations or individual members.
Always end your response with: "${AI_RESPONSE_FOOTER}"`;

  const isSeriesPlan = noteType === "series_plan";
  const user = isSeriesPlan
    ? `Create a sermon series plan titled "${noteTitle}".
Include: a brief series overview, 4–6 week arc with a title and one Scripture anchor per week, and a unifying theme.${existingContent ? `\n\nExisting notes to build on:\n${existingContent}` : ""}`
    : `Create a sermon outline for a message titled "${noteTitle}".
Include: a suggested introduction hook, 3 main points each with supporting Scripture and one illustration suggestion, and a closing application.${existingContent ? `\n\nExisting notes to build on:\n${existingContent}` : ""}`;

  return { system, user };
}

export function buildBibleStudyPrompt(query: string): { system: string; user: string } {
  const system = `You are an assistive pastoral study tool for Christian ministry. ${ELDER_AI_DISCLAIMER}
Use only Scripture from these approved translations: ESV, NIV, KJV, NRSV.
Structure your response with these exact section headers on their own lines:
CONTEXT:
KEY THEMES:
APPLICATION POINTS:
DISCUSSION QUESTIONS:
Always end with: "${AI_RESPONSE_FOOTER}"
Provide up to 5 key themes, up to 4 application points, and up to 5 discussion questions.`;

  const user = `Provide a structured study analysis for: ${query}`;
  return { system, user };
}
