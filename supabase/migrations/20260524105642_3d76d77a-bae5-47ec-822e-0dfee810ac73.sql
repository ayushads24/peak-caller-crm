
DROP VIEW IF EXISTS public.profiles_directory;
CREATE VIEW public.profiles_directory
WITH (security_invoker = true) AS
SELECT id, full_name, email, avatar_url, designation, team_id, is_active
FROM public.profiles;

GRANT SELECT ON public.profiles_directory TO authenticated;
