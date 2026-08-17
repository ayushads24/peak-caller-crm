-- ============================================================
-- ANALYTICS LAYER
-- lead_status_history + analytics schema views + analytics_ro
-- ============================================================


-- ============================================================
-- 1. lead_status_history  (structured status-change log)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_status_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_status_id   UUID        REFERENCES public.statuses(id) ON DELETE SET NULL,
  to_status_id     UUID        REFERENCES public.statuses(id) ON DELETE SET NULL,
  from_status_name TEXT,
  to_status_name   TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS lsh_lead_id_idx    ON public.lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS lsh_changed_at_idx ON public.lead_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS lsh_to_status_idx  ON public.lead_status_history(to_status_id);

ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (admin/TL will read via service role anyway)
CREATE POLICY "lsh_select_auth" ON public.lead_status_history
  FOR SELECT TO authenticated USING (true);

-- Trigger function: fires on every leads.status_id change
CREATE OR REPLACE FUNCTION public.log_lead_status_history()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- guard: only run when status actually changed
  IF NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lead_status_history (
    lead_id,
    from_status_id, from_status_name,
    to_status_id,   to_status_name,
    changed_by
  ) VALUES (
    NEW.id,
    OLD.status_id, (SELECT name FROM public.statuses WHERE id = OLD.status_id),
    NEW.status_id, (SELECT name FROM public.statuses WHERE id = NEW.status_id),
    auth.uid()   -- NULL for server-side (admin client) updates — that's fine
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if re-running migration
DROP TRIGGER IF EXISTS leads_status_history_trigger ON public.leads;

CREATE TRIGGER leads_status_history_trigger
  AFTER UPDATE ON public.leads
  FOR EACH ROW WHEN (NEW.status_id IS DISTINCT FROM OLD.status_id)
  EXECUTE FUNCTION public.log_lead_status_history();


-- ============================================================
-- 2. analytics schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS analytics;

-- -------- v_leads --------
-- Reporting columns only: no email, no phone (PII), no doubletick_contact_id (internal)
-- sales_value IS included — it's the conversion metric
CREATE OR REPLACE VIEW analytics.v_leads AS
SELECT
  l.id,
  l.client_name,
  l.lead_source,
  l.sales_value,
  s.name          AS status_name,
  s.color         AS status_color,
  s.is_sales,
  s.is_lost,
  p_a.full_name   AS assigned_to_name,
  p_c.full_name   AS created_by_name,
  (l.created_at AT TIME ZONE 'Asia/Kolkata')::date AS created_date,
  (l.updated_at AT TIME ZONE 'Asia/Kolkata')::date AS updated_date,
  (l.closed_at  AT TIME ZONE 'Asia/Kolkata')::date AS closed_date,
  l.created_at,
  l.updated_at,
  l.closed_at
FROM public.leads l
LEFT JOIN public.statuses s   ON s.id  = l.status_id
LEFT JOIN public.profiles p_a ON p_a.id = l.assigned_to
LEFT JOIN public.profiles p_c ON p_c.id = l.created_by;

-- -------- v_calls --------
-- Exclude: notes (internal call notes)
CREATE OR REPLACE VIEW analytics.v_calls AS
SELECT
  c.id,
  c.lead_id,
  c.user_id,
  p.full_name       AS caller_name,
  c.status          AS call_status,  -- 'connected' | 'not_connected'
  c.duration_seconds,
  (c.called_at AT TIME ZONE 'Asia/Kolkata')::date AS call_date,
  c.called_at
FROM public.calls c
LEFT JOIN public.profiles p ON p.id = c.user_id;

-- -------- v_meetings --------
-- Exclude: notes (internal meeting notes)
CREATE OR REPLACE VIEW analytics.v_meetings AS
SELECT
  m.id,
  m.lead_id,
  m.title,
  m.status          AS meeting_status,  -- scheduled | completed | cancelled | rescheduled
  p.full_name       AS created_by_name,
  (m.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date AS scheduled_date,
  (m.created_at   AT TIME ZONE 'Asia/Kolkata')::date AS created_date,
  m.scheduled_at,
  m.created_at
FROM public.meetings m
LEFT JOIN public.profiles p ON p.id = m.created_by;

-- -------- v_lead_timeline --------
-- Full status-change history with IST dates, lead name, and actor name
CREATE OR REPLACE VIEW analytics.v_lead_timeline AS
SELECT
  h.id,
  h.lead_id,
  l.client_name,
  l.lead_source,
  h.from_status_name,
  h.to_status_name,
  fs.is_sales      AS from_is_sales,
  fs.is_lost       AS from_is_lost,
  ts.is_sales      AS to_is_sales,
  ts.is_lost       AS to_is_lost,
  p.full_name      AS changed_by_name,
  (h.changed_at AT TIME ZONE 'Asia/Kolkata')::date AS changed_date,
  h.changed_at
FROM public.lead_status_history h
LEFT JOIN public.leads    l  ON l.id  = h.lead_id
LEFT JOIN public.statuses fs ON fs.id = h.from_status_id
LEFT JOIN public.statuses ts ON ts.id = h.to_status_id
LEFT JOIN public.profiles p  ON p.id  = h.changed_by;


-- ============================================================
-- 3. analytics_ro role
--    SELECT on analytics schema only.
--    No direct access to public schema.
--    statement_timeout = 8s to protect DB from long AI queries.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_ro') THEN
    CREATE ROLE analytics_ro NOLOGIN;
  END IF;
END;
$$;

-- Strip any accidental public schema access
REVOKE ALL PRIVILEGES ON SCHEMA public FROM analytics_ro;
REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM analytics_ro;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM analytics_ro;

-- Grant only analytics schema
GRANT USAGE  ON SCHEMA analytics TO analytics_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO analytics_ro;

-- Future views in analytics schema auto-grant SELECT to analytics_ro
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
  GRANT SELECT ON TABLES TO analytics_ro;

-- Hard cap on query time (protects DB from runaway AI queries)
ALTER ROLE analytics_ro SET statement_timeout = '8s';
