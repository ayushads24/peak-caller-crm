-- Performance indexes: speed up high-frequency queries

-- activities: type-filtered queries (movement filter + dashboard activity feed)
CREATE INDEX IF NOT EXISTS idx_activities_type_created_at
  ON public.activities(type, created_at DESC);

-- leads: phone duplicate-check on add-lead
CREATE INDEX IF NOT EXISTS idx_leads_phone
  ON public.leads(phone) WHERE phone IS NOT NULL;

-- leads: caller-specific queries (created_by = user)
CREATE INDEX IF NOT EXISTS idx_leads_created_by
  ON public.leads(created_by);

-- calls: dashboard connected-calls query (status + date range, no user filter)
CREATE INDEX IF NOT EXISTS idx_calls_status_called_at
  ON public.calls(status, called_at DESC);
