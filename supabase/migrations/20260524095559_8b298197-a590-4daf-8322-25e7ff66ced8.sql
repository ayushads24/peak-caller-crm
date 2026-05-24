ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_imported_at ON public.leads (imported_at DESC);