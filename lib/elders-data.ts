import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type {
  CouncilForgeData,
  CouncilNoteType,
  DiscernmentRoomData,
  DiscernmentSession,
  DiscernmentSessionDetail,
  ElderNote,
  PrayerRequest,
} from "@/lib/elders-types";

// ============================================================
// Access guard — both loaders enforce pastor role.
// The DB-layer RLS is the authoritative guard; this is a
// defence-in-depth check at the application layer.
// ============================================================
function assertPastorRole(session: ChurchAppSession): void {
  if (session.appContext.roleId !== "pastor") {
    throw new Error("Elders Discernment Room requires pastor / elder access.");
  }
}

function assertCouncilRole(session: ChurchAppSession): void {
  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin") {
    throw new Error("Pastor Council Forge requires pastor or church-admin access.");
  }
}

// ============================================================
// getDiscernmentRoomData
// Returns: open/active sessions list + recent elder notes.
// ============================================================
export async function getDiscernmentRoomData(
  session: ChurchAppSession,
): Promise<DiscernmentRoomData> {
  assertPastorRole(session);

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { sessions: [], recentNotes: [] };
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const sessionsResult = await queryTenantLocalDb<{
      id: string;
      title: string;
      description: string | null;
      date: string | null;
      status: string;
      outcome: string | null;
      created_by_name: string | null;
      created_at: string;
      prayer_request_count: string;
    }>(
      `
        select
          ds.id,
          ds.title,
          ds.description,
          ds.date,
          ds.status,
          ds.outcome,
          p.full_name as created_by_name,
          ds.created_at,
          (
            select count(*)::text
            from public.prayer_requests pr
            where pr.discernment_session_id = ds.id
          ) as prayer_request_count
        from public.discernment_sessions ds
        left join public.profiles p on p.id = ds.created_by
        where ds.church_id = $1
          and ds.status    != 'closed'
        order by ds.date asc nulls last, ds.created_at desc
        limit 20
      `,
      [churchId],
    );

    const notesResult = await queryTenantLocalDb<{
      id: string;
      profile_id: string | null;
      subject_name: string | null;
      content: string;
      is_confidential: boolean;
      created_by_name: string | null;
      created_at: string;
    }>(
      `
        select
          en.id,
          en.profile_id,
          sp.full_name as subject_name,
          en.content,
          en.is_confidential,
          cp.full_name as created_by_name,
          en.created_at
        from public.elder_notes en
        left join public.profiles sp on sp.id = en.profile_id
        left join public.profiles cp on cp.id = en.created_by
        where en.church_id = $1
        order by en.created_at desc
        limit 10
      `,
      [churchId],
    );

    return {
      sessions: sessionsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        date: row.date,
        status: row.status as DiscernmentSession["status"],
        outcome: row.outcome,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        prayerRequestCount: parseInt(row.prayer_request_count, 10) || 0,
      })),
      recentNotes: notesResult.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        subjectName: row.subject_name,
        content: row.content,
        isConfidential: row.is_confidential,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
      })),
    };
  }

  // Supabase path
  const supabase = await createTenantServerClient();

  const [sessionsRes, notesRes] = await Promise.all([
    supabase
      .from("discernment_sessions")
      .select(
        "id, title, description, date, status, outcome, created_at, profiles(full_name), prayer_requests(id)",
      )
      .eq("church_id", churchId)
      .neq("status", "closed")
      .order("date", { ascending: true, nullsFirst: false })
      .limit(20),
    supabase
      .from("elder_notes")
      .select(
        "id, profile_id, content, is_confidential, created_at, subject:profile_id(full_name), author:created_by(full_name)",
      )
      .eq("church_id", churchId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const sessions: DiscernmentSession[] = (sessionsRes.data ?? []).map((row) => {
    const creator = row.profiles as unknown as { full_name: string } | null;
    const prayerRows = row.prayer_requests as unknown as Array<unknown> | null;
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      date: row.date ?? null,
      status: row.status as DiscernmentSession["status"],
      outcome: row.outcome ?? null,
      createdByName: creator?.full_name ?? null,
      createdAt: row.created_at,
      prayerRequestCount: Array.isArray(prayerRows) ? prayerRows.length : 0,
    };
  });

  const notes: ElderNote[] = (notesRes.data ?? []).map((row) => {
    const subject = row.subject as unknown as { full_name: string } | null;
    const author = row.author as unknown as { full_name: string } | null;
    return {
      id: row.id,
      profileId: row.profile_id ?? null,
      subjectName: subject?.full_name ?? null,
      content: row.content,
      isConfidential: row.is_confidential,
      createdByName: author?.full_name ?? null,
      createdAt: row.created_at,
    };
  });

  return { sessions, recentNotes: notes };
}

// ============================================================
// getDiscernmentSessionDetail
// Returns a single session with its prayer wall and elder notes.
// ============================================================
export async function getDiscernmentSessionDetail(
  session: ChurchAppSession,
  sessionId: string,
): Promise<DiscernmentSessionDetail | null> {
  assertPastorRole(session);

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return null;
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    // Session row
    const sessionResult = await queryTenantLocalDb<{
      id: string;
      title: string;
      description: string | null;
      date: string | null;
      status: string;
      outcome: string | null;
      created_by_name: string | null;
      created_at: string;
    }>(
      `
        select
          ds.id, ds.title, ds.description, ds.date, ds.status, ds.outcome,
          p.full_name as created_by_name, ds.created_at
        from public.discernment_sessions ds
        left join public.profiles p on p.id = ds.created_by
        where ds.id = $1 and ds.church_id = $2
        limit 1
      `,
      [sessionId, churchId],
    );

    const sessionRow = sessionResult.rows[0];
    if (!sessionRow) return null;

    // Current user's profile id for has_prayed check
    const profileResult = await queryTenantLocalDb<{ id: string }>(
      `select id from public.profiles where user_id = $1 and church_id = $2 limit 1`,
      [session.userId, churchId],
    );
    const myProfileId = profileResult.rows[0]?.id ?? null;

    // Prayer requests
    const prayerResult = await queryTenantLocalDb<{
      id: string;
      title: string;
      description: string | null;
      is_anonymous: boolean;
      requested_by_name: string | null;
      prayed_count: string;
      has_prayed: string;
      created_at: string;
    }>(
      `
        select
          pr.id,
          pr.title,
          pr.description,
          pr.is_anonymous,
          case when pr.is_anonymous then null else p.full_name end as requested_by_name,
          pr.prayed_count,
          (
            select count(*)::text
            from public.prayer_acknowledgements pa
            where pa.prayer_request_id = pr.id
              and pa.profile_id = $3
          ) as has_prayed,
          pr.created_at
        from public.prayer_requests pr
        left join public.profiles p on p.id = pr.requested_by
        where pr.discernment_session_id = $1
          and pr.church_id              = $2
        order by pr.created_at asc
      `,
      [sessionId, churchId, myProfileId ?? "00000000-0000-0000-0000-000000000000"],
    );

    // Elder notes for this session's subjects
    const notesResult = await queryTenantLocalDb<{
      id: string;
      profile_id: string | null;
      subject_name: string | null;
      content: string;
      is_confidential: boolean;
      created_by_name: string | null;
      created_at: string;
    }>(
      `
        select
          en.id, en.profile_id, sp.full_name as subject_name,
          en.content, en.is_confidential,
          cp.full_name as created_by_name, en.created_at
        from public.elder_notes en
        left join public.profiles sp on sp.id = en.profile_id
        left join public.profiles cp on cp.id = en.created_by
        where en.church_id = $1
        order by en.created_at desc
        limit 20
      `,
      [churchId],
    );

    return {
      session: {
        id: sessionRow.id,
        title: sessionRow.title,
        description: sessionRow.description,
        date: sessionRow.date,
        status: sessionRow.status as DiscernmentSession["status"],
        outcome: sessionRow.outcome,
        createdByName: sessionRow.created_by_name,
        createdAt: sessionRow.created_at,
        prayerRequestCount: prayerResult.rows.length,
      },
      prayerRequests: prayerResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        isAnonymous: row.is_anonymous,
        requestedByName: row.requested_by_name,
        prayedCount: parseInt(row.prayed_count, 10) || 0,
        hasPrayed: parseInt(row.has_prayed, 10) > 0,
        createdAt: row.created_at,
      })),
      elderNotes: notesResult.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        subjectName: row.subject_name,
        content: row.content,
        isConfidential: row.is_confidential,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
      })),
    };
  }

  // Supabase path
  const supabase = await createTenantServerClient();

  const { data: sessionRow } = await supabase
    .from("discernment_sessions")
    .select("id, title, description, date, status, outcome, created_at, profiles(full_name)")
    .eq("id", sessionId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (!sessionRow) return null;

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", churchId)
    .maybeSingle();
  const myProfileId = myProfile?.id ?? null;

  const [prayerRes, notesRes, acksRes] = await Promise.all([
    supabase
      .from("prayer_requests")
      .select(
        "id, title, description, is_anonymous, prayed_count, created_at, profiles(full_name)",
      )
      .eq("discernment_session_id", sessionId)
      .eq("church_id", churchId)
      .order("created_at", { ascending: true }),
    supabase
      .from("elder_notes")
      .select(
        "id, profile_id, content, is_confidential, created_at, subject:profile_id(full_name), author:created_by(full_name)",
      )
      .eq("church_id", churchId)
      .order("created_at", { ascending: false })
      .limit(20),
    myProfileId
      ? supabase
          .from("prayer_acknowledgements")
          .select("prayer_request_id")
          .eq("profile_id", myProfileId)
          .eq("church_id", churchId)
      : { data: [] as Array<{ prayer_request_id: string }> },
  ]);

  const acknowledgedIds = new Set(
    (acksRes.data ?? []).map((r) => r.prayer_request_id),
  );

  const prayerRequests: PrayerRequest[] = (prayerRes.data ?? []).map((row) => {
    const requester = row.profiles as unknown as { full_name: string } | null;
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      isAnonymous: row.is_anonymous,
      requestedByName: row.is_anonymous ? null : (requester?.full_name ?? null),
      prayedCount: (row.prayed_count as unknown as number) ?? 0,
      hasPrayed: acknowledgedIds.has(row.id),
      createdAt: row.created_at,
    };
  });

  const elderNotes: ElderNote[] = (notesRes.data ?? []).map((row) => {
    const subject = row.subject as unknown as { full_name: string } | null;
    const author = row.author as unknown as { full_name: string } | null;
    return {
      id: row.id,
      profileId: row.profile_id ?? null,
      subjectName: subject?.full_name ?? null,
      content: row.content,
      isConfidential: row.is_confidential,
      createdByName: author?.full_name ?? null,
      createdAt: row.created_at,
    };
  });

  const creator = sessionRow.profiles as unknown as { full_name: string } | null;

  return {
    session: {
      id: sessionRow.id,
      title: sessionRow.title,
      description: sessionRow.description ?? null,
      date: sessionRow.date ?? null,
      status: sessionRow.status as DiscernmentSession["status"],
      outcome: sessionRow.outcome ?? null,
      createdByName: creator?.full_name ?? null,
      createdAt: sessionRow.created_at,
      prayerRequestCount: prayerRequests.length,
    },
    prayerRequests,
    elderNotes,
  };
}

