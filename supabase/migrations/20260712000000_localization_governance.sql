-- ============================================================
-- Localization Governance (CC-L10N-001)
-- All tables use tenant_id (FK to churches.id) for multi-tenancy.
-- The postgres storage adapter (from @localization-governance/storage-postgres)
-- expects exactly these column names and table names.
-- A custom audit trigger is used because these tables use tenant_id, not church_id.
-- ============================================================

-- ── Custom audit trigger for locgov tables ────────────────────────────────────
-- Excludes messages and provenance columns (catalog text — must not be in audit log).

CREATE OR REPLACE FUNCTION public.audit_locgov_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _record_id uuid;
  _church_id uuid;
BEGIN
  _church_id := COALESCE(NEW.tenant_id, OLD.tenant_id);
  _record_id := COALESCE(NEW.id, OLD.id);
  INSERT INTO public.audit_log (table_name, record_id, operation, actor_id, church_id, actor_role, old_values, new_values)
  VALUES (
    TG_TABLE_NAME,
    _record_id,
    TG_OP,
    auth.uid(),
    _church_id,
    NULL,  -- actor_role captured at app layer via logAuditEvent
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) - 'messages' - 'provenance' ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) - 'messages' - 'provenance' ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── localization_locales ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.localization_locales (
  tenant_id           uuid          NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  id                  uuid          NOT NULL,
  locale_code         varchar(20)   NOT NULL,
  source_locale       varchar(20)   NOT NULL,
  policy_id           varchar(64)   NOT NULL DEFAULT 'default',
  active_version_id   uuid,
  created_at          timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  updated_at          timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, locale_code)
);

CREATE INDEX IF NOT EXISTS localization_locales_tenant_code_idx
  ON public.localization_locales (tenant_id, locale_code);

ALTER TABLE public.localization_locales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locgov_locales_select" ON public.localization_locales;
CREATE POLICY "locgov_locales_select"
  ON public.localization_locales FOR SELECT
  TO authenticated
  USING (public.belongs_to_church(tenant_id));

DROP POLICY IF EXISTS "locgov_locales_insert" ON public.localization_locales;
CREATE POLICY "locgov_locales_insert"
  ON public.localization_locales FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_locales_update" ON public.localization_locales;
CREATE POLICY "locgov_locales_update"
  ON public.localization_locales FOR UPDATE
  TO authenticated
  USING (public.can_manage_church(tenant_id))
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_locales_delete" ON public.localization_locales;
CREATE POLICY "locgov_locales_delete"
  ON public.localization_locales FOR DELETE
  TO authenticated
  USING (public.can_manage_church(tenant_id));

DROP TRIGGER IF EXISTS audit_locgov_locales_changes ON public.localization_locales;
CREATE TRIGGER audit_locgov_locales_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.localization_locales
  FOR EACH ROW EXECUTE FUNCTION public.audit_locgov_changes();

-- ── localization_catalog_versions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.localization_catalog_versions (
  tenant_id                 uuid          NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  id                        uuid          NOT NULL,
  locale_id                 uuid          NOT NULL,
  locale_code               varchar(20)   NOT NULL,
  version_number            integer       NOT NULL,
  source_catalog_version    integer       NOT NULL,
  source_content_hash       varchar(128)  NOT NULL,
  content_hash              varchar(128)  NOT NULL,
  state                     varchar(64)   NOT NULL,
  messages                  jsonb         NOT NULL,
  provenance                jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_by                uuid,
  approved_by               uuid,
  activated_at              timestamptz,
  created_at                timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  updated_at                timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, locale_id, version_number)
);

CREATE INDEX IF NOT EXISTS localization_catalog_versions_tenant_locale_idx
  ON public.localization_catalog_versions (tenant_id, locale_id, version_number);

CREATE INDEX IF NOT EXISTS localization_catalog_versions_tenant_state_idx
  ON public.localization_catalog_versions (tenant_id, state);

ALTER TABLE public.localization_catalog_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locgov_versions_select" ON public.localization_catalog_versions;
CREATE POLICY "locgov_versions_select"
  ON public.localization_catalog_versions FOR SELECT
  TO authenticated
  USING (public.belongs_to_church(tenant_id));

