-- Allow any authenticated user to add a note to any lead.
-- created_by = auth.uid() check stays so you can't impersonate someone else.
DROP POLICY IF EXISTS "notes_insert" ON public.notes;

CREATE POLICY "notes_insert" ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
