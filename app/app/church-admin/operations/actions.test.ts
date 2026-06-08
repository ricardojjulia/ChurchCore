import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Supabase mock builder ---
// Must be defined before vi.hoisted so the type is available, but the actual
// mock functions are created inside vi.hoisted so they are hoisted correctly.

type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function makeSupabaseChain(overrides: Partial<MockQueryBuilder> = {}): MockQueryBuilder {
  const chain: MockQueryBuilder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };

  // Each chainable method returns the chain itself
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);

  return chain;
}

const {
  revalidatePathMock,
  requireChurchSessionMock,
  encryptPastoralFieldMock,
  decryptPastoralFieldMock,
  supabaseFromMock,
  createTenantServerClientMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const encryptPastoralField = vi.fn((s: string) => `enc:${s}`);
  const decryptPastoralField = vi.fn((s: string) => s.replace(/^enc:/, ""));
  const supabaseFrom = vi.fn();
  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    encryptPastoralFieldMock: encryptPastoralField,
    decryptPastoralFieldMock: decryptPastoralField,
    supabaseFromMock: supabaseFrom,
    createTenantServerClientMock: createTenantServerClient,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
}));

vi.mock("@/lib/crypto/pastoral", () => ({
  encryptPastoralField: encryptPastoralFieldMock,
  decryptPastoralField: decryptPastoralFieldMock,
}));

import {
  closeOnboardingInstanceAction,
  completeOnboardingStepAction,
  createChurchDocumentAction,
  createOnboardingTemplateAction,
  deleteChurchDocumentAction,
  deleteOnboardingTemplateAction,
  getChurchDocumentAction,
  getOnboardingInstanceAction,
  listChurchDocumentsAction,
  listOnboardingInstancesAction,
  listOnboardingTemplatesAction,
  startOnboardingInstanceAction,
  updateChurchDocumentAction,
} from "./actions";

// ── Shared session builders ───────────────────────────────────

function churchAdminSession(extras: Record<string, unknown> = {}) {
  return {
    appContext: { roleId: "church-admin", church: { id: "church-1" } },
    profile: { id: "profile-actor", isPastoral: false },
    source: "supabase",
    userId: "user-1",
    ...extras,
  };
}

function pastorSession() {
  return {
    appContext: { roleId: "pastor", church: { id: "church-1" } },
    profile: { id: "profile-pastor", isPastoral: true },
    source: "supabase",
    userId: "user-2",
  };
}

function memberSession() {
  return {
    appContext: { roleId: "member", church: { id: "church-1" } },
    profile: { id: "profile-member", isPastoral: false },
    source: "supabase",
    userId: "user-3",
  };
}

// ── beforeEach ────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  requireChurchSessionMock.mockResolvedValue(churchAdminSession());
  supabaseFromMock.mockReturnValue(makeSupabaseChain());
});

// ═══════════════════════════════════════════════════════════════
// DOCUMENT ACTIONS
// ═══════════════════════════════════════════════════════════════

describe("createChurchDocumentAction", () => {
  it("creates a general document successfully", async () => {
    const chain = makeSupabaseChain();
    chain.single.mockResolvedValue({ data: { id: "doc-1" }, error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await createChurchDocumentAction({
      title: "Our Vision",
      docType: "general",
      body: "We exist to serve.",
    });

    expect(result).toEqual({ ok: true, id: "doc-1" });
    expect(encryptPastoralFieldMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/operations/documents");
  });

  it("encrypts body for elder_council_notes when caller is pastoral", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());
    const chain = makeSupabaseChain();
    chain.single.mockResolvedValue({ data: { id: "doc-ec-1" }, error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await createChurchDocumentAction({
      title: "Council Notes",
      docType: "elder_council_notes",
      body: "Confidential.",
    });

    expect(result.ok).toBe(true);
    expect(encryptPastoralFieldMock).toHaveBeenCalledWith("Confidential.");
    // The body stored should be the encrypted version
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ body: "enc:Confidential." }),
    );
  });

  it("denies non-pastoral user from creating elder_council_notes", async () => {
    requireChurchSessionMock.mockResolvedValue(churchAdminSession());
    // isPastoral is false in churchAdminSession

    const result = await createChurchDocumentAction({
      title: "Council Notes",
      docType: "elder_council_notes",
      body: "secret",
    });

    expect(result).toEqual({ ok: false, error: "Access denied." });
    expect(encryptPastoralFieldMock).not.toHaveBeenCalled();
  });

  it("returns encryption key error in production when key is missing", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());

    vi.stubEnv("NODE_ENV", "production");
    const originalKey = process.env.PASTORAL_ENCRYPTION_KEY;
    delete process.env.PASTORAL_ENCRYPTION_KEY;

    try {
      const result = await createChurchDocumentAction({
        title: "Council Notes",
        docType: "elder_council_notes",
        body: "secret",
      });

      expect(result).toEqual({ ok: false, error: "Encryption key not configured." });
    } finally {
      vi.unstubAllEnvs();
      if (originalKey !== undefined) {
        process.env.PASTORAL_ENCRYPTION_KEY = originalKey;
      }
    }
  });

  it("denies member_volunteer role", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());

    const result = await createChurchDocumentAction({
      title: "Test",
      docType: "general",
      body: "body",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/access denied/i);
  });
});

