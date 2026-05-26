DO $$
DECLARE fresh_id uuid;
BEGIN
  SELECT id INTO fresh_id FROM public.statuses WHERE name = 'Fresh';
  IF fresh_id IS NOT NULL THEN
    UPDATE public.leads SET status_id = fresh_id WHERE status_id IS NULL;
    EXECUTE format('ALTER TABLE public.leads ALTER COLUMN status_id SET DEFAULT %L::uuid', fresh_id);
  END IF;
END $$;