-- 1) Team leaders apne team members ke leads dekh saken
CREATE POLICY "leads_select_team_leader"
  ON public.leads FOR SELECT TO authenticated
  USING (
    assigned_to IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.teams t ON t.id = p.team_id
      WHERE p.id = leads.assigned_to
        AND t.leader_id = auth.uid()
    )
  );

-- 2) Cleanup orphan items first (FK add ke pehle zaroori)
DELETE FROM public.calling_flow_items
WHERE lead_id NOT IN (SELECT id FROM public.leads);

-- 3) FK + cascade
ALTER TABLE public.calling_flow_items
  ADD CONSTRAINT calling_flow_items_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;