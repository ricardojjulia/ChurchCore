"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  callMinistryAI,
} from "@/lib/ai-ministry/client";
import {
  AI_FEATURES,
  AI_RESPONSE_FOOTER,
} from "@/lib/ai-ministry/constants";
import {
  buildBibleStudyPrompt,
  buildSermonOutlinePrompt,
} from "@/lib/ai-ministry/prompts";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

// ============================================================
// Role guards
// ============================================================

async function requireElderSession(redirectPath: string) {
  const session = await requireChurchSession(redirectPath);
  if (session.appContext.roleId !== "pastor") {
    throw new Error("Elders Discernment Room requires pastor / elder access.");
  }
  return session;
}

async function requireCouncilSession(redirectPath: string) {
  const session = await requireChurchSession(redirectPath);
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin") {
    throw new Error("Pastor Council Forge requires pastor or church-admin access.");
  }
  return session;
}

// Helper: resolve caller's profile id
async function resolveProfileId(
  session: Awaited<ReturnType<typeof requireChurchSession>>,
): Promise<string | null> {
  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `select id from public.profiles where user_id = $1 and church_id = $2 limit 1`,
      [session.userId, churchId],
    );
    return result.rows[0]?.id ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", churchId)
    .maybeSingle();
  return data?.id ?? null;
}

// ============================================================
// Input types
// ============================================================

export type CreateDiscernmentSessionInput = {
  title: string;
  description: string | null;
  date: string | null;
};

export type UpdateDiscernmentSessionStatusInput = {
  sessionId: string;
  status: "open" | "voting" | "closed" | "prayer";
  outcome?: string | null;
};

export type AddPrayerRequestInput = {
  sessionId: string | null;
  title: string;
  description: string | null;
  isAnonymous: boolean;
};

export type MarkPrayedInput = {
  prayerRequestId: string;
  churchId: string;
};

export type AddElderNoteInput = {
  profileId: string | null; // subject of the note (optional)
  content: string;
  isConfidential: boolean;
};

export type GenerateWisdomPromptInput = {
  sessionId: string;
  topic: string;
};

export type CreateCouncilNoteInput = {
  title: string;
  content: string | null;
  noteType:
    | "general"
    | "sermon_outline"
    | "series_plan"
    | "council_minutes"
    | "sabbath_reflection";
};

export type GenerateSermonOutlineInput = {
  noteId: string;
  noteType: "sermon_outline" | "series_plan";
  noteTitle: string;
  existingContent: string | null;
};

export type BibleStudySections = {
  context: string;
  keyThemes: string[];
  applicationPoints: string[];
  discussionQuestions: string[];
  footer: string;
};

export type GenerateBibleStudyInput = {
  query: string;
};

export type UpdateCouncilNoteInput = {
  noteId: string;
  title: string;
  content: string | null;
};

// ============================================================
// Validation
// ============================================================

function validateDiscernmentSessionInput(
  input: CreateDiscernmentSessionInput,
): string | null {
  if (!input.title.trim()) return "Session title is required.";
  if (input.title.trim().length > 300) return "Session title is too long.";
  if (input.description && input.description.trim().length > 2000) {
    return "Description is too long.";
  }
  return null;
}

function validatePrayerRequestInput(input: AddPrayerRequestInput): string | null {
  if (!input.title.trim()) return "Prayer request title is required.";
  if (input.title.trim().length > 300) return "Title is too long.";
  if (input.description && input.description.trim().length > 2000) {
    return "Description is too long.";
  }
  return null;
}

function validateElderNoteInput(input: AddElderNoteInput): string | null {
  if (!input.content.trim()) return "Note content is required.";
  if (input.content.trim().length > 5000) return "Note is too long.";
  return null;
}

function validateWisdomPromptInput(input: GenerateWisdomPromptInput): string | null {
  if (!input.sessionId.trim()) return "Session is required.";
  if (!input.topic.trim()) return "Topic is required.";
  if (input.topic.trim().length > 500) return "Topic is too long.";
  return null;
}

