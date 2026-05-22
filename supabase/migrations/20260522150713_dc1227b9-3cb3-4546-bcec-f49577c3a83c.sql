
-- 1. Permissions catalog
CREATE TABLE public.permissions (
  key text PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_admin_manage ON public.permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2. Role -> Permissions mapping
CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_perms_select ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_perms_admin_manage ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 3. Helper: does user have a permission via any of their roles?
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _key
  ) OR public.has_role(_user_id, 'admin')
$$;

-- 4. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- 5. Seed permissions (module, action, key, label)
INSERT INTO public.permissions (key, module, action, label, sort_order) VALUES
  -- Dashboard
  ('dashboard.view',       'dashboard', 'view',   'View Dashboard',       10),
  -- Leads
  ('leads.view',           'leads',     'view',   'View Leads',           20),
  ('leads.create',         'leads',     'create', 'Create Leads',         21),
  ('leads.edit',           'leads',     'edit',   'Edit Leads',           22),
  ('leads.delete',         'leads',     'delete', 'Delete Leads',         23),
  ('leads.assign',         'leads',     'edit',   'Assign Leads',         24),
  ('leads.change_status',  'leads',     'edit',   'Change Lead Status',   25),
  ('leads.export',         'leads',     'export', 'Export Leads',         26),
  ('leads.import',         'leads',     'create', 'Import Leads',         27),
  ('leads.bulk',           'leads',     'edit',   'Bulk Actions on Leads',28),
  -- Workflow
  ('workflow.view',        'workflow',  'view',   'Access Calling Workflow', 30),
  ('workflow.manage',      'workflow',  'edit',   'Manage Workflow',      31),
  -- Tasks
  ('tasks.view',           'tasks',     'view',   'View Tasks',           40),
  ('tasks.create',         'tasks',     'create', 'Create Tasks',         41),
  ('tasks.edit',           'tasks',     'edit',   'Edit Tasks',           42),
  ('tasks.delete',         'tasks',     'delete', 'Delete Tasks',         43),
  -- Reports
  ('reports.view_own',     'reports',   'view',   'View Own Reports',     50),
  ('reports.view_team',    'reports',   'view',   'View Team Reports',    51),
  ('reports.view_all',     'reports',   'view',   'View All Reports',     52),
  ('reports.view_sales',   'reports',   'view',   'View Sales Data',      53),
  -- Users
  ('users.view',           'users',     'view',   'View Users',           60),
  ('users.manage',         'users',     'edit',   'Manage Users',         61),
  -- Settings
  ('settings.view',        'settings',  'view',   'View Settings',        70),
  ('settings.manage',      'settings',  'edit',   'Manage Settings',      71),
  -- Analytics
  ('analytics.view',       'analytics', 'view',   'View Analytics',       80)
ON CONFLICT (key) DO NOTHING;

-- 6. Default role permissions
-- Admin: everything
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

-- Team Leader: dashboard, leads (view/edit/assign/status/bulk/export), workflow, tasks, team reports, sales
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('team_leader','dashboard.view'),
  ('team_leader','leads.view'),('team_leader','leads.create'),('team_leader','leads.edit'),
  ('team_leader','leads.assign'),('team_leader','leads.change_status'),
  ('team_leader','leads.export'),('team_leader','leads.bulk'),
  ('team_leader','workflow.view'),('team_leader','workflow.manage'),
  ('team_leader','tasks.view'),('team_leader','tasks.create'),('team_leader','tasks.edit'),
  ('team_leader','reports.view_own'),('team_leader','reports.view_team'),('team_leader','reports.view_sales'),
  ('team_leader','analytics.view')
ON CONFLICT DO NOTHING;

-- Caller: dashboard, view/edit own leads, change status, workflow, own tasks, own reports
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('caller','dashboard.view'),
  ('caller','leads.view'),('caller','leads.edit'),('caller','leads.change_status'),
  ('caller','workflow.view'),
  ('caller','tasks.view'),('caller','tasks.create'),('caller','tasks.edit'),
  ('caller','reports.view_own')
ON CONFLICT DO NOTHING;

-- Project Manager: same as caller + view team reports
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('project_manager','dashboard.view'),
  ('project_manager','leads.view'),('project_manager','leads.edit'),('project_manager','leads.change_status'),
  ('project_manager','workflow.view'),
  ('project_manager','tasks.view'),('project_manager','tasks.create'),('project_manager','tasks.edit'),
  ('project_manager','reports.view_own'),('project_manager','reports.view_team')
ON CONFLICT DO NOTHING;
