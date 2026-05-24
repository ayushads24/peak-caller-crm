
-- Enums
CREATE TYPE public.distribution_method AS ENUM ('round_robin','manual','percentage','priority','source','availability');
CREATE TYPE public.assignment_method AS ENUM ('round_robin','manual','percentage','priority','source','availability','system');
CREATE TYPE public.lead_priority AS ENUM ('low','normal','high','hot');

-- leads: add priority and assigned_at
ALTER TABLE public.leads
  ADD COLUMN priority public.lead_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN assigned_at timestamptz;

-- distribution_rules
CREATE TABLE public.distribution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  method public.distribution_method NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_distribution_rules_team ON public.distribution_rules(team_id);

ALTER TABLE public.distribution_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dist_rules_select" ON public.distribution_rules FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id))
);
CREATE POLICY "dist_rules_insert" ON public.distribution_rules FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_or_manager(auth.uid())
  OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id))
);
CREATE POLICY "dist_rules_update" ON public.distribution_rules FOR UPDATE TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id))
);
CREATE POLICY "dist_rules_delete" ON public.distribution_rules FOR DELETE TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id))
);

CREATE TRIGGER trg_dist_rules_updated_at BEFORE UPDATE ON public.distribution_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- lead_assignment_history
CREATE TABLE public.lead_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  from_user_id uuid,
  to_user_id uuid,
  assigned_by uuid,
  method public.assignment_method NOT NULL DEFAULT 'manual',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lah_lead ON public.lead_assignment_history(lead_id);
CREATE INDEX idx_lah_to_user ON public.lead_assignment_history(to_user_id);
CREATE INDEX idx_lah_created_at ON public.lead_assignment_history(created_at DESC);

ALTER TABLE public.lead_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lah_select" ON public.lead_assignment_history FOR SELECT TO authenticated
USING (public.can_access_lead(auth.uid(), lead_id));

CREATE POLICY "lah_insert" ON public.lead_assignment_history FOR INSERT TO authenticated
WITH CHECK (public.can_access_lead(auth.uid(), lead_id));

-- Trigger: log assignment changes
CREATE OR REPLACE FUNCTION public.log_lead_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  method_val public.assignment_method;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.lead_assignment_history(lead_id, from_user_id, to_user_id, assigned_by, method)
      VALUES (NEW.id, NULL, NEW.assigned_to, COALESCE(auth.uid(), NEW.created_by), 'manual');
      NEW.assigned_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    method_val := COALESCE(NULLIF(current_setting('app.assignment_method', true), '')::public.assignment_method, 'manual');
    INSERT INTO public.lead_assignment_history(lead_id, from_user_id, to_user_id, assigned_by, method, reason)
    VALUES (
      NEW.id, OLD.assigned_to, NEW.assigned_to, auth.uid(), method_val,
      NULLIF(current_setting('app.assignment_reason', true), '')
    );
    NEW.assigned_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_lead_assignment
BEFORE INSERT OR UPDATE OF assigned_to ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_assignment();

-- Permission: leads.distribute
INSERT INTO public.permissions(key, module, action, label, sort_order)
VALUES ('leads.distribute', 'leads', 'distribute', 'Distribute Leads', 100)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('admin', 'leads.distribute'),
  ('manager', 'leads.distribute'),
  ('team_leader', 'leads.distribute')
ON CONFLICT DO NOTHING;