// ============================================================
// getCouncilForgeData — Pastor Council Forge note list
// ============================================================
export async function getCouncilForgeData(
  session: ChurchAppSession,
): Promise<CouncilForgeData> {
  assertCouncilRole(session);

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return { notes: [] };
  }

  const churchId = session.appContext.church.id;

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      title: string;
      content: string | null;
      note_type: string;
      version: string;
      created_by_name: string | null;
      last_edited_by_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        select
          cn.id, cn.title, cn.content, cn.note_type, cn.version::text,
          cp.full_name as created_by_name,
          ep.full_name as last_edited_by_name,
          cn.created_at, cn.updated_at
        from public.council_notes cn
        left join public.profiles cp on cp.id = cn.created_by
        left join public.profiles ep on ep.id = cn.last_edited_by
        where cn.church_id = $1
        order by cn.updated_at desc
        limit 50
      `,
      [churchId],
    );

    return {
      notes: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        noteType: row.note_type as CouncilNoteType,
        version: parseInt(row.version, 10) || 1,
        createdByName: row.created_by_name,
        lastEditedByName: row.last_edited_by_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  const supabase = await createTenantServerClient();

  const { data: rows } = await supabase
    .from("council_notes")
    .select(
      "id, title, content, note_type, version, created_at, updated_at, creator:created_by(full_name), editor:last_edited_by(full_name)",
    )
    .eq("church_id", churchId)
    .order("updated_at", { ascending: false })
    .limit(50);

  return {
    notes: (rows ?? []).map((row) => {
      const creator = row.creator as unknown as { full_name: string } | null;
      const editor = row.editor as unknown as { full_name: string } | null;
      return {
        id: row.id,
        title: row.title,
        content: row.content ?? null,
        noteType: row.note_type as CouncilNoteType,
        version: (row.version as unknown as number) ?? 1,
        createdByName: creator?.full_name ?? null,
        lastEditedByName: editor?.full_name ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  };
}
