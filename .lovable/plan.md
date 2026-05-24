## Workflow page upgrades

Workflow page (`src/routes/_authenticated/workflow.tsx`) par 4 features add karunga. Backend kuch change nahi hoga — pure frontend + reuse of `LeadDetailSheet`.

### 1. Auto-calling Start / Pause / Resume / End

Top right me current buttons ke saath ek primary action button add karunga jo state ke according label change karega:

```text
[ Start Workflow ] → [ Pause Workflow ] / [ Resume Workflow ] → [ End Workflow ]
```

Behavior:
- **Start**: pehli pending lead par `startCall()` trigger (tel: link + post-call sheet).
- Jab user post-call sheet me outcome save kare → existing `advance()` chalega → state auto-mode on hone ki wajah se 1.5s ke baad next lead par phir `startCall()` fire hoga.
- **Pause**: auto-advance band, current screen waisa hi.
- **Resume**: agle lead se phir start.
- **End**: auto-mode off, normal manual workflow.
- Break active ho ya queue khali ho to auto-mode automatically pause/stop.
- Visual indicator (badge): "Auto-calling ON".

Implementation: ek `autoMode` state + `useEffect` jo `current` change hone par + autoMode true hone par next call kick kare. PostCallSheet ke `onComplete` ke baad short delay.

> Note: Browser true "background dialing" allow nahi karta — har call user ke tel: handler se hi jaayegi. Auto-mode ka matlab hai: next lead automatically open + dialer trigger, user ko manually "Call now" nahi dabana padega. Yeh native dialer apps jaisa hi behavior hai jo CRM workflows me standard hai.

### 2. Lead par click → full details drawer

`LeadDetailSheet` (already `src/components/leads/lead-detail-sheet.tsx` me hai, Leads page use karta hai) ko Workflow page me bhi mount karunga.

- Upcoming queue ki har row clickable banegi.
- Current lead card par ek "View full details" button bhi add karunga.
- Click → right-side Sheet open hoga with: name, phone, email, source, status, labels, notes, tasks, activity/timeline, assigned user, sales value (sab kuch jo sheet already dikhata hai).
- Workflow page chalu rahega — drawer overlay me khulega.

Iske liye sheet ko jo statuses/labels/profiles chahiye, woh workflow load me already fetch ho rahe statuses ke saath aur 2 chhoti queries (labels, profiles) add karunga.

### 3 + 4. Queue me color-coded priority highlight

Har upcoming lead ke liye ek "tag" derive karunga:

| Tag | Color | Badge |
|---|---|---|
| New Fresh Lead (last 24h me create) | Orange highlight + pulse dot | `NEW` |
| Task Due (lead par open task whose due_date ≤ today) | Yellow highlight | `Task Due` |
| Follow-up Due (next_followup_at ≤ today, agar column hai; warna activity-based) | Purple highlight | `Follow-up Due` |
| Normal | Default | — |

Implementation:
- Lead load ke saath ek extra fetch: `tasks` table me in lead_ids ke liye `status != 'done' AND due_date <= today` → set of leadIds with task due.
- Fresh check: `leads.created_at >= now() - 24h` (already loaded field).
- Follow-up: agar `leads.next_followup_at` column exist karta hai use karunga, warna sirf Fresh + Task Due dono ship karunga aur user ko bata dunga.
- Queue row UI: left border + soft bg tint + small badge with pulse dot for NEW.
- Real-time: existing `calling_flow_items` subscription + ek new realtime listener on `leads` insert → agar new fresh lead aaye to toast + queue refresh (highlight automatically dikhega).

### Files to touch

- `src/routes/_authenticated/workflow.tsx` — auto-mode state, action button, clickable rows, highlight logic, mount `LeadDetailSheet`, extra fetches (labels, profiles, due tasks), realtime listener for new leads.

No DB migration, no backend change.

### Open question

Follow-up due ke liye `leads` table me dedicated column (`next_followup_at` ya similar) hai ya nahi — agar nahi hai to sirf "Task Due" + "New Fresh" highlight ship karunga, aur baad me follow-up field add kar sakte hain. Confirm karo ya main check karke proceed karu?
