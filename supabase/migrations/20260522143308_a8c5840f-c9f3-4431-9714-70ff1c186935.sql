
-- Attendance table
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

-- Call status enum
CREATE TYPE public.call_status AS ENUM ('connected','not_connected','voicemail','busy','wrong_number');

-- Calls table
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

-- Log call activity
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

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
