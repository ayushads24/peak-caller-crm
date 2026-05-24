
-- 1. Explicit restrictive INSERT policy on user_roles to prevent self-escalation
DROP POLICY IF EXISTS user_roles_block_self_insert ON public.user_roles;
CREATE POLICY user_roles_block_self_insert
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Restrict profile sensitive columns
-- Replace permissive select with own/admin policy + safe view for cross-user lookup
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;

CREATE POLICY profiles_select_self_or_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_admin_or_manager(auth.uid())
);

-- Safe directory view exposing only non-sensitive columns to all authenticated users
CREATE OR REPLACE VIEW public.profiles_directory
WITH (security_invoker = true) AS
SELECT id, full_name, avatar_url, designation, team_id, is_active
FROM public.profiles;

GRANT SELECT ON public.profiles_directory TO authenticated;

-- Allow authenticated users to read the directory view rows
CREATE POLICY profiles_directory_select
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Wait: the above re-opens the table. Drop it.
DROP POLICY profiles_directory_select ON public.profiles;
