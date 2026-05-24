## Goal

Har row me "Attempts/day" ke left side me ek **Total Leads** count dikhana — jo us row ke selected status + From/To date range ke matching leads ka live count ho.

## Change

**`src/components/workflow/create-flow-modal.tsx`**

1. Date grid ko `grid-cols-3` se `grid-cols-4` kar do. Pehla naya cell: **Total Leads** (read-only, badge-style number).
2. Har row ka count debounced query se aaye:
   - `supabase.from("leads").select("id", { count: "exact", head: true })`
   - `.gte("created_at", from)` + `.lte("created_at", toEndOfDay)`
   - Agar `statusId !== FOLLOWUP_KEY` → `.eq("status_id", statusId)`
   - Followup row ke liye terminal status IDs `.not("status_id", "in", terminalIds)` ya null ko allow karne ke liye client-side filter (count head endpoint pe complex; safer: alag fetch with `select("status_id")` aur client filter — but only when followup).
3. State: `counts: Record<rowId, number | "loading">`. Effect runs whenever `cats`, `statuses` change — debounces 300ms per row by keying on `statusId|fromDate|toDate`.
4. Loading state me chhota spinner / `—` dikhao.
5. Followup count: query me terminal exclude karne ke liye pehle terminal IDs nikalo (already fetched on submit; ab `useEffect` me bhi load karna padega ya `statuses` ke saath terminal bhi laao). Simplest: open modal me ek extra fetch `statuses.select("id, is_sales, is_lost")` aur `terminalIds` state me rakho.

## Out of scope

- No DB changes.
- Reorder/add/remove logic same.
