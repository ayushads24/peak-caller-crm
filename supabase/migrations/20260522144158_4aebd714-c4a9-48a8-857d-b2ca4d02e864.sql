
CREATE TYPE public.flow_status AS ENUM ('active','paused','completed');
CREATE TYPE public.flow_item_status AS ENUM ('pending','in_progress','done','skipped','rescheduled');
CREATE TYPE public.flow_category AS ENUM ('fresh','interested_meeting','quotation_sent','followup');
CREATE TYPE public.break_type AS ENUM ('lunch','tea','meeting','other');

CREATE TABLE public.calling_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  work_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
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
