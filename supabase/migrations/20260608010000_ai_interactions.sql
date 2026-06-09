-- ============================================================
-- CC-AI-001: AI Interactions audit table
-- Ref: DEVELOPMENT_PLAN.md §4 — AI Ministry Tools Suite
--
-- Records every AI prompt call (sermon planning, Bible study)
-- for audit, consent, and usage tracking purposes.
--
-- Access restricted to pastor + church_admin of the same church
-- using the existing can_access_council_data() helper.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  feature text NOT NULL,
  topic_text text NOT NULL,
  disclaimer_shown boolean NOT NULL DEFAULT true,
  model_used text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS ai_interactions_church_id_idx ON public.ai_interactions (church_id);
CREATE INDEX IF NOT EXISTS ai_interactions_profile_id_idx ON public.ai_interactions (profile_id);
CREATE INDEX IF NOT EXISTS ai_interactions_created_at_idx ON public.ai_interactions (created_at DESC);

ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

-- SELECT: pastor + church_admin of the same church
DROP POLICY IF EXISTS ai_interactions_select ON public.ai_interactions;
CREATE POLICY ai_interactions_select ON public.ai_interactions
  FOR SELECT USING (can_access_council_data(church_id));

-- INSERT: same role check
DROP POLICY IF EXISTS ai_interactions_insert ON public.ai_interactions;
CREATE POLICY ai_interactions_insert ON public.ai_interactions
  FOR INSERT WITH CHECK (can_access_council_data(church_id));

-- Audit trigger — follows the exact pattern used in council_notes migration
DROP TRIGGER IF EXISTS audit_ai_interactions_changes ON public.ai_interactions;
CREATE TRIGGER audit_ai_interactions_changes
  AFTER INSERT ON public.ai_interactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
