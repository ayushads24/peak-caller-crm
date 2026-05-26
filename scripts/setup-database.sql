-- ============================================================
-- PEAK CALLER CRM — Full Database Setup
-- Run this once in the Supabase SQL Editor for your project
-- ============================================================

-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'caller');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed');
CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'completed', 'cancelled', 'rescheduled');
CREATE TYPE public.activity_type AS ENUM ('lead_created','status_changed','note_added','task_created','task_completed','meeting_scheduled','meeting_completed','call_logged','assignment_changed','lead_updated','label_changed');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager'))
$$;

-- ============ STATUSES ============
CREATE TABLE public.statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_sales BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;

-- ============ LABELS ============
CREATE TABLE public.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

-- ============ LEADS ============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  lead_source TEXT,
  sales_value NUMERIC(12,2),
  status_id UUID REFERENCES public.statuses(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX idx_leads_status_id ON public.leads(status_id);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

-- ============ LEAD LABELS ============
CREATE TABLE public.lead_labels (
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, label_id)
);
ALTER TABLE public.lead_labels ENABLE ROW LEVEL SECURITY;

-- ============ NOTES ============
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notes_lead_id ON public.notes(lead_id);

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  status task_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_lead_id ON public.tasks(lead_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);

-- ============ ACTIVITIES ============
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activities_lead_id ON public.activities(lead_id, created_at DESC);

-- ============ MEETINGS ============
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Meeting',
  scheduled_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status meeting_status NOT NULL DEFAULT 'scheduled',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_meetings_lead_id ON public.meetings(lead_id);

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.can_access_lead(_user_id UUID, _lead_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_admin_or_manager(_user_id)
    OR EXISTS (SELECT 1 FROM public.leads WHERE id = _lead_id AND (assigned_to = _user_id OR created_by = _user_id))
$$;

-- ============ RLS POLICIES ============
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "roles_select_self" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "statuses_select_all" ON public.statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "statuses_admin_manage" ON public.statuses FOR ALL TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "labels_select_all" ON public.labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "labels_auth_insert" ON public.labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "labels_admin_update" ON public.labels FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "labels_admin_delete" ON public.labels FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "lead_labels_select" ON public.lead_labels FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "lead_labels_insert" ON public.lead_labels FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "lead_labels_delete" ON public.lead_labels FOR DELETE TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));

CREATE POLICY "notes_select" ON public.notes FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "notes_insert" ON public.notes FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid(), lead_id) AND created_by = auth.uid());
CREATE POLICY "notes_delete" ON public.notes FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_admin_or_manager(auth.uid()));

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));

CREATE POLICY "activities_select" ON public.activities FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "activities_insert" ON public.activities FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid(), lead_id));

CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'caller');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.log_lead_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_status_name TEXT;
  new_status_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities(lead_id, type, description, created_by)
    VALUES (NEW.id, 'lead_created', 'Lead created', NEW.created_by);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
      SELECT name INTO old_status_name FROM public.statuses WHERE id = OLD.status_id;
      SELECT name INTO new_status_name FROM public.statuses WHERE id = NEW.status_id;
      INSERT INTO public.activities(lead_id, type, description, created_by, metadata)
      VALUES (NEW.id, 'status_changed',
        'Status changed' || COALESCE(' from ' || old_status_name, '') || COALESCE(' to ' || new_status_name, ''),
        auth.uid(),
        jsonb_build_object('from', old_status_name, 'to', new_status_name));
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.activities(lead_id, type, description, created_by)
      VALUES (NEW.id, 'assignment_changed', 'Lead reassigned', auth.uid());
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER leads_activity_log AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.log_lead_activity();

CREATE OR REPLACE FUNCTION public.log_note_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activities(lead_id, type, description, created_by)
  VALUES (NEW.lead_id, 'note_added', 'Note added', NEW.created_by);
  RETURN NEW;
END; $$;
CREATE TRIGGER notes_activity_log AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.log_note_activity();

CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities(lead_id, type, description, created_by)
    VALUES (NEW.lead_id, 'task_created', 'Task created: ' || NEW.title, NEW.created_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    INSERT INTO public.activities(lead_id, type, description, created_by)
    VALUES (NEW.lead_id, 'task_completed', 'Task completed: ' || NEW.title, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tasks_activity_log AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

CREATE OR REPLACE FUNCTION public.log_meeting_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities(lead_id, type, description, created_by)
    VALUES (NEW.lead_id, 'meeting_scheduled', 'Meeting scheduled', NEW.created_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    INSERT INTO public.activities(lead_id, type, description, created_by)
    VALUES (NEW.lead_id, 'meeting_completed', 'Meeting completed', auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER meetings_activity_log AFTER INSERT OR UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.log_meeting_activity();

-- ============ SEED DATA ============
INSERT INTO public.statuses (name, color, sort_order, is_sales, is_lost) VALUES
  ('Fresh', '#3b82f6', 1, false, false),
  ('Requirement Taken', '#06b6d4', 2, false, false),
  ('Quotation Sent', '#8b5cf6', 3, false, false),
  ('Interested In Meeting', '#ec4899', 4, false, false),
  ('Potential Meeting', '#f43f5e', 5, false, false),
  ('Meeting Scheduled', '#f59e0b', 6, false, false),
  ('Meeting Stage With Vinay', '#fb923c', 7, false, false),
  ('Meeting Done With Vinay', '#84cc16', 8, false, false),
  ('Meeting Stage With Paras', '#14b8a6', 9, false, false),
  ('Meeting Done With Paras', '#22c55e', 10, false, false),
  ('Token Received', '#10b981', 11, false, false),
  ('Sales', '#059669', 12, true, false),
  ('Lost', '#ef4444', 13, false, true);

INSERT INTO public.labels (name, color) VALUES
  ('January', '#3b82f6'),('February', '#06b6d4'),('March', '#10b981'),
  ('April', '#84cc16'),('May', '#eab308'),('June', '#f59e0b'),
  ('July', '#f97316'),('August', '#ef4444'),('September', '#ec4899'),
  ('October', '#a855f7'),('November', '#8b5cf6'),('December', '#6366f1'),
  ('Pre Wedding', '#d946ef');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;

-- ============ SECURITY: REVOKE FROM ANON ============
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_lead_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_note_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_task_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_meeting_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) TO authenticated;
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- ============ ATTENDANCE ============
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  work_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  punch_in_at timestamptz NOT NULL DEFAULT now(),
  punch_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_select ON public.attendance FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY attendance_update ON public.attendance FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

-- ============ CALLS ============
CREATE TYPE public.call_status AS ENUM ('connected','not_connected','voicemail','busy','wrong_number');
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status public.call_status NOT NULL DEFAULT 'not_connected',
  duration_seconds integer NOT NULL DEFAULT 0,
  notes text,
  called_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_user_called_at ON public.calls (user_id, called_at DESC);
CREATE INDEX idx_calls_lead ON public.calls (lead_id);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY calls_select ON public.calls FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY calls_insert ON public.calls FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY calls_update ON public.calls FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY calls_delete ON public.calls FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_call_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.activities(lead_id, type, description, created_by, metadata)
  VALUES (
    NEW.lead_id, 'call_logged',
    'Call ' || NEW.status::text || COALESCE(' (' || NEW.duration_seconds || 's)', ''),
    NEW.user_id,
    jsonb_build_object('status', NEW.status, 'duration_seconds', NEW.duration_seconds)
  );
  RETURN NEW;
END $$;
CREATE TRIGGER calls_log_activity AFTER INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.log_call_activity();

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;

-- ============ EXTRA ENUMS & ROLES ============
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'team_leader';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'project_manager';
CREATE TYPE public.flow_status AS ENUM ('active','paused','completed');
CREATE TYPE public.flow_item_status AS ENUM ('pending','in_progress','done','skipped','rescheduled');
CREATE TYPE public.flow_category AS ENUM ('fresh','interested_meeting','quotation_sent','followup');
CREATE TYPE public.break_type AS ENUM ('lunch','tea','meeting','other');

-- ============ CALLING FLOWS ============
CREATE TABLE public.calling_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  work_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  name TEXT,
  status public.flow_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, work_date)
);
ALTER TABLE public.calling_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY flows_select ON public.calling_flows FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY flows_insert ON public.calling_flows FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY flows_update ON public.calling_flows FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY flows_delete ON public.calling_flows FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

CREATE TABLE public.calling_flow_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.calling_flows(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  category public.flow_category NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  attempts_planned integer NOT NULL DEFAULT 2,
  attempts_done integer NOT NULL DEFAULT 0,
  status public.flow_item_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, lead_id)
);
CREATE INDEX idx_flow_items_flow ON public.calling_flow_items (flow_id, priority, status);
ALTER TABLE public.calling_flow_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_items_select ON public.calling_flow_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = flow_id AND (f.user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()))));
CREATE POLICY flow_items_insert ON public.calling_flow_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = flow_id AND f.user_id = auth.uid()));
CREATE POLICY flow_items_update ON public.calling_flow_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = flow_id AND (f.user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()))));
CREATE POLICY flow_items_delete ON public.calling_flow_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = flow_id AND (f.user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()))));

