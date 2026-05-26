# Lead Distribution Management Module

CRM mein ek naya **Lead Distribution** system add karenge jisme admin/team leader new leads ko callers ke beech multiple strategies se distribute kar sake, full tracking ke saath.

## 1. Database Changes

### Naya table: `distribution_rules`
Har team leader / admin apni rules save kar sake.
- `name` (text)
- `team_id` (uuid, nullable — null = global)
- `method` (enum: `round_robin`, `manual`, `percentage`, `priority`, `source`, `availability`)
- `is_active` (boolean)
- `config` (jsonb) — method-specific settings:
  - percentage: `{ "user_id": 40, "user_id": 30, ... }`
  - priority: `{ "high": ["user_id"], "normal": [...], "hot": [...] }`
  - source: `{ "Instagram": ["user_id"], "Website": [...] }`
  - round_robin: `{ "members": ["user_id", ...], "last_assigned_index": 0 }`
- `created_by`, `created_at`, `updated_at`

### Naya table: `lead_assignment_history`
Har reassignment ka full audit trail.
- `lead_id`, `from_user_id` (nullable for first assign), `to_user_id`
- `assigned_by` (uuid — kisne kiya), `method` (enum: same as above + `system`)
- `reason` (text, nullable), `created_at`

### `leads` table additions
- `priority` (enum: `low`, `normal`, `high`, `hot`) — default `normal`
- `assigned_at` (timestamptz) — current owner since when

### Trigger
- `leads` table par AFTER UPDATE OF assigned_to → automatically `lead_assignment_history` row insert kare.

### Existing `attendance` / `breaks` use karenge
Availability detect karne ke liye — punched-in + no active break = available.

## 2. Server Functions (createServerFn)

`src/lib/lead-distribution.functions.ts`:
- `getDistributionRules` — team leader/admin ki rules list
- `saveDistributionRule` — create/update rule
- `deleteDistributionRule`
- `distributeLeads({ leadIds, ruleId })` — selected method apply karke leads assign kare
- `bulkReassign({ leadIds, toUserId, reason })` — manual transfer
- `bulkSplitEqual({ leadIds, userIds })` — equal split
- `bulkSplitPercentage({ leadIds, distribution })` — percentage split
- `getDistributionDashboard({ teamId, date })` — counters
- `getLeadAssignmentHistory({ leadId })`

Saare functions `requireSupabaseAuth` middleware ke saath, RLS enforce karega.

## 3. Naye Pages / Routes

### `/lead-distribution` (Team Leader + Admin)
Tabs:
- **Dashboard** — counters cards (Unassigned, Auto-assigned today, Manual-assigned today, Pending, Caller-wise list, Source-wise list)
- **Rules** — distribution rules ka CRUD (method select karo, config form dynamic by method)
- **Bulk Assign** — leads table with multi-select + actions dropdown (Transfer to / Split equally / Split by % / Change priority)
- **History** — lead assignment history ka filterable log

### `/leads/$id` page mein new section
"Assignment History" timeline — kisne kab kisko assign kiya.

## 4. Distribution Logic (server-side)

Har method ka pure function:
- **Round Robin**: rule config se members + last_index lekar cycle kare, config update kare
- **Manual**: simple bulk update
- **Percentage**: total count × % = count per user, deterministic order
- **Priority**: lead priority dekh ke matching user pool se round-robin
- **Source**: `lead_source` field match karke pool se round-robin
- **Availability**: query active `attendance` (punched in, no open break) → un members mein round-robin

## 5. UI Components

- `DistributionRuleForm` — method-aware (dynamic config UI)
- `BulkAssignDialog` — leads selection + method picker
- `DistributionDashboardCards` — counters
- `AssignmentHistoryTimeline` — lead detail page mein
- `LeadPrioritySelector` — chip-style picker (low/normal/high/hot)

Sidebar mein "Lead Distribution" entry (permission key: `leads.distribute`).

## 6. Permissions

Naya permission key: `leads.distribute` — admin, manager, team_leader roles ko default mein assign karenge `role_permissions` mein.

## 7. Technical Notes

- Saare bulk operations ek hi transaction-style serverFn call mein (loop with single supabase client) — failures par partial success report.
- Distribution dashboard realtime: `leads` table par supabase channel subscribe karke counters refresh.
- History trigger SECURITY DEFINER hoga taaki RLS na tode.
- `auth.uid()` se `assigned_by` history mein capture hoga.

## Out of Scope (abhi nahi)
- Auto-distribution on lead import (manual trigger se chalega, future mein webhook/trigger add kar sakte hain)
- SLA-based escalation
- Lead recycling (stale leads auto-return)

Bata do agar koi point change/add karna ho — phir build mode mein implement karta hoon.