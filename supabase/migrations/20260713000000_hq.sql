-- Create current user role helper for project governance policies
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_id uuid;
BEGIN
  -- 1. Check if platform admin
  IF public.is_platform_admin() THEN
    RETURN 'admin';
  END IF;

  -- 2. Fetch role from profiles
  SELECT id, role INTO v_profile_id, v_role
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role = 'church_admin' THEN
    RETURN 'admin';
  ELSIF v_role IN ('pastor_elder', 'secretary', 'ministry_leader') THEN
    RETURN 'manager';
  ELSIF v_role = 'member_volunteer' THEN
    -- Check if they have a lead_teacher assignment in ccm_volunteer_assignments
    IF EXISTS (
      SELECT 1 
      FROM public.ccm_volunteer_assignments 
      WHERE profile_id = v_profile_id 
        AND role = 'lead_teacher'
    ) THEN
      RETURN 'teacher';
    ELSE
      RETURN 'member';
    END IF;
  END IF;

  RETURN 'member';
END;
$$;

-- hq_sessions: every AI interaction persisted as institutional memory
CREATE TABLE IF NOT EXISTS public.hq_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id   text        NOT NULL,
  agent_name text        NOT NULL,
  prompt     text        NOT NULL,
  response   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hq_sessions_user_agent ON public.hq_sessions(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_hq_sessions_created    ON public.hq_sessions(created_at DESC);
ALTER TABLE public.hq_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hq_sessions: users manage own"  ON public.hq_sessions FOR ALL       TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "hq_sessions: admins read all"   ON public.hq_sessions FOR SELECT    TO authenticated USING (public.current_user_role() = 'admin');

-- hq_tasks: project task engine
CREATE TABLE IF NOT EXISTS public.hq_tasks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  status     text        NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','ready','in_progress','review','blocked','done')),
  owner      text,
  priority   text        NOT NULL DEFAULT 'P2'     CHECK (priority IN ('P0','P1','P2','P3')),
  source     text        NOT NULL DEFAULT 'manual'  CHECK (source IN ('manual','risk','council')),
  created_by uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hq_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hq_tasks: staff read"     ON public.hq_tasks FOR SELECT TO authenticated USING  (public.current_user_role() IN ('admin','manager','teacher'));
CREATE POLICY "hq_tasks: managers write" ON public.hq_tasks FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_tasks: managers update"ON public.hq_tasks FOR UPDATE TO authenticated USING  (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_tasks: admins delete"  ON public.hq_tasks FOR DELETE TO authenticated USING  (public.current_user_role() = 'admin');

-- hq_risks: risk register
CREATE TABLE IF NOT EXISTS public.hq_risks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  mitigation  text,
  severity    int         NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  probability int         NOT NULL DEFAULT 3 CHECK (probability BETWEEN 1 AND 5),
  owner       text,
  created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hq_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hq_risks: staff read"     ON public.hq_risks FOR SELECT TO authenticated USING  (public.current_user_role() IN ('admin','manager','teacher'));
CREATE POLICY "hq_risks: managers write" ON public.hq_risks FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_risks: managers update"ON public.hq_risks FOR UPDATE TO authenticated USING  (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_risks: admins delete"  ON public.hq_risks FOR DELETE TO authenticated USING  (public.current_user_role() = 'admin');

-- hq_decisions: decision log / ADR register
CREATE TABLE IF NOT EXISTS public.hq_decisions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  owner      text,
  status     text        NOT NULL DEFAULT 'Proposed'  CHECK (status IN ('Proposed','Accepted','Rejected','Superseded')),
  impact     text        NOT NULL DEFAULT 'Medium'    CHECK (impact IN ('Critical','High','Medium','Low')),
  created_by uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hq_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hq_decisions: staff read"     ON public.hq_decisions FOR SELECT TO authenticated USING  (public.current_user_role() IN ('admin','manager','teacher'));
CREATE POLICY "hq_decisions: managers write" ON public.hq_decisions FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_decisions: managers update"ON public.hq_decisions FOR UPDATE TO authenticated USING  (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_decisions: admins delete"  ON public.hq_decisions FOR DELETE TO authenticated USING  (public.current_user_role() = 'admin');

-- Seed data (idempotent)
INSERT INTO public.hq_decisions (title, owner, status, impact)
SELECT * FROM (VALUES
  ('RLS is the authorization source of truth', 'Security Officer', 'Accepted', 'Critical'),
  ('Canvas block model for lessons (flat course_blocks)', 'The Architect', 'Accepted', 'High'),
  ('HQ governance tables separate from LMS runtime', 'The Engineer', 'Accepted', 'Medium'),
  ('shadcn/ui as UI component library', 'The Architect', 'Accepted', 'Medium'),
  ('Two-layer identity: profiles.uid vs profiles.auth_id', 'The Engineer', 'Accepted', 'Critical')
) AS v(title, owner, status, impact)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_decisions LIMIT 1);

INSERT INTO public.hq_risks (title, mitigation, severity, probability, owner)
SELECT * FROM (VALUES
  ('RLS gaps may expose student records', 'Policy tests for every role path.', 5, 3, 'Security Officer'),
  ('Feature bloat delays MVP', 'Phase-gate roadmap; enforce acceptance criteria.', 4, 4, 'Product Manager'),
  ('AI tutor gives unsupervised incorrect guidance', 'Teacher-owned sources, citations, safe refusal.', 4, 3, 'AI Tutor Designer'),
  ('Migration errors corrupt identity split', 'Full migration test suite before each push.', 5, 2, 'The Engineer'),
  ('Open course access via missing enrollment gates', 'Enrollment RLS tested for every role.', 4, 3, 'Security Officer')
) AS v(title, mitigation, severity, probability, owner)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_risks LIMIT 1);

INSERT INTO public.hq_tasks (title, status, owner, priority, source)
SELECT * FROM (VALUES
  ('Write RLS tests for enrollments', 'backlog', 'The Tester', 'P0', 'manual'),
  ('Draft ADR-001: Canvas Block Model', 'in_progress', 'The Architect', 'P1', 'manual'),
  ('Build course builder UI', 'done', 'The Implementer', 'P0', 'manual'),
  ('Implement gradebook schema', 'backlog', 'The Engineer', 'P1', 'manual'),
  ('Design AI tutor memory architecture', 'backlog', 'AI Tutor Designer', 'P2', 'manual'),
  ('Create Playwright E2E test suite', 'backlog', 'The Tester', 'P1', 'manual'),
  ('Set up GitHub Actions CI pipeline', 'backlog', 'DevOps Officer', 'P1', 'manual')
) AS v(title, status, owner, priority, source)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_tasks LIMIT 1);
