# Peak Caller CRM — Project Context

## Project Overview
A tele-calling CRM for managing leads, callers, and sales workflows. Built on Lovable, now self-hosted on own Supabase.

**Production URL:** https://tele-calling-crm-6z4f.vercel.app
**Supabase Project:** ymhctomdekmlrdqhcwsw (https://ymhctomdekmlrdqhcwsw.supabase.co)

---

## Tech Stack
- **Frontend:** React 19 + TanStack Router + TanStack Start (Vite 7)
- **Backend/DB:** Supabase (PostgreSQL + RLS + Realtime)
- **Styling:** Tailwind CSS + shadcn/ui (Radix UI components)
- **Charts:** Recharts
- **Date:** date-fns
- **Deployment:** Vercel (CLI deploy, `npx vercel --prod --yes`)
- **Auth:** Supabase Auth (magic link / OTP)

---

## Environment Variables (local `.env`)
```
VITE_SUPABASE_URL=https://ymhctomdekmlrdqhcwsw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_5ANhoeZxcwKNo5lnxDj6Kg_0ObSkYRH
SUPABASE_URL=https://ymhctomdekmlrdqhcwsw.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_5ANhoeZxcwKNo5lnxDj6Kg_0ObSkYRH
SUPABASE_SERVICE_ROLE_KEY=eyJ...ypw4aOIMyU4bw_c3ZNdMFIsJPgQJRvx6T0NMhlLO8Vg
```
Supabase anon key: `eyJhbGci...._Kmi-NjoPHBTgmgtJVAcI0H7S5HrHKAc1hRGkSCQTCE`
Supabase PAT (for Management API): `sbp_cb4d28ab5d6915bd8a51de82a4a17218ee346193`

---

## Key Files
| File | Purpose |
|------|---------|
| `src/routes/_authenticated/leads.tsx` | Main leads list page — CRUD, filters, pagination |
| `src/components/leads/lead-detail-sheet.tsx` | Lead detail side sheet — edit, notes, tasks, activities |
| `src/integrations/supabase/client.ts` | Supabase client (uses publishable key) |
| `src/hooks/use-auth.ts` | Auth hook — exposes `user`, `roles`, `permissions` |
| `src/hooks/use-app-settings.ts` | App settings (DoubleTick URL, etc.) |
| `supabase/migrations/` | All DB migrations in order |

---

## Database — Key Tables
- `leads` — main leads table (id, client_name, email, phone, sales_value, lead_source, status_id, assigned_to, created_by, doubletick_contact_id, priority, created_at)
- `statuses` — lead statuses with color
- `labels` — tags for leads
- `profiles` — user profiles
- `user_roles` — maps user_id → role (`admin`, `team_leader`, `project_manager`, `caller`)
- `permissions` + `role_permissions` — permission keys per role
- `notes`, `tasks`, `activities`, `meetings` — lead-related data (all FK → leads ON DELETE CASCADE)
- `calls` — call logs (no FK to leads, just lead_id column)
- `teams` — team structure
- `attendance` — punch in/out

---

## Roles & Permissions
| Role | Can Delete Leads | Notes |
|------|-----------------|-------|
| `admin` | Yes (any) | Full access |
| `team_leader` | Yes (any) | After fix in migration 20260527 |
| `project_manager` | No | Can only delete own created leads (RLS) |
| `caller` | No | Same as above |

**Important:** There is NO `manager` role in the system. The `is_admin_or_manager()` DB function was fixed to include `team_leader`.

---

## RLS Notes
- `leads_delete` policy: `is_admin_or_manager(auth.uid()) OR created_by = auth.uid()`
- `is_admin_or_manager()` checks: `admin`, `manager`, `team_leader`
- Delete button in UI only shown to users with `leads.delete` permission or `admin` role
- Delete functions use `.select('id')` after delete to detect 0-row deletes

---

## How to Run Locally
```bash
npm install
npm run dev
```
App runs at http://localhost:3000

---

## How to Deploy
```bash
npm run build
npx vercel --prod --yes
```

---

## How to Apply DB Migrations
```js
// Uses Supabase Management API
fetch(`https://api.supabase.com/v1/projects/ymhctomdekmlrdqhcwsw/database/query`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer sbp_cb4d28ab5d6915bd8a51de82a4a17218ee346193`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '<SQL HERE>' })
})
```

---

## Integrations
- **DoubleTick** — WhatsApp messaging. URL template stored in `app_settings` table. Lead has `doubletick_contact_id`.
- **Supabase Realtime** — leads list auto-refreshes on DB changes

---

## User Accounts (Production)
| Email | Role |
|-------|------|
| ayushads24@gmail.com | admin |
| sayush820@gmail.com | team_leader |
| vinaysainishamli@gamil.com | project_manager |
| shimanshu1050@gmail.com | caller |
| ksaini7537@gmail.com | caller |
| parasmittal938@gmail.com | project_manager |

---

## Recent Work Done
1. **Lead Created On field** — Added in Contact section of lead detail sheet (`dd MMM yyyy` format)
2. **Delete fix** — Fixed permission checks, hide button for non-admins, proper error on RLS block
3. **Supabase migration** — Fixed `is_admin_or_manager()` to include `team_leader`

---

## Working Style Preferences
- **Sab kuch khud kar** — user ko koi command run karne ko mat bol, khud kar
- **Hindi/English mixed** — user Hinglish mein bolta hai, that's fine
- **Fast** — jyada time mat laga, seedha fix kar aur deploy kar
- **No unnecessary files** — test files etc. clean up karte reh (`test-delete.mjs`, `.env.production` cleanup baaki hai)