describe("updateChurchDocumentAction", () => {
  it("updates a general document successfully", async () => {
    const chain = makeSupabaseChain();
    // First call: load existing row
    chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: "doc-1", church_id: "church-1", doc_type: "general" }, error: null })
      // Second call: update (uses maybeSingle-like path actually ends with plain .eq)
      .mockResolvedValueOnce({ data: null, error: null });
    chain.update.mockReturnValue({ ...chain, eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    supabaseFromMock.mockReturnValue(chain);

    const result = await updateChurchDocumentAction({
      id: "doc-1",
      title: "Updated Vision",
      body: "New body",
    });

    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("denies non-pastoral user updating elder_council_notes", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: "doc-ec", church_id: "church-1", doc_type: "elder_council_notes" },
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await updateChurchDocumentAction({
      id: "doc-ec",
      title: "Title",
      body: "body",
    });

    expect(result).toEqual({ ok: false, error: "Access denied." });
  });

  it("denies member_volunteer role", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());

    const result = await updateChurchDocumentAction({ id: "doc-1", title: "T", body: "B" });
    expect(result.ok).toBe(false);
  });

  it("returns not found when document belongs to different church", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await updateChurchDocumentAction({ id: "doc-other", title: "T", body: "B" });
    expect(result).toEqual({ ok: false, error: "Document not found." });
  });
});

describe("deleteChurchDocumentAction", () => {
  it("deletes a document that belongs to the session church", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: "doc-1" }, error: null });
    chain.delete.mockReturnValue({ ...chain, eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    supabaseFromMock.mockReturnValue(chain);

    const result = await deleteChurchDocumentAction({ id: "doc-1" });
    expect(result.ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("returns not found for cross-church document", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await deleteChurchDocumentAction({ id: "doc-other-church" });
    expect(result).toEqual({ ok: false, error: "Document not found." });
  });

  it("denies member_volunteer role", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());
    const result = await deleteChurchDocumentAction({ id: "doc-1" });
    expect(result.ok).toBe(false);
  });
});