DROP POLICY IF EXISTS "locgov_versions_insert" ON public.localization_catalog_versions;
CREATE POLICY "locgov_versions_insert"
  ON public.localization_catalog_versions FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_versions_update" ON public.localization_catalog_versions;
CREATE POLICY "locgov_versions_update"
  ON public.localization_catalog_versions FOR UPDATE
  TO authenticated
  USING (public.can_manage_church(tenant_id))
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_versions_delete" ON public.localization_catalog_versions;
CREATE POLICY "locgov_versions_delete"
  ON public.localization_catalog_versions FOR DELETE
  TO authenticated
  USING (public.can_manage_church(tenant_id));

DROP TRIGGER IF EXISTS audit_locgov_versions_changes ON public.localization_catalog_versions;
CREATE TRIGGER audit_locgov_versions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.localization_catalog_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_locgov_changes();

-- ── localization_validation_reports ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.localization_validation_reports (
  tenant_id             uuid          NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  id                    uuid          NOT NULL,
  catalog_version_id    uuid          NOT NULL,
  validator_version     varchar(32)   NOT NULL,
  content_hash          varchar(128)  NOT NULL,
  source_content_hash   varchar(128)  NOT NULL,
  passed                boolean       NOT NULL,
  coverage              numeric(5,4)  NOT NULL,
  checks                jsonb         NOT NULL,
  created_at            timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, catalog_version_id)
);

CREATE INDEX IF NOT EXISTS localization_validation_reports_version_idx
  ON public.localization_validation_reports (tenant_id, catalog_version_id);

ALTER TABLE public.localization_validation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locgov_validations_select" ON public.localization_validation_reports;
CREATE POLICY "locgov_validations_select"
  ON public.localization_validation_reports FOR SELECT
  TO authenticated
  USING (public.belongs_to_church(tenant_id));

DROP POLICY IF EXISTS "locgov_validations_insert" ON public.localization_validation_reports;
CREATE POLICY "locgov_validations_insert"
  ON public.localization_validation_reports FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_validations_update" ON public.localization_validation_reports;
CREATE POLICY "locgov_validations_update"
  ON public.localization_validation_reports FOR UPDATE
  TO authenticated
  USING (public.can_manage_church(tenant_id))
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_validations_delete" ON public.localization_validation_reports;
CREATE POLICY "locgov_validations_delete"
  ON public.localization_validation_reports FOR DELETE
  TO authenticated
  USING (public.can_manage_church(tenant_id));

DROP TRIGGER IF EXISTS audit_locgov_validations_changes ON public.localization_validation_reports;
CREATE TRIGGER audit_locgov_validations_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.localization_validation_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_locgov_changes();

-- ── localization_review_decisions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.localization_review_decisions (
  tenant_id             uuid          NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  id                    uuid          NOT NULL,
  catalog_version_id    uuid          NOT NULL,
  content_hash          varchar(128)  NOT NULL,
  reviewer_id           uuid          NOT NULL,
  reviewer_role         varchar(64)   NOT NULL,
  decision              varchar(32)   NOT NULL,
  comment               text          NOT NULL DEFAULT '',
  created_at            timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, catalog_version_id, reviewer_role, reviewer_id)
);

CREATE INDEX IF NOT EXISTS localization_review_decisions_version_idx
  ON public.localization_review_decisions (tenant_id, catalog_version_id);

ALTER TABLE public.localization_review_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locgov_reviews_select" ON public.localization_review_decisions;
CREATE POLICY "locgov_reviews_select"
  ON public.localization_review_decisions FOR SELECT
  TO authenticated
  USING (public.belongs_to_church(tenant_id));

DROP POLICY IF EXISTS "locgov_reviews_insert" ON public.localization_review_decisions;
CREATE POLICY "locgov_reviews_insert"
  ON public.localization_review_decisions FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_reviews_update" ON public.localization_review_decisions;
