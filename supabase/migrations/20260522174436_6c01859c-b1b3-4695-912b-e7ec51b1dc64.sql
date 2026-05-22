UPDATE public.leads SET status_id = '1e62aac4-eb1a-434b-9516-943ead424862' WHERE status_id IS NULL;
ALTER TABLE public.leads ALTER COLUMN status_id SET DEFAULT '1e62aac4-eb1a-434b-9516-943ead424862';