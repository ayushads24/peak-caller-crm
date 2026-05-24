DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority public.task_priority NOT NULL DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status ON public.tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);