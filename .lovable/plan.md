## Problem

Jab team leader (ya admin) kisi member ke liye workflow create karta hain, member ko `/workflow` page pe kuch nahi dikhta. Root cause 3 hai:

### 1. Modal target user ke leads nahi pick karta
`src/components/workflow/create-flow-modal.tsx` mein `start()` aur live count queries `leads` table se filter karte hain sirf `status_id` + date range pe — `assigned_to` filter nahi hota.

Result:
- Team leader (Ayush) — RLS sirf uske apne leads dikhata hai (assigned_to=him OR created_by=him). Ayush ke paas koi lead nahi → 0 items insert hote hain → member ko khali workflow milta hai.
- Admin — sab leads dikhte hain, isliye items insert ho jaate hain, **par** woh leads member ko assigned nahi hain. Member ka RLS unhe block karta hai → `/workflow` page pe lead names blank / queue empty.

### 2. RLS team leaders ko team-member leads dekhne nahi deta
Modal mein live "Total leads" count aur server-side se assignment-filter dono ke liye team leader ko apne team-members ke leads access chahiye. Abhi `leads_select` policy mein bas `is_admin_or_manager OR assigned_to=auth.uid() OR created_by=auth.uid()` hain — team leader ke liye koi clause nahi.

### 3. Stale flow items
Pichla flow `06a21794` mein 26 items hain par unke `lead_id` ab leads table mein nahi hain (leads delete/replace ho gaye). FK CASCADE nahi tha. UI bhi `(deleted lead)` placeholder dikha deta hain par queue tut jaati hain.

---

## Fix plan

### A. Migration: leads RLS + items FK cleanup

```sql
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

-- 2) calling_flow_items.lead_id pe FK + cascade delete
ALTER TABLE public.calling_flow_items
  ADD CONSTRAINT calling_flow_items_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- 3) Cleanup existing orphans
DELETE FROM public.calling_flow_items
WHERE lead_id NOT IN (SELECT id FROM public.leads);
```

### B. `create-flow-modal.tsx` — target user ke leads filter

`CategoryConfig` queries (live count + final insert) dono jagah jab `targetUserId` set ho to filter add karein:

```ts
let q = supabase.from("leads").select(...)
  .gte("created_at", ...)
  .lte("created_at", ...);
if (targetUserId) q = q.eq("assigned_to", targetUserId);
if (c.statusId !== FOLLOWUP_KEY) q = q.eq("status_id", c.statusId);
```

Aur jab `targetUserId` na ho (admin/manager apne liye banata hain), tab current behaviour rahega (no assigned_to filter).

### C. UX polish
- Modal subtitle mein clarify: jab `targetUserId` set hain to "Showing leads assigned to {targetUserName}".
- Agar koi row ka count 0 hain to "Start workflow" disable na ho lekin warning toast: "Some categories have no leads."

---

## Scope (files)

- New migration file under `supabase/migrations/`
- `src/components/workflow/create-flow-modal.tsx` — query filters + subtitle text
- No changes to `/workflow` member page or `/team-workflows` leader page

## Out of scope

- Cron / auto-assign — sirf manual create flow fix kar rahe hain.
- Workflow stats backfill — purane flows ke deleted items cleanup ke baad numbers automatically sahi ho jayenge.

## Questions

1. Team leader ko team members ke leads sirf **workflow create karne ke liye** dikhne chahiye, ya leads page pe bhi? (Migration ka SELECT policy global hain — agar leads page pe bhi chahiye to perfect, varna server function route lena padega.)
