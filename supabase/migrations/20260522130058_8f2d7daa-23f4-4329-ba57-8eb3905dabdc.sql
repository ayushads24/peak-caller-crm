
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_lead_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_note_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_task_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_meeting_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) TO authenticated;

ALTER FUNCTION public.set_updated_at() SET search_path = public;
