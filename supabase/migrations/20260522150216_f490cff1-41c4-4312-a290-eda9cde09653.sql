
-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  leader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER teams_set_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: is user the leader of a given team
CREATE OR REPLACE FUNCTION public.is_team_leader_of(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.teams WHERE id = _team_id AND leader_id = _user_id)
$$;

-- Profiles: extra fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- RLS for teams
CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR has_role(auth.uid(), 'team_leader')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.team_id = teams.id)
);

CREATE POLICY teams_admin_manage ON public.teams FOR ALL TO authenticated
USING (public.is_admin_or_manager(auth.uid()))
WITH CHECK (public.is_admin_or_manager(auth.uid()));
