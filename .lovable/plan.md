## Lead Detail Redesign — Split-screen, User-friendly

**Goal:** Naya user jab lead kholega to ek hi screen mein sab dikhe — contact actions top par, edit form left, notes/tasks/activity right. Scroll kam, clicks kam, focus zyada.

**Style locked:** Cloud White palette (#fafbfc bg, #3b82f6 primary), Space Grotesk + DM Sans, split-screen layout.

---

### Layout (desktop ≥ lg)

```
┌──────────────────────────────────────────────────────────────┐
│ STICKY HEADER                                                │
│  Avatar  Ankita  [Fresh]  ·  Created 2d ago    [Prev] [Next] │
│  📞 Call    💬 WhatsApp    ✉ Email    ⋯ More    [Save] [🗑]  │
├───────────────────────────────┬──────────────────────────────┤
│ LEFT (form, scrollable)       │ RIGHT (activity, scrollable) │
│                               │                              │
│  ▸ Contact                    │  Tabs: Notes | Tasks | Log   │
│    Name / Email / Phone       │  ─────────────────────────   │
│                               │  [Add a note…........] [+]   │
│  ▸ Deal                       │                              │
│    Value / Source             │  • Note card                 │
│                               │  • Note card                 │
│  ▸ Pipeline                   │                              │
│    Status / Assigned / Labels │                              │
└───────────────────────────────┴──────────────────────────────┘
```

On mobile/tablet (<lg): right column collapses below left, tabs become full-width. Sheet width grows from `sm:max-w-xl` → `lg:max-w-5xl`.

---

### Key UX improvements

1. **Sticky top bar** — name, status, Save, Delete, Prev/Next, and quick actions (Call / WhatsApp / Email) always visible while scrolling. No more hunting for Save at the bottom.
2. **Quick actions promoted** — Call, WhatsApp, Email become icon+label chips in the header row (3 equal pills with brand-tinted icons: phone=green, whatsapp=emerald, mail=blue). Disabled state when value missing.
3. **Grouped form sections** with subtle section headers (Contact / Deal / Pipeline) instead of one long flat list — easier scanning.
4. **Avatar + meta line** — circular initial avatar (color derived from name), "Created X ago · Owner: Himanshu" subtitle for context at a glance.
5. **Right-side activity rail** — Notes/Tasks/Activity tabs live in their own column so user can edit + read history simultaneously. Empty states get friendly illustrations/copy.
6. **Prev / Next pair** — both arrows in header (currently only Next), keyboard `←` / `→` shortcuts.
7. **Save button** — primary in header (sticky) AND a secondary inline one after the form. Shows "Saving…" state + disabled when nothing changed (dirty tracking).
8. **Cleaner inputs** — DM Sans 14px, 10px radius, subtle border `#e8ecf1`, focus ring `#3b82f6`. Labels in uppercase 11px Space Grotesk tracking-wide.
9. **Status pill** in header uses status color as soft tint (bg = color/10%, text = color) instead of solid — easier on the eyes.
10. **Delete** moves into a `⋯ More` menu to prevent accidental clicks; confirmation dialog instead of native confirm.

---

### Technical notes

**File to edit:** `src/components/leads/lead-detail-sheet.tsx` (single file, presentation only — no DB / API / business logic changes).

- Widen sheet: `w-full lg:max-w-5xl`.
- Restructure JSX into `<header sticky>` + `<div grid lg:grid-cols-[1fr_380px]>`.
- Extract small helpers in-file: `SectionHeader`, `QuickActionPill`, `Avatar` (initials + hashed bg color).
- Add `useState` for `dirty` tracking (compare `edit` vs `lead`); use it to enable/disable Save.
- Add keyboard listener for `←` / `→` → `onPrev` / `onNext` (Prev prop optional — wire later if needed; for now just Next works, Prev disabled).
- Use existing semantic tokens (`bg-background`, `border-border`, `text-muted-foreground`). Add new tokens to `src/styles.css` only if needed for WhatsApp green / soft status tints.
- Keep all existing handlers (`save`, `addNote`, `addTask`, `addLabel`, etc.) untouched.
- Tabs content (Notes/Tasks/Activity) stays the same internally, just moves to right column.

**Out of scope:** `onPrev` wiring in parent route, keyboard help overlay, bulk actions, schema changes.

Approve and I'll implement.