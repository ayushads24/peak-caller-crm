
-- 1. Tighten labels INSERT (was WITH CHECK true)
DROP POLICY IF EXISTS labels_auth_insert ON public.labels;
CREATE POLICY labels_auth_insert ON public.labels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_manager(auth.uid())
    OR public.has_role(auth.uid(), 'team_leader'::public.app_role)
  );

-- 2. Tighten lead_assignment_history SELECT to admin/manager + lead creator + team leader of assignee
DROP POLICY IF EXISTS lah_select ON public.lead_assignment_history;
CREATE POLICY lah_select ON public.lead_assignment_history
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_assignment_history.lead_id
        AND (l.created_by = auth.uid() OR l.assigned_to = auth.uid())
    )
    OR (to_user_id IS NOT NULL AND public.is_team_member_of_leader(to_user_id, auth.uid()))
    OR (from_user_id IS NOT NULL AND public.is_team_member_of_leader(from_user_id, auth.uid()))
  );

-- 3. Revoke EXECUTE from anon/PUBLIC on SECURITY DEFINER helper functions (keep authenticated for RLS).
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- Trigger functions don't need to be callable by clients at all — revoke from authenticated too.
REVOKE EXECUTE ON FUNCTION
  public.log_task_activity(),
  public.log_meeting_activity(),
  public.log_lead_activity(),
  public.log_call_activity(),
  public.log_note_activity(),
  public.log_lead_assignment(),
  public.handle_new_user(),
  public.set_updated_at()
FROM PUBLIC, anon, authenticated;
