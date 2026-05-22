
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

-- ============ HELPER: can access lead? ============
CREATE OR REPLACE FUNCTION public.can_access_lead(_user_id UUID, _lead_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_admin_or_manager(_user_id)
    OR EXISTS (SELECT 1 FROM public.leads WHERE id = _lead_id AND (assigned_to = _user_id OR created_by = _user_id))
$$;

-- ============ RLS POLICIES ============

-- profiles: every authenticated user can read all profiles (needed for assignee names); users can update own
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles: users can see their own roles; admins can see/manage all
CREATE POLICY "roles_select_self" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- statuses
CREATE POLICY "statuses_select_all" ON public.statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "statuses_admin_manage" ON public.statuses FOR ALL TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- labels
CREATE POLICY "labels_select_all" ON public.labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "labels_auth_insert" ON public.labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "labels_admin_update" ON public.labels FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "labels_admin_delete" ON public.labels FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

-- leads
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR created_by = auth.uid());

-- lead_labels: derived from lead access
CREATE POLICY "lead_labels_select" ON public.lead_labels FOR SELECT TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "lead_labels_insert" ON public.lead_labels FOR INSERT TO authenticated WITH CHECK (public.can_access_lead(auth.uid(), lead_id));
CREATE POLICY "lead_labels_delete" ON public.lead_labels FOR DELETE TO authenticated USING (public.can_access_lead(auth.uid(), lead_id));

-- notes / tasks / activities / meetings: scoped by lead access
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

-- new user → profile + role (first user = admin, else caller)
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

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-log activities
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

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
