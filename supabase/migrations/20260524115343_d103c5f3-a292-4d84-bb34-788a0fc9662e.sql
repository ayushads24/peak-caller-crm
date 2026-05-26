create or replace function public.is_team_member_of_leader(_member uuid, _leader uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.teams t on t.id = p.team_id
    where p.id = _member
      and t.leader_id = _leader
  )
$$;

drop policy if exists profiles_select_self_or_admin on public.profiles;

create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin_or_manager(auth.uid())
  or public.is_team_member_of_leader(id, auth.uid())
);