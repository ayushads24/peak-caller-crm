
-- Fix is_admin_or_manager to include team_leader (frontend already treats them as managers)
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'manager', 'team_leader')
  )
$$;

-- Give team_leader the leads.delete permission
INSERT INTO public.role_permissions (role, permission_key)
VALUES ('team_leader', 'leads.delete')
ON CONFLICT DO NOTHING;