CREATE POLICY "locgov_reviews_update"
  ON public.localization_review_decisions FOR UPDATE
  TO authenticated
  USING (public.can_manage_church(tenant_id))
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_reviews_delete" ON public.localization_review_decisions;
CREATE POLICY "locgov_reviews_delete"
  ON public.localization_review_decisions FOR DELETE
  TO authenticated
  USING (public.can_manage_church(tenant_id));

DROP TRIGGER IF EXISTS audit_locgov_review_decisions_changes ON public.localization_review_decisions;
CREATE TRIGGER audit_locgov_review_decisions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.localization_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.audit_locgov_changes();

-- ── localization_activation_history ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.localization_activation_history (
  tenant_id                       uuid          NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  id                              uuid          NOT NULL,
  locale_id                       uuid          NOT NULL,
  catalog_version_id              uuid          NOT NULL,
  previous_catalog_version_id     uuid,
  action                          varchar(32)   NOT NULL,
  actor_id                        uuid,
  created_at                      timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS localization_activation_history_locale_idx
  ON public.localization_activation_history (tenant_id, locale_id, created_at);

ALTER TABLE public.localization_activation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locgov_activation_history_select" ON public.localization_activation_history;
CREATE POLICY "locgov_activation_history_select"
  ON public.localization_activation_history FOR SELECT
  TO authenticated
  USING (public.belongs_to_church(tenant_id));

DROP POLICY IF EXISTS "locgov_activation_history_insert" ON public.localization_activation_history;
CREATE POLICY "locgov_activation_history_insert"
  ON public.localization_activation_history FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_activation_history_update" ON public.localization_activation_history;
CREATE POLICY "locgov_activation_history_update"
  ON public.localization_activation_history FOR UPDATE
  TO authenticated
  USING (public.can_manage_church(tenant_id))
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_activation_history_delete" ON public.localization_activation_history;
CREATE POLICY "locgov_activation_history_delete"
  ON public.localization_activation_history FOR DELETE
  TO authenticated
  USING (public.can_manage_church(tenant_id));

DROP TRIGGER IF EXISTS audit_locgov_activation_history_changes ON public.localization_activation_history;
CREATE TRIGGER audit_locgov_activation_history_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.localization_activation_history
  FOR EACH ROW EXECUTE FUNCTION public.audit_locgov_changes();

-- ── localization_review_assignments ──────────────────────────────────────────
-- Managed directly by ChurchCore adapter (not the postgres storage adapter).

CREATE TABLE IF NOT EXISTS public.localization_review_assignments (
  tenant_id     uuid          NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  locale_id     text          NOT NULL,
  reviewer_id   uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_role text          NOT NULL,
  assigned_by   uuid          NOT NULL REFERENCES public.profiles(id),
  created_at    timestamptz   NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, locale_id, reviewer_role, reviewer_id)
);

CREATE INDEX IF NOT EXISTS localization_review_assignments_locale_idx
  ON public.localization_review_assignments (tenant_id, locale_id);

ALTER TABLE public.localization_review_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locgov_assignments_select" ON public.localization_review_assignments;
CREATE POLICY "locgov_assignments_select"
  ON public.localization_review_assignments FOR SELECT
  TO authenticated
  USING (public.belongs_to_church(tenant_id));

DROP POLICY IF EXISTS "locgov_assignments_insert" ON public.localization_review_assignments;
CREATE POLICY "locgov_assignments_insert"
  ON public.localization_review_assignments FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_assignments_update" ON public.localization_review_assignments;
CREATE POLICY "locgov_assignments_update"
  ON public.localization_review_assignments FOR UPDATE
  TO authenticated
  USING (public.can_manage_church(tenant_id))
  WITH CHECK (public.can_manage_church(tenant_id));

DROP POLICY IF EXISTS "locgov_assignments_delete" ON public.localization_review_assignments;
CREATE POLICY "locgov_assignments_delete"
  ON public.localization_review_assignments FOR DELETE
  TO authenticated
  USING (public.can_manage_church(tenant_id));

DROP TRIGGER IF EXISTS audit_locgov_assignments_changes ON public.localization_review_assignments;
CREATE TRIGGER audit_locgov_assignments_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.localization_review_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_locgov_changes();
