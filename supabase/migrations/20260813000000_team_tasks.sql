-- Team Tasks: standalone assignable tasks (lead optional)
CREATE TABLE IF NOT EXISTS team_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  lead_id     UUID        REFERENCES leads(id) ON DELETE SET NULL,
  created_by  UUID        NOT NULL,
  assigned_to UUID        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','submitted','done')),
  priority    TEXT        NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high')),
  due_date    TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Comments thread (back-and-forth)
CREATE TABLE IF NOT EXISTS team_task_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES team_tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users see only their own tasks (created or assigned)
ALTER TABLE team_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_tasks_rls" ON team_tasks FOR ALL USING (
  auth.uid() = created_by OR auth.uid() = assigned_to
);

ALTER TABLE team_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_task_comments_rls" ON team_task_comments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM team_tasks t
    WHERE t.id = task_id
      AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
  )
);

-- Full replica identity for realtime DELETE payloads
ALTER TABLE team_tasks         REPLICA IDENTITY FULL;
ALTER TABLE team_task_comments REPLICA IDENTITY FULL;

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE team_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE team_task_comments;

-- Indexes
CREATE INDEX IF NOT EXISTS team_tasks_assigned_to_idx  ON team_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS team_tasks_created_by_idx   ON team_tasks(created_by);
CREATE INDEX IF NOT EXISTS team_tasks_status_idx       ON team_tasks(status);
CREATE INDEX IF NOT EXISTS team_task_comments_task_idx ON team_task_comments(task_id);