describe("listChurchDocumentsAction", () => {
  it("returns documents excluding body field", async () => {
    const chain = makeSupabaseChain();
    chain.order.mockResolvedValueOnce({
      data: [
        {
          id: "d1", church_id: "church-1", title: "Vision", doc_type: "general",
          created_by: "p1", updated_by: "p1", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await listChurchDocumentsAction();
    expect(result.ok).toBe(true);
    expect(result.documents).toHaveLength(1);
    // body must not be on any list item
    expect((result.documents![0] as Record<string, unknown>).body).toBeUndefined();
  });

  it("excludes elder_council_notes for non-pastoral users", async () => {
    const chain = makeSupabaseChain();
    chain.order.mockResolvedValueOnce({
      data: [
        {
          id: "d1", church_id: "church-1", title: "Vision", doc_type: "general",
          created_by: null, updated_by: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "d2", church_id: "church-1", title: "Council Notes", doc_type: "elder_council_notes",
          created_by: null, updated_by: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    // church admin is not pastoral
    const result = await listChurchDocumentsAction();
    expect(result.ok).toBe(true);
    expect(result.documents).toHaveLength(1);
    expect(result.documents![0].id).toBe("d1");
  });

  it("includes elder_council_notes for pastoral users", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());
    const chain = makeSupabaseChain();
    chain.order.mockResolvedValueOnce({
      data: [
        {
          id: "d2", church_id: "church-1", title: "Council Notes", doc_type: "elder_council_notes",
          created_by: null, updated_by: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await listChurchDocumentsAction();
    expect(result.ok).toBe(true);
    expect(result.documents).toHaveLength(1);
  });

  it("denies member_volunteer role", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());
    const result = await listChurchDocumentsAction();
    expect(result.ok).toBe(false);
  });

  it("orders by updated_at descending (AC8)", async () => {
    const chain = makeSupabaseChain();
    chain.order.mockResolvedValueOnce({ data: [], error: null });
    supabaseFromMock.mockReturnValue(chain);

    await listChurchDocumentsAction();

    expect(chain.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });
});

describe("getChurchDocumentAction", () => {
  it("returns plaintext document for general type", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "d1", church_id: "church-1", title: "Vision", doc_type: "general",
        body: "We serve.", created_by: null, updated_by: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await getChurchDocumentAction({ id: "d1" });
    expect(result.ok).toBe(true);
    expect(result.document?.body).toBe("We serve.");
    expect(decryptPastoralFieldMock).not.toHaveBeenCalled();
  });

  it("decrypts body for elder_council_notes when caller is pastoral", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "ec-1", church_id: "church-1", title: "Council Notes",
        doc_type: "elder_council_notes", body: "enc:Confidential text.",
        created_by: null, updated_by: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await getChurchDocumentAction({ id: "ec-1" });
    expect(result.ok).toBe(true);
    expect(decryptPastoralFieldMock).toHaveBeenCalledWith("enc:Confidential text.");
    expect(result.document?.body).toBe("Confidential text.");
  });

  it("denies non-pastoral user from getting elder_council_notes", async () => {
    // church admin, not pastoral
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "ec-1", church_id: "church-1", title: "Notes",
        doc_type: "elder_council_notes", body: "enc:secret",
        created_by: null, updated_by: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await getChurchDocumentAction({ id: "ec-1" });
    expect(result).toEqual({ ok: false, error: "Access denied." });
  });

  it("returns decryption error when decryptPastoralField throws", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());
    decryptPastoralFieldMock.mockImplementationOnce(() => {
      throw new Error("bad key");
    });
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "ec-2", church_id: "church-1", title: "Notes",
        doc_type: "elder_council_notes", body: "corrupted_ciphertext",
        created_by: null, updated_by: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await getChurchDocumentAction({ id: "ec-2" });
    expect(result).toEqual({ ok: false, error: "Document could not be decrypted." });
  });

  it("denies member_volunteer role", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());
    const result = await getChurchDocumentAction({ id: "d1" });
    expect(result.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEMPLATE ACTIONS
// ═══════════════════════════════════════════════════════════════

describe("createOnboardingTemplateAction", () => {
  it("creates template with steps successfully for church_admin", async () => {
    const chain = makeSupabaseChain();
    chain.single
      .mockResolvedValueOnce({ data: { id: "tmpl-1" }, error: null }) // template insert
      .mockResolvedValueOnce({ data: null, error: null }); // steps insert (uses insert not single but chain returns chain)
    chain.insert.mockReturnValue(chain);
    supabaseFromMock.mockReturnValue(chain);

    const result = await createOnboardingTemplateAction({
      name: "New Member Track",
      steps: [
        { title: "Welcome call", assigneeType: "staff", sortOrder: 0 },
        { title: "Complete profile", assigneeType: "new_member", sortOrder: 1 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe("tmpl-1");
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("rejects when steps array is empty", async () => {
    const result = await createOnboardingTemplateAction({ name: "Track", steps: [] });
    expect(result).toEqual({ ok: false, error: "At least one step is required." });
  });

  it("denies pastor role (admin only)", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());

    const result = await createOnboardingTemplateAction({
      name: "Track",
      steps: [{ title: "Step 1", assigneeType: "staff", sortOrder: 0 }],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/church-admin/i);
  });

  it("denies member_volunteer role", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());

    const result = await createOnboardingTemplateAction({
      name: "Track",
      steps: [{ title: "S", assigneeType: "staff", sortOrder: 0 }],
    });

    expect(result.ok).toBe(false);
  });
});

describe("deleteOnboardingTemplateAction (soft delete)", () => {
  it("soft-deletes: sets deleted_at, does not hard delete", async () => {
    const chain = makeSupabaseChain();
    // First call: ownership check
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: "tmpl-1" }, error: null });
    // Second call: update deleted_at
    const updateChain = makeSupabaseChain();
    updateChain.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    chain.update.mockReturnValue(updateChain);
    supabaseFromMock.mockReturnValue(chain);

    const result = await deleteOnboardingTemplateAction({ id: "tmpl-1" });
    expect(result.ok).toBe(true);

    // update was called (soft delete), not delete
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(chain.delete).not.toHaveBeenCalled();
  });

  it("returns not found for template in different church", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await deleteOnboardingTemplateAction({ id: "tmpl-other" });
    expect(result).toEqual({ ok: false, error: "Template not found." });
  });
});

describe("listOnboardingTemplatesAction", () => {
  it("returns active templates for church_admin", async () => {
    const chain = makeSupabaseChain();
    chain.order.mockResolvedValueOnce({
      data: [
        {
          id: "tmpl-1", church_id: "church-1", name: "Track A",
          created_by: null, deleted_at: null,
          created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await listOnboardingTemplatesAction();
    expect(result.ok).toBe(true);
    expect(result.templates).toHaveLength(1);
  });

  it("allows pastor to list templates", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());
    const chain = makeSupabaseChain();
    chain.order.mockResolvedValueOnce({ data: [], error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await listOnboardingTemplatesAction();
    expect(result.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// INSTANCE ACTIONS
// ═══════════════════════════════════════════════════════════════

describe("startOnboardingInstanceAction", () => {
  it("creates instance with correct number of step snapshots", async () => {
    const chain = makeSupabaseChain();

    // Call 1: check church_memberships (church_admin is not pastor, but we don't actually
    // use that result — we check profiles next)
    chain.maybeSingle
      .mockResolvedValueOnce({ data: { user_id: "user-1" }, error: null }) // church_memberships
      .mockResolvedValueOnce({ data: { id: "profile-1" }, error: null })   // profiles check
      .mockResolvedValueOnce({ data: { id: "tmpl-1" }, error: null });      // template check

    // template_steps query uses .order() not maybeSingle
    chain.order
      .mockResolvedValueOnce({
        data: [
          { id: "ts-1", sort_order: 0, title: "Step 1", description: null, assignee_type: "staff" },
          { id: "ts-2", sort_order: 1, title: "Step 2", description: null, assignee_type: "new_member" },
          { id: "ts-3", sort_order: 2, title: "Step 3", description: "desc", assignee_type: "staff" },
        ],
        error: null,
      });

    // instance insert
    chain.single.mockResolvedValueOnce({ data: { id: "inst-1" }, error: null });
    // instance steps insert (no return needed)
    chain.insert.mockReturnValue(chain);

    supabaseFromMock.mockReturnValue(chain);

    const result = await startOnboardingInstanceAction({
      profileId: "profile-1",
      templateId: "tmpl-1",
    });

    expect(result.ok).toBe(true);
    expect(result.instanceId).toBe("inst-1");

    // Verify instance_steps insert was called with 3 rows
    const insertCalls = chain.insert.mock.calls;
    const stepsInsertCall = insertCalls.find(
      (args) => Array.isArray(args[0]) && (args[0] as unknown[]).length === 3,
    );
    expect(stepsInsertCall).toBeDefined();
  });

  it("returns error when profile not found in church", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // church_memberships
      .mockResolvedValueOnce({ data: null, error: null }); // profiles check → null
    supabaseFromMock.mockReturnValue(chain);

    const result = await startOnboardingInstanceAction({
      profileId: "unknown-profile",
      templateId: "tmpl-1",
    });

    expect(result).toEqual({ ok: false, error: "Profile not found in this church." });
  });
});

describe("completeOnboardingStepAction", () => {
  it("allows church_admin to complete a staff step", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: "step-1", church_id: "church-1", assignee_type: "staff", is_complete: false },
      error: null,
    });
    const updateChain = makeSupabaseChain();
    updateChain.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    chain.update.mockReturnValue(updateChain);
    supabaseFromMock.mockReturnValue(chain);

    const result = await completeOnboardingStepAction({ instanceStepId: "step-1" });
    expect(result.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_complete: true, completed_by: "profile-actor" }),
    );
  });

  it("denies member_volunteer from completing any step (denied at role check)", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());

    const result = await completeOnboardingStepAction({ instanceStepId: "step-1" });
    // member_volunteer is denied at requireOperationsSession before reaching the step type check
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("denies member_volunteer at role check (no access to operations)", async () => {
    requireChurchSessionMock.mockResolvedValue(memberSession());
    const result = await completeOnboardingStepAction({ instanceStepId: "step-1" });
    // member gets denied at role check before step type check
    expect(result.ok).toBe(false);
  });

  it("allows pastor to complete a staff step (AC17)", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());

    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: "step-2", church_id: "church-1", assignee_type: "staff", is_complete: false },
      error: null,
    });
    const updateChain = makeSupabaseChain();
    updateChain.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    chain.update.mockReturnValue(updateChain);
    supabaseFromMock.mockReturnValue(chain);

    const result = await completeOnboardingStepAction({ instanceStepId: "step-2" });

    expect(result.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_complete: true, completed_by: "profile-pastor" }),
    );
  });
});

describe("closeOnboardingInstanceAction", () => {
  it("closes an instance with a valid reason", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: "inst-1" }, error: null });
    const updateChain = makeSupabaseChain();
    updateChain.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    chain.update.mockReturnValue(updateChain);
    supabaseFromMock.mockReturnValue(chain);

    const result = await closeOnboardingInstanceAction({
      instanceId: "inst-1",
      reason: "Member has completed onboarding.",
    });

    expect(result.ok).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "closed", close_reason: "Member has completed onboarding." }),
    );
  });

  it("rejects reason with fewer than 5 characters", async () => {
    const result = await closeOnboardingInstanceAction({
      instanceId: "inst-1",
      reason: "ok",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/5 characters/i);
  });

  it("rejects empty reason", async () => {
    const result = await closeOnboardingInstanceAction({
      instanceId: "inst-1",
      reason: "",
    });
    expect(result.ok).toBe(false);
  });

  it("returns not found for instance in different church", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await closeOnboardingInstanceAction({
      instanceId: "other-inst",
      reason: "Valid reason here.",
    });

    expect(result).toEqual({ ok: false, error: "Instance not found." });
  });

  it("denies pastor role (admin only)", async () => {
    requireChurchSessionMock.mockResolvedValue(pastorSession());

    const result = await closeOnboardingInstanceAction({
      instanceId: "inst-1",
      reason: "Valid reason",
    });

    expect(result.ok).toBe(false);
  });
});