CREATE TABLE public.breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type public.break_type NOT NULL DEFAULT 'other',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_breaks_user_active ON public.breaks (user_id) WHERE ended_at IS NULL;
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY breaks_select ON public.breaks FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY breaks_insert ON public.breaks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY breaks_update ON public.breaks FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.calling_flows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calling_flow_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.breaks;

-- ============ TEAMS ============
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  leader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_team_leader_of(_user_id uuid, _team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.teams WHERE id = _team_id AND leader_id = _user_id)
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR has_role(auth.uid(), 'team_leader')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.team_id = teams.id)
  );
CREATE POLICY teams_admin_manage ON public.teams FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- ============ PERMISSIONS ============
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

CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_perms_select ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_perms_admin_manage ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _key
  ) OR public.has_role(_user_id, 'admin')
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

INSERT INTO public.permissions (key, module, action, label, sort_order) VALUES
  ('dashboard.view','dashboard','view','View Dashboard',10),
  ('leads.view','leads','view','View Leads',20),
  ('leads.create','leads','create','Create Leads',21),
  ('leads.edit','leads','edit','Edit Leads',22),
  ('leads.delete','leads','delete','Delete Leads',23),
  ('leads.assign','leads','edit','Assign Leads',24),
  ('leads.change_status','leads','edit','Change Lead Status',25),
  ('leads.export','leads','export','Export Leads',26),
  ('leads.import','leads','create','Import Leads',27),
  ('leads.bulk','leads','edit','Bulk Actions on Leads',28),
  ('workflow.view','workflow','view','Access Calling Workflow',30),
  ('workflow.manage','workflow','edit','Manage Workflow',31),
  ('tasks.view','tasks','view','View Tasks',40),
  ('tasks.create','tasks','create','Create Tasks',41),
  ('tasks.edit','tasks','edit','Edit Tasks',42),
  ('tasks.delete','tasks','delete','Delete Tasks',43),
  ('reports.view_own','reports','view','View Own Reports',50),
  ('reports.view_team','reports','view','View Team Reports',51),
  ('reports.view_all','reports','view','View All Reports',52),
  ('reports.view_sales','reports','view','View Sales Data',53),
  ('users.view','users','view','View Users',60),
  ('users.manage','users','edit','Manage Users',61),
  ('settings.view','settings','view','View Settings',70),
  ('settings.manage','settings','edit','Manage Settings',71),
  ('analytics.view','analytics','view','View Analytics',80)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
  SELECT 'admin'::public.app_role, key FROM public.permissions ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('team_leader','dashboard.view'),('team_leader','leads.view'),('team_leader','leads.create'),
  ('team_leader','leads.edit'),('team_leader','leads.assign'),('team_leader','leads.change_status'),
  ('team_leader','leads.export'),('team_leader','leads.bulk'),('team_leader','workflow.view'),
  ('team_leader','workflow.manage'),('team_leader','tasks.view'),('team_leader','tasks.create'),
  ('team_leader','tasks.edit'),('team_leader','reports.view_own'),('team_leader','reports.view_team'),
  ('team_leader','reports.view_sales'),('team_leader','analytics.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('caller','dashboard.view'),('caller','leads.view'),('caller','leads.edit'),
  ('caller','leads.change_status'),('caller','workflow.view'),('caller','tasks.view'),
  ('caller','tasks.create'),('caller','tasks.edit'),('caller','reports.view_own')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('project_manager','dashboard.view'),('project_manager','leads.view'),
  ('project_manager','leads.edit'),('project_manager','leads.change_status'),
  ('project_manager','workflow.view'),('project_manager','tasks.view'),
  ('project_manager','tasks.create'),('project_manager','tasks.edit'),
  ('project_manager','reports.view_own'),('project_manager','reports.view_team')
ON CONFLICT DO NOTHING;

-- ============ IMPORT BATCHES ============
CREATE TABLE public.import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_batches_select ON public.import_batches FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY import_batches_insert ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_import_batches_user_created ON public.import_batches(user_id, created_at DESC);

-- Tasks: add assigned_to and priority
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_to uuid;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);

DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority public.task_priority NOT NULL DEFAULT 'medium';
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status ON public.tasks(assigned_to, status);

-- Leads: default status = Fresh (dynamic, no hardcoded UUID)
DO $$
DECLARE fresh_id uuid;
BEGIN
  SELECT id INTO fresh_id FROM public.statuses WHERE name = 'Fresh';
  IF fresh_id IS NOT NULL THEN
    UPDATE public.leads SET status_id = fresh_id WHERE status_id IS NULL;
    EXECUTE format('ALTER TABLE public.leads ALTER COLUMN status_id SET DEFAULT %L::uuid', fresh_id);
  END IF;
END $$;

-- Leads: imported_at
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS idx_leads_imported_at ON public.leads (imported_at DESC);

-- ============ ADVANCED POLICIES (team leader scope) ============
CREATE OR REPLACE FUNCTION public.can_manage_user_workflow(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _actor = _target
    OR public.is_admin_or_manager(_actor)
    OR EXISTS (
      SELECT 1 FROM public.profiles p JOIN public.teams t ON t.id = p.team_id
      WHERE p.id = _target AND t.leader_id = _actor
    )
$$;

DROP POLICY IF EXISTS flows_insert ON public.calling_flows;
DROP POLICY IF EXISTS flows_select ON public.calling_flows;
DROP POLICY IF EXISTS flows_update ON public.calling_flows;
DROP POLICY IF EXISTS flows_delete ON public.calling_flows;
CREATE POLICY flows_insert ON public.calling_flows FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_user_workflow(auth.uid(), user_id));
CREATE POLICY flows_select ON public.calling_flows FOR SELECT TO authenticated
  USING (public.can_manage_user_workflow(auth.uid(), user_id));
CREATE POLICY flows_update ON public.calling_flows FOR UPDATE TO authenticated
  USING (public.can_manage_user_workflow(auth.uid(), user_id));
CREATE POLICY flows_delete ON public.calling_flows FOR DELETE TO authenticated
  USING (public.can_manage_user_workflow(auth.uid(), user_id));

DROP POLICY IF EXISTS flow_items_insert ON public.calling_flow_items;
DROP POLICY IF EXISTS flow_items_select ON public.calling_flow_items;
DROP POLICY IF EXISTS flow_items_update ON public.calling_flow_items;
DROP POLICY IF EXISTS flow_items_delete ON public.calling_flow_items;
CREATE POLICY flow_items_insert ON public.calling_flow_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = calling_flow_items.flow_id AND public.can_manage_user_workflow(auth.uid(), f.user_id)));
CREATE POLICY flow_items_select ON public.calling_flow_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = calling_flow_items.flow_id AND public.can_manage_user_workflow(auth.uid(), f.user_id)));
CREATE POLICY flow_items_update ON public.calling_flow_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = calling_flow_items.flow_id AND public.can_manage_user_workflow(auth.uid(), f.user_id)));
CREATE POLICY flow_items_delete ON public.calling_flow_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calling_flows f WHERE f.id = calling_flow_items.flow_id AND public.can_manage_user_workflow(auth.uid(), f.user_id)));

CREATE OR REPLACE FUNCTION public.is_team_member_of_leader(_member uuid, _leader uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.teams t ON t.id = p.team_id
    WHERE p.id = _member AND t.leader_id = _leader
  )
