-- 1) Restrict full-row profile reads to self + admin/manager only.
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

-- 2) Make profiles_directory bypass RLS so team leaders / peers can still
--    look up safe directory fields (no phone / last_login_at exposed).
ALTER VIEW public.profiles_directory SET (security_invoker = false);
GRANT SELECT ON public.profiles_directory TO authenticated;

-- 3) Explicit admin-only UPDATE / DELETE on activities audit log.
CREATE POLICY activities_admin_update
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY activities_admin_delete
  ON public.activities
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
