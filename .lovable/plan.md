## Goal

Team Leaders (TL) ko apni team ke members ke liye **workflow create karne** aur unka **workflow history dekhne** ki ability dena. Naya alag tab "Team Workflows" banayenge.

## Scope rule

TL sirf apni team ke members ke saath kaam kar payega — yaani `profiles.team_id` jiska match karta hai us `teams` row se jiska `leader_id = TL.id`. Admin/manager already har user ka access rakhte hain (RLS ke through), unko bhi yeh tab dikhega with full user list.

---

## 1. Database changes (migration)

### a) RLS update — `calling_flows` aur `calling_flow_items`

Abhi sirf flow owner aur admin/manager insert/select/update/delete kar sakte hain. TL ko bhi allow karna hai apni team members ke liye.

Naya helper function:
```sql
create or replace function public.can_manage_user_workflow(_actor uuid, _target uuid)
returns boolean language sql stable security definer set search_path = public as $$
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
```

`calling_flows` policies update:
- `flows_insert`: `WITH CHECK (can_manage_user_workflow(auth.uid(), user_id))`
- `flows_select` / `flows_update` / `flows_delete`: `USING (can_manage_user_workflow(auth.uid(), user_id))`

`calling_flow_items` policies update — same idea, ye `flow_id` ke through join karke check karenge:
- Replace existing policies with `EXISTS (select 1 from calling_flows f where f.id = flow_id AND can_manage_user_workflow(auth.uid(), f.user_id))`

### b) `profiles` RLS

TL ko apni team ke members ke profiles read karna padega (selector aur history list ke liye). Current policy: sirf self + admin/manager. Add:
- `profiles_select_team_leader`: `USING (exists (select 1 from teams t where t.leader_id = auth.uid() and t.id = profiles.team_id))`

---

## 2. New route: `/team-workflows`

**File:** `src/routes/_authenticated/team-workflows.tsx`

Access guard: route ke andar check — agar user `team_leader`, `manager`, ya `admin` nahi hai to "Access denied" dikhao.

### Layout

```text
┌─────────────────────────────────────────────────────────┐
│ Team Workflows                                          │
│ ───────────────────────────────────────────────────────│
│ Member: [ Select team member ▼ ]   [+ Create workflow] │
│                                                         │
│ Selected: Vinay Kumar (Caller)                          │
│ Today's flow: 12 done / 24 total · 8 pending           │
│                                                         │
│ ── History ──────────────────────────────────────────  │
│ ┌──────────────────────────────────────────────────┐   │
│ │ 24 May 2026 · Workflow — May 24      [completed] │   │
│ │ 30 leads · 22 done · 5 skipped · 3 pending       │   │
│ └──────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────┐   │
│ │ 23 May 2026 · ...                                │   │
│ └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Member selector
- Fetch eligible members:
  - Admin/manager → sab `profiles where is_active = true`
  - Team leader → sirf members jinka `team_id` un teams mein hai jahan `leader_id = current user`
- Default selection: first member in list.

### Create workflow button
- Existing `CreateFlowModal` ko extend karenge to accept optional `targetUserId` prop (default: current user).
- Insert mein `user_id: targetUserId ?? user.id` use karega.
- Modal title bhi update: "Create Workflow for **{member name}**".
- "Replace existing flow for today" logic same rahega but scoped to `targetUserId`.

### History list
- Query: `calling_flows.select("id, work_date, status, name, created_at").eq("user_id", selectedMemberId).order("work_date", { ascending: false }).limit(60)`
- Har row ke saath summary: aggregate from `calling_flow_items` (count by status). Single query with grouped fetch ya per-row pe count head select (60 max, fine).

### History drill-down
- Card pe click → drawer (Sheet) khulta hai jisme:
  - Flow ka name, work_date, overall stats
  - Items list grouped by category: Fresh / Interested / Quotation / Follow-up
  - Har item: lead name (from join), attempts done/planned, status badge (pending/done/skipped/rescheduled), completed_at
  - Lead name pe click → existing `LeadDetailSheet` (read-only view)

---

## 3. Sidebar nav

`src/routes/_authenticated.tsx` (ya jahan sidebar render hota hai) mein naya link add karenge — sirf TL/manager/admin ke liye visible (`isAdminOrManager(roles) || roles.includes("team_leader")`).

Label: **"Team Workflows"** · icon: `Users` ya `ListChecks`.

---

## 4. Files touched

**New:**
- `src/routes/_authenticated/team-workflows.tsx`
- Migration file with RLS + helper function

**Edited:**
- `src/components/workflow/create-flow-modal.tsx` — accept optional `targetUserId` + member name for title
- `src/routes/_authenticated.tsx` (sidebar) — add conditional nav link

**Untouched:**
- `src/routes/_authenticated/workflow.tsx` (caller's own workflow page — same behavior)
- `calling_flow_items` schema, `leads`, etc.

---

## Out of scope

- Notifications to the member when TL creates a flow for them (can add later).
- Editing already-created flow items from this page (drill-down is read-only for v1).
- Bulk create across multiple members in one click.