$$;

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_manager(auth.uid()) OR public.is_team_member_of_leader(id, auth.uid()));

-- Profiles directory view
DROP VIEW IF EXISTS public.profiles_directory;
CREATE VIEW public.profiles_directory WITH (security_invoker = false) AS
  SELECT id, full_name, email, avatar_url, designation, team_id, is_active FROM public.profiles;
GRANT SELECT ON public.profiles_directory TO authenticated;

-- ============ DISTRIBUTION & ASSIGNMENT ============
CREATE TYPE public.distribution_method AS ENUM ('round_robin','manual','percentage','priority','source','availability');
CREATE TYPE public.assignment_method AS ENUM ('round_robin','manual','percentage','priority','source','availability','system');
CREATE TYPE public.lead_priority AS ENUM ('low','normal','high','hot');

ALTER TABLE public.leads
  ADD COLUMN priority public.lead_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN assigned_at timestamptz;

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
  USING (public.is_admin_or_manager(auth.uid()) OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id)));
CREATE POLICY "dist_rules_insert" ON public.distribution_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id)));
CREATE POLICY "dist_rules_update" ON public.distribution_rules FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id)));
CREATE POLICY "dist_rules_delete" ON public.distribution_rules FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR (team_id IS NOT NULL AND public.is_team_leader_of(auth.uid(), team_id)));
CREATE TRIGGER trg_dist_rules_updated_at BEFORE UPDATE ON public.distribution_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  USING (
    public.is_admin_or_manager(auth.uid())
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_assignment_history.lead_id AND (l.created_by = auth.uid() OR l.assigned_to = auth.uid()))
    OR (to_user_id IS NOT NULL AND public.is_team_member_of_leader(to_user_id, auth.uid()))
    OR (from_user_id IS NOT NULL AND public.is_team_member_of_leader(from_user_id, auth.uid()))
  );
CREATE POLICY "lah_insert" ON public.lead_assignment_history FOR INSERT TO authenticated
  WITH CHECK (public.can_access_lead(auth.uid(), lead_id));

CREATE OR REPLACE FUNCTION public.log_lead_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    VALUES (NEW.id, OLD.assigned_to, NEW.assigned_to, auth.uid(), method_val,
      NULLIF(current_setting('app.assignment_reason', true), ''));
    NEW.assigned_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_lead_assignment BEFORE INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_assignment();

INSERT INTO public.permissions(key, module, action, label, sort_order)
  VALUES ('leads.distribute','leads','distribute','Distribute Leads',100) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('admin','leads.distribute'),('manager','leads.distribute'),('team_leader','leads.distribute')
ON CONFLICT DO NOTHING;

-- ============ TEAM LEADER LEADS POLICY ============
CREATE POLICY "leads_select_team_leader" ON public.leads FOR SELECT TO authenticated
  USING (
    assigned_to IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles p JOIN public.teams t ON t.id = p.team_id
      WHERE p.id = leads.assigned_to AND t.leader_id = auth.uid()
    )
  );

DELETE FROM public.calling_flow_items WHERE lead_id NOT IN (SELECT id FROM public.leads);
ALTER TABLE public.calling_flow_items
  ADD CONSTRAINT calling_flow_items_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- ============ ACTIVITIES ADMIN POLICIES ============
CREATE POLICY activities_admin_update ON public.activities FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY activities_admin_delete ON public.activities FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- ============ FINAL SECURITY LOCKDOWN ============
DROP POLICY IF EXISTS labels_auth_insert ON public.labels;
CREATE POLICY labels_auth_insert ON public.labels FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR public.has_role(auth.uid(), 'team_leader'::public.app_role));

DROP POLICY IF EXISTS user_roles_block_self_insert ON public.user_roles;
CREATE POLICY user_roles_block_self_insert ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.log_task_activity(),
  public.log_meeting_activity(),
  public.log_lead_activity(),
  public.log_call_activity(),
  public.log_note_activity(),
  public.log_lead_assignment(),
  public.handle_new_user(),
  public.set_updated_at()
FROM PUBLIC, anon, authenticated;
