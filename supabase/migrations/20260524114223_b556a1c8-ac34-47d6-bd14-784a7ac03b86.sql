
-- Helper: can the actor manage workflow of the target user?
create or replace function public.can_manage_user_workflow(_actor uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    _actor = _target
    or public.is_admin_or_manager(_actor)
    or exists (
      select 1
      from public.profiles p
      join public.teams t on t.id = p.team_id
      where p.id = _target and t.leader_id = _actor
    )
$$;

-- calling_flows policies
drop policy if exists flows_insert on public.calling_flows;
drop policy if exists flows_select on public.calling_flows;
drop policy if exists flows_update on public.calling_flows;
drop policy if exists flows_delete on public.calling_flows;

create policy flows_insert on public.calling_flows
  for insert to authenticated
  with check (public.can_manage_user_workflow(auth.uid(), user_id));

create policy flows_select on public.calling_flows
  for select to authenticated
  using (public.can_manage_user_workflow(auth.uid(), user_id));

create policy flows_update on public.calling_flows
  for update to authenticated
  using (public.can_manage_user_workflow(auth.uid(), user_id));

create policy flows_delete on public.calling_flows
  for delete to authenticated
  using (public.can_manage_user_workflow(auth.uid(), user_id));

-- calling_flow_items policies
drop policy if exists flow_items_insert on public.calling_flow_items;
drop policy if exists flow_items_select on public.calling_flow_items;
drop policy if exists flow_items_update on public.calling_flow_items;
drop policy if exists flow_items_delete on public.calling_flow_items;

create policy flow_items_insert on public.calling_flow_items
  for insert to authenticated
  with check (exists (
    select 1 from public.calling_flows f
    where f.id = calling_flow_items.flow_id
      and public.can_manage_user_workflow(auth.uid(), f.user_id)
  ));

create policy flow_items_select on public.calling_flow_items
  for select to authenticated
  using (exists (
    select 1 from public.calling_flows f
    where f.id = calling_flow_items.flow_id
      and public.can_manage_user_workflow(auth.uid(), f.user_id)
  ));

create policy flow_items_update on public.calling_flow_items
  for update to authenticated
  using (exists (
    select 1 from public.calling_flows f
    where f.id = calling_flow_items.flow_id
      and public.can_manage_user_workflow(auth.uid(), f.user_id)
  ));

create policy flow_items_delete on public.calling_flow_items
  for delete to authenticated
  using (exists (
    select 1 from public.calling_flows f
    where f.id = calling_flow_items.flow_id
      and public.can_manage_user_workflow(auth.uid(), f.user_id)
  ));

-- profiles: allow team leader to view profiles of their team members
drop policy if exists profiles_select_self_or_admin on public.profiles;

create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin_or_manager(auth.uid())
    or exists (
      select 1 from public.teams t
      where t.leader_id = auth.uid() and t.id = public.profiles.team_id
    )
  );
