ALTER TABLE public.calling_flows ADD COLUMN name TEXT;
UPDATE public.calling_flows SET name = 'Workflow' WHERE name IS NULL;