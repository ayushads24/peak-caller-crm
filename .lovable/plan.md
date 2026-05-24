## Goal

Make the "Create Today's Workflow" modal fully dynamic: each row picks a status from the `statuses` table, you can add as many rows as you want with a **+** button, and you can reorder them (including newly added rows) using the existing up/down arrows.

## Today

The modal currently shows 4 fixed rows (Fresh Leads, Quotation Sent, Interested in Meeting, Follow-up Calls). The status each row targets is hardcoded by name in `DEFAULTS` inside `src/components/workflow/create-flow-modal.tsx`. You can toggle/reorder them but you can't add new ones or change what status they point to.

## Changes

**`src/components/workflow/create-flow-modal.tsx`**

1. **Load statuses on open.** Fetch all rows from the `statuses` table (excluding `is_sales`/`is_lost` terminal ones) and keep them in state for the dropdowns.
2. **Status picker on each row.** Replace the static label with a Select dropdown listing every status from the database (plus a special "Any open status — Follow-up" option for the non-status follow-up bucket). Changing it updates that row's target status and the row's display label.
3. **"+ Add status row" button** at the bottom of the list. Clicking it appends a new row pre-selected to the first unused status, with sensible defaults (date range = last 7 days, attempts = 2, enabled = true).
4. **Remove row button** (small × on each row) so you can drop rows you added.
5. **Reorder works for all rows.** The existing up/down arrows already operate on the list — newly added rows participate automatically, so a row added at the bottom can be moved to the top to become Priority 1.
6. **Submit logic unchanged in shape** — still builds the queue in the displayed order, dedupes leads across rows, writes `calling_flows` + `calling_flow_items`. Each row's `category` is stored as before (`fresh` / `interested_meeting` / `quotation_sent` / `followup`) — derived from the chosen status so the existing badge colors on the workflow page keep working. Unknown statuses fall back to a generic `followup` category tag.

## Out of scope

- No database changes. Statuses are already managed elsewhere (Settings → Statuses) — this just consumes them.
- No change to how the workflow queue is consumed on the workflow page.