describe("listOnboardingInstancesAction", () => {
  it("returns instances with step counts", async () => {
    const chain = makeSupabaseChain();
    // instances query
    chain.order.mockResolvedValueOnce({
      data: [
        {
          id: "inst-1", church_id: "church-1", template_id: "tmpl-1",
          profile_id: "prof-1", started_by: "prof-actor", status: "open",
          close_reason: null, closed_at: null,
          created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
          profiles: { full_name: "John Doe" },
          onboarding_templates: { name: "New Member Track" },
        },
      ],
      error: null,
    });
    // steps query
    chain.in.mockResolvedValueOnce({
      data: [
        { instance_id: "inst-1", is_complete: true },
        { instance_id: "inst-1", is_complete: false },
        { instance_id: "inst-1", is_complete: true },
      ],
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await listOnboardingInstancesAction();
    expect(result.ok).toBe(true);
    expect(result.instances).toHaveLength(1);
    expect(result.instances![0].profileName).toBe("John Doe");
    expect(result.instances![0].templateName).toBe("New Member Track");
    expect(result.instances![0].totalSteps).toBe(3);
    expect(result.instances![0].completedSteps).toBe(2);
  });
});

describe("getOnboardingInstanceAction", () => {
  it("returns instance detail with steps ordered by sort_order", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "inst-1", church_id: "church-1", template_id: "tmpl-1",
        profile_id: "prof-1", started_by: null, status: "open",
        close_reason: null, closed_at: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        profiles: { full_name: "Jane Smith" },
        onboarding_templates: { name: "Track A" },
      },
      error: null,
    });
    chain.order.mockResolvedValueOnce({
      data: [
        {
          id: "step-1", church_id: "church-1", instance_id: "inst-1",
          sort_order: 0, title: "Step One", description: null,
          assignee_type: "staff", is_complete: false,
          completed_at: null, completed_by: null,
          created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);

    const result = await getOnboardingInstanceAction({ instanceId: "inst-1" });
    expect(result.ok).toBe(true);
    expect(result.instance?.profileName).toBe("Jane Smith");
    expect(result.instance?.templateName).toBe("Track A");
    expect(result.instance?.steps).toHaveLength(1);
    expect(result.instance?.steps[0].title).toBe("Step One");
  });

  it("returns not found for cross-church instance", async () => {
    const chain = makeSupabaseChain();
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    supabaseFromMock.mockReturnValue(chain);

    const result = await getOnboardingInstanceAction({ instanceId: "inst-other" });
    expect(result).toEqual({ ok: false, error: "Instance not found." });
  });
});