function validateCouncilNoteInput(
  input: CreateCouncilNoteInput | UpdateCouncilNoteInput,
): string | null {
  if (!("title" in input && input.title.trim())) return "Title is required.";
  if ("title" in input && input.title.trim().length > 300) return "Title is too long.";
  if ("content" in input && input.content && input.content.trim().length > 50000) {
    return "Content is too long.";
  }
  return null;
}

const ALLOWED_NOTE_TYPES = new Set([
  "general",
  "sermon_outline",
  "series_plan",
  "council_minutes",
  "sabbath_reflection",
]);

const ALLOWED_SESSION_STATUSES = new Set(["open", "voting", "closed", "prayer"]);

// ============================================================
// createDiscernmentSessionAction
// ============================================================
export async function createDiscernmentSessionAction(
  input: CreateDiscernmentSessionInput,
) {
  const validationError = validateDiscernmentSessionInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireElderSession("/app/pastor");
  const profileId = await resolveProfileId(session);
  const churchId = session.appContext.church.id;
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  const date = input.date ? new Date(input.date).toISOString() : null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/elders/discernment");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.discernment_sessions
          (church_id, title, description, date, created_by)
        values ($1, $2, $3, $4, $5)
      `,
      [churchId, title, description, date, profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("discernment_sessions").insert({
      church_id: churchId,
      title,
      description,
      date,
      created_by: profileId,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/elders/discernment");
}

// ============================================================
// updateDiscernmentSessionStatusAction
// ============================================================
export async function updateDiscernmentSessionStatusAction(
  input: UpdateDiscernmentSessionStatusInput,
) {
  if (!input.sessionId.trim()) throw new Error("Session is required.");
  if (!ALLOWED_SESSION_STATUSES.has(input.status)) {
    throw new Error("Invalid session status.");
  }

  const session = await requireElderSession("/app/elders/discernment");
  const churchId = session.appContext.church.id;
  const outcome = input.outcome?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/elders/discernment");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.discernment_sessions
        set status = $1, outcome = coalesce($2, outcome), updated_at = timezone('utc', now())
        where id = $3 and church_id = $4
      `,
      [input.status, outcome, input.sessionId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("discernment_sessions")
      .update({ status: input.status, outcome })
      .eq("id", input.sessionId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/elders/discernment");
  revalidatePath(`/app/elders/discernment/${input.sessionId}`);
}

// ============================================================
// addPrayerRequestAction
// ============================================================
export async function addPrayerRequestAction(input: AddPrayerRequestInput) {
  const validationError = validatePrayerRequestInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireElderSession("/app/elders/discernment");
  const profileId = await resolveProfileId(session);
  const churchId = session.appContext.church.id;
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  const sessionId = input.sessionId?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/elders/discernment");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.prayer_requests
          (church_id, discernment_session_id, requested_by, title, description, is_anonymous)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        churchId,
        sessionId,
        input.isAnonymous ? null : profileId,
        title,
        description,
        input.isAnonymous,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("prayer_requests").insert({
      church_id: churchId,
      discernment_session_id: sessionId,
      requested_by: input.isAnonymous ? null : profileId,
      title,
      description,
      is_anonymous: input.isAnonymous,
    });
    if (error) throw new Error(error.message);
  }

  if (sessionId) {
    revalidatePath(`/app/elders/discernment/${sessionId}`);
  }
  revalidatePath("/app/elders/discernment");
}

// ============================================================
// markPrayedAction
// Records an "I Prayed" acknowledgement for a prayer request.
// Idempotent — the unique constraint prevents duplicates.
// The prayed_count on prayer_requests is updated by DB trigger.
// ============================================================
export async function markPrayedAction(input: MarkPrayedInput) {
  if (!input.prayerRequestId.trim()) throw new Error("Prayer request is required.");

  const session = await requireElderSession("/app/elders/discernment");
  const profileId = await resolveProfileId(session);
  const churchId = session.appContext.church.id;

  if (!profileId) throw new Error("Profile not found.");

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    // on conflict do nothing — idempotent
    await queryTenantLocalDb(
      `
        insert into public.prayer_acknowledgements
          (church_id, prayer_request_id, profile_id)
        values ($1, $2, $3)
        on conflict (prayer_request_id, profile_id) do nothing
      `,
      [churchId, input.prayerRequestId, profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("prayer_acknowledgements").upsert(
      {
        church_id: churchId,
        prayer_request_id: input.prayerRequestId,
        profile_id: profileId,
      },
      { onConflict: "prayer_request_id,profile_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }

  // Revalidate parent session — we don't know sessionId here so revalidate the room
  revalidatePath("/app/elders/discernment");
}

// ============================================================
// addElderNoteAction
// ============================================================
export async function addElderNoteAction(input: AddElderNoteInput) {
  const validationError = validateElderNoteInput(input);
  if (validationError) throw new Error(validationError);

  const session = await requireElderSession("/app/elders/discernment");
  const profileId = await resolveProfileId(session);
  const churchId = session.appContext.church.id;

  if (!profileId) throw new Error("Profile not found.");

  const content = input.content.trim();
  const subjectProfileId = input.profileId?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/elders/discernment");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.elder_notes
          (church_id, profile_id, created_by, content, is_confidential)
        values ($1, $2, $3, $4, $5)
      `,
      [churchId, subjectProfileId, profileId, content, input.isConfidential],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("elder_notes").insert({
      church_id: churchId,
      profile_id: subjectProfileId,
      created_by: profileId,
      content,
      is_confidential: input.isConfidential,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/elders/discernment");
}

// ============================================================
// generateWisdomPromptAction
//
// STUB — returns a structured response from the approved
// theological guardrail prompt template.
//
// ── APPROVED GUARDRAIL PROMPT TEMPLATE ──────────────────────
// (Store in prompt library before enabling live LLM calls)
//
// SYSTEM:
//   You are a reverent, scripturally-grounded research assistant
//   for a Christian church leadership team. Your role is PURELY
//   ASSISTIVE. You must NEVER:
//     - Give binding advice or recommendations
//     - Make decisions on behalf of the leadership
//     - Suggest that your output carries spiritual authority
//     - Reference sources outside the approved Bible translations
//       (ESV, NIV, KJV, NRSV) and approved Reformed/Evangelical
//       commentaries
//   Every response MUST begin with:
//     "This is an assistive tool only. It never replaces prayer,
//      Scripture study, or human pastoral discernment."
//   Then surface:
//     1. Up to 5 relevant Scripture references with brief context
//     2. Up to 3 theological reflection questions for the elders
//     3. One brief note on historical church precedent if applicable
//   Do not summarise, evaluate, or advise on the specific
//   situation. Surface resources only.
//
// USER:
//   Church context: {{church_name}}
//   Session topic: {{topic}}
//   Elders are seeking: {{seeking}}
//   Please provide relevant Scriptures and reflection prompts.
// ─────────────────────────────────────────────────────────────
//
// When a private LLM endpoint is available, replace the stub
// response with: callApprovedLlmEndpoint(WISDOM_PROMPT, vars)
// ============================================================
export async function generateWisdomPromptAction(
  input: GenerateWisdomPromptInput,
): Promise<{
  disclaimer: string;
  scriptures: Array<{ reference: string; context: string }>;
  reflectionQuestions: string[];
  historicalNote: string | null;
}> {
  const validationError = validateWisdomPromptInput(input);
  if (validationError) throw new Error(validationError);

  // Role guard — only elders can request wisdom prompts
  await requireElderSession("/app/elders/discernment");

  // ── STUB RESPONSE ──────────────────────────────────────────
  // Replace with live LLM call when endpoint is provisioned.
  // All outputs must match the format produced by the approved
  // prompt template above.
  const disclaimer =
    "This is an assistive tool only. It never replaces prayer, Scripture study, or human pastoral discernment. The references below are offered for reflection — not as binding counsel.";

  const topic = input.topic.trim().toLowerCase();

  // Curated stub — topic-keyed Scripture suggestions
  const scriptureBank: Record<
    string,
    Array<{ reference: string; context: string }>
  > = {
    unity: [
      {
        reference: "Psalm 133:1",
        context: "How good and pleasant it is when God's people live together in unity.",
      },
      {
        reference: "John 17:20–23",
        context:
          "Jesus prays for the unity of all believers as a witness to the world.",
      },
      {
        reference: "Ephesians 4:3",
        context: "Make every effort to keep the unity of the Spirit through the bond of peace.",
      },
    ],
    leadership: [
      {
        reference: "1 Timothy 3:1–7",
        context: "Qualifications for overseers — above reproach, hospitable, able to teach.",
      },
      {
        reference: "Mark 10:43–45",
        context: "Whoever wants to be great among you must be your servant.",
      },
      {
        reference: "Proverbs 11:14",
        context: "Where there is no guidance, a people falls, but in an abundance of counselors there is safety.",
      },
    ],
    discipline: [
      {
        reference: "Matthew 18:15–17",
        context: "Jesus outlines a three-stage process for addressing sin in the community.",
      },
      {
        reference: "Galatians 6:1",
        context:
          "Restore gently — carried out in a spirit of gentleness with awareness of one's own vulnerability.",
      },
      {
        reference: "2 Thessalonians 3:14–15",
        context:
          "Do not regard such a person as an enemy, but warn them as a fellow believer.",
      },
    ],
  };

  const defaultScriptures = [
    {
      reference: "James 1:5",
      context: "If any of you lacks wisdom, let him ask of God, who gives generously.",
    },
    {
      reference: "Proverbs 3:5–6",
      context: "Trust in the Lord with all your heart and lean not on your own understanding.",
    },
    {
      reference: "Psalm 25:4–5",
      context: "Show me your ways, Lord — guide me in your truth and teach me.",
    },
  ];

  const topicKey = Object.keys(scriptureBank).find((k) => topic.includes(k));
  const scriptures = topicKey ? scriptureBank[topicKey] : defaultScriptures;

  const reflectionQuestions = [
    "How does this passage speak to the specific situation before us today?",
    "Where might our own assumptions or preferences be influencing our discernment?",
    "What would a posture of prayer and patience look like as we consider this together?",
  ];

  return {
    disclaimer,
    scriptures,
    reflectionQuestions,
    historicalNote:
      "The early church councils (Acts 15) modelled communal discernment through prayer, Scripture, and Spirit-led consensus rather than majority vote. Consider allowing space for unanimity before moving to any formal decision.",
  };
}

// ============================================================
// createCouncilNoteAction
// ============================================================
export async function createCouncilNoteAction(input: CreateCouncilNoteInput) {
  const validationError = validateCouncilNoteInput(input);
  if (validationError) throw new Error(validationError);

  if (!ALLOWED_NOTE_TYPES.has(input.noteType)) {
    throw new Error("Invalid note type.");
  }

  const session = await requireCouncilSession("/app/council/forge");
  const profileId = await resolveProfileId(session);
  const churchId = session.appContext.church.id;
  const title = input.title.trim();
  const content = input.content?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/council/forge");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        insert into public.council_notes
          (church_id, title, content, note_type, created_by, last_edited_by)
        values ($1, $2, $3, $4, $5, $5)
      `,
      [churchId, title, content, input.noteType, profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.from("council_notes").insert({
      church_id: churchId,
      title,
      content,
      note_type: input.noteType,
      created_by: profileId,
      last_edited_by: profileId,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/council/forge");
}

// ============================================================
// generateSermonOutlineAction
//
// Calls the Anthropic API to generate a sermon outline or series
// plan for a council note. Requires pastor or church-admin role.
// All AI interactions are audit-logged in ai_interactions.
// ============================================================
export async function generateSermonOutlineAction(
  input: GenerateSermonOutlineInput,
): Promise<{ ok: true; outline: string } | { ok: false; error: string }> {
  const session = await requireCouncilSession("/app/council/forge");
  const { noteType, noteTitle, existingContent } = input;

  if (!["sermon_outline", "series_plan"].includes(noteType)) {
    return {
      ok: false,
      error: "AI Suggest is only available for sermon outlines and series plans.",
    };
  }
  if (!noteTitle || noteTitle.trim().length === 0) {
    return { ok: false, error: "Note title is required to generate suggestions." };
  }
  if (noteTitle.length > 300) {
    return { ok: false, error: "Note title is too long." };
  }

  try {
    const prompt = buildSermonOutlinePrompt(noteType, noteTitle.trim(), existingContent);
    const outline = await callMinistryAI(
      prompt,
      AI_FEATURES.SERMON_PLANNING,
      session.appContext.church.id,
      session.profile.id,
    );
    return { ok: true, outline };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not configured")) {
      return { ok: false, error: "AI features are not configured in this environment." };
    }
    return {
      ok: false,
      error: "The AI assistant is temporarily unavailable. Please try again.",
    };
  }
}

// ============================================================
// generateBibleStudyAnswerAction
//
// Calls the Anthropic API for a structured Bible study analysis.
// Requires pastor role (elder-only — church_admin is denied).
// Parses the structured response into BibleStudySections.
// All AI interactions are audit-logged in ai_interactions.
// ============================================================
export async function generateBibleStudyAnswerAction(
  input: GenerateBibleStudyInput,
): Promise<
  { ok: true; sections: BibleStudySections } | { ok: false; error: string; rawText?: string }
> {
  // requireElderSession enforces pastor-only and returns the session
  const session = await requireElderSession("/app/pastor/bible-study");

  const { query } = input;
  if (!query || query.trim().length === 0) {
    return { ok: false, error: "Please enter a passage or topic." };
  }
  if (query.length > 500) {
    return { ok: false, error: "Query is too long. Please limit to 500 characters." };
  }

  try {
    const prompt = buildBibleStudyPrompt(query.trim());
    const raw = await callMinistryAI(
      prompt,
      AI_FEATURES.BIBLE_STUDY,
      session.appContext.church.id,
      session.profile.id,
    );
    const sections = parseBibleStudyResponse(raw);
    return { ok: true, sections };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not configured")) {
      return { ok: false, error: "AI features are not configured in this environment." };
    }
    return {
      ok: false,
      error: "The AI assistant is temporarily unavailable. Please try again.",
    };
  }
}

function parseBibleStudyResponse(text: string): BibleStudySections {
  const extract = (header: string, nextHeader?: string): string => {
    const start = text.indexOf(header);
    if (start === -1) return "";
    const contentStart = start + header.length;
    const end = nextHeader ? text.indexOf(nextHeader) : text.length;
    return text.slice(contentStart, end === -1 ? text.length : end).trim();
  };

  const contextText = extract("CONTEXT:", "KEY THEMES:");
  const themesText = extract("KEY THEMES:", "APPLICATION POINTS:");
  const appText = extract("APPLICATION POINTS:", "DISCUSSION QUESTIONS:");
  const questionsText = extract("DISCUSSION QUESTIONS:");

  const toList = (s: string): string[] =>
    s
      .split("\n")
      .map((l) => l.replace(/^[-•*\d.]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 5);

  return {
    context: contextText || text,
    keyThemes: toList(themesText).slice(0, 5),
    applicationPoints: toList(appText).slice(0, 4),
    discussionQuestions: toList(questionsText).slice(0, 5),
    footer: AI_RESPONSE_FOOTER,
  };
}

// ============================================================
// updateCouncilNoteAction
// ============================================================
export async function updateCouncilNoteAction(input: UpdateCouncilNoteInput) {
  const validationError = validateCouncilNoteInput(input);
  if (validationError) throw new Error(validationError);

  if (!input.noteId.trim()) throw new Error("Note is required.");

  const session = await requireCouncilSession("/app/council/forge");
  const profileId = await resolveProfileId(session);
  const churchId = session.appContext.church.id;
  const title = input.title.trim();
  const content = input.content?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    revalidatePath("/app/council/forge");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    // The DB trigger bumps version when content or title changes
    await queryTenantLocalDb(
      `
        update public.council_notes
        set title = $1, content = $2, last_edited_by = $3, updated_at = timezone('utc', now())
        where id = $4 and church_id = $5
      `,
      [title, content, profileId, input.noteId, churchId],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("council_notes")
      .update({ title, content, last_edited_by: profileId })
      .eq("id", input.noteId)
      .eq("church_id", churchId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/app/council/forge");
}
