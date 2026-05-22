
This is a large, multi-week feature. I'll break it into phases so you can review and approve each one before I move on. Phase 1 is the foundation; Phases 2–4 layer on automation and team features.

## Phase 1 — Calling Flow Foundation (build first)

**Backend (new tables)**
- `calling_flows` — one row per user per day (name, created_at, user_id, work_date, status: active/completed)
- `calling_flow_items` — leads queued inside a flow (flow_id, lead_id, category, priority, attempts_planned, attempts_done, status: pending/in_progress/done/skipped)
- `breaks` — break tracking (user_id, type: lunch/tea/meeting/other, started_at, ended_at)
- Add `current_lead_id`, `current_call_started_at` to `attendance` for "where am I in the flow" state
- RLS: user sees only their own flows + breaks; admin/manager see all

**UI**
- After punch-in → "Create Today's Calling Flow" modal
  - Add categories: Fresh / Interested in Meeting / Quotation Sent / Follow-up
  - Per category: date range, attempts/day (1–3), priority order (drag handle)
  - "Start flow" builds the queue from leads matching each category's status + date filter
- Active flow screen at `/calling` (the day's queue)
  - Current lead card (big call button, lead info, prev attempts)
  - Attempt counter (1/2/3) + actions: Complete Today Attempt / Mark as Done / Skip Further Attempts
  - Next-lead auto advance
- Post-call action sheet (45 s timer)
  - Status change, add note, create task, schedule meeting, WhatsApp link, "Next" / "+15 s"
- Break controls (start/stop + type) — pauses the flow timer
- Punch-out guard: if pending items > 0 → "Move to tomorrow / Reschedule / Ignore"

## Phase 2 — Team & Bulk (after Phase 1 approved)

- Reassign lead (single + bulk), Assigned By / Assigned To filters on Leads page
- Bulk select on Leads (checkbox column) with bulk Export / Status / Delete / Reassign / Add note
- Permissions UI for who-sees-whose-leads (already enforced in RLS — just expose filters)

## Phase 3 — Smart Automation

- Auto-sequential dialing: hitting "Call" on current lead opens `tel:` then auto-advances on post-call sheet completion
- Scheduled follow-ups: a "Reschedule" creates a task with due time; tasks due today auto-merge into tomorrow's flow
- Real-time presence (who is on a call) via Supabase Realtime

## Phase 4 — Polish

- Calling speed analytics (calls/hr, connect rate, avg post-call time) per user
- Mobile-optimized calling screen
- Sound/desktop notifications

## Technical notes (for me)

- Browser tel: links — true auto-dial isn't possible in browsers without a softphone/Twilio. "Auto-call" = opens dialer + auto-advances UI after the post-call sheet. If you want real progressive dialing, we need Twilio Voice (paid, requires API key).
- WhatsApp = open `https://wa.me/<phone>` in new tab (no API needed). Real WhatsApp Business API is a separate setup.
- 45 s timer runs in client React state; persisted via `calls.duration_seconds` only after the user closes the sheet.

## Open questions before I start Phase 1

1. **Calling categories** — fixed to the 4 you listed (Fresh / Interested in Meeting / Quotation Sent / Follow-up) or should they be admin-configurable?
2. **Real auto-dial** — OK with browser `tel:` + auto-advance for now, and add Twilio later? Or want Twilio integration in Phase 1 (needs a paid Twilio account)?
3. **WhatsApp** — `wa.me` link for now (free, opens app/web), or WhatsApp Business API (paid, requires Meta setup)?
4. **Scope of Phase 1** — should I include the Break system in Phase 1, or push it to Phase 2 to ship faster?

Once you answer those, I'll build Phase 1 end-to-end.
