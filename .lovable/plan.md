## Changes in `src/components/leads/lead-detail-sheet.tsx`

### 1. WhatsApp button (Call ke right)
- Quick actions grid (line 215-222) ko 3 columns kar denge (Call | WhatsApp | Email).
- WhatsApp button `edit.phone` hone par dikhega.
- Link: `https://wa.me/{phone}` (digits-only, leading `+` strip; agar number 10 digits ka Indian lagta hai aur country code nahi hai to bhi `wa.me` directly accept karta hai — hum sirf non-digits strip karenge).
- Icon: `MessageCircle` from lucide-react (WhatsApp-style chat icon, already in lucide set).
- `target="_blank" rel="noreferrer"`.

### 2. Next button (Name ke right) — lead list me next lead pe jaane ke liye
- `LeadDetailSheet` props me ek optional `onNext?: () => void` add karenge (aur parent jo isko render karta hai usme handler pass karenge taaki current lead ke baad wala lead khul jaaye, list me se).
- `SheetTitle` row me, naam ke baaju me ek chhota "Next →" button add karenge jo `onNext` call karega. Agar `onNext` undefined ya last lead hai to button disabled.
- Parent file (jahan `<LeadDetailSheet>` use hota hai — `src/routes/_authenticated/leads.tsx` ya similar) me:
  - Currently open lead ka index nikalna filtered list me se
  - `onNext` me index+1 wale lead ko `setSelectedLead` karna
  - Last lead pe button disable

### Out of scope
- Koi DB/RLS change nahi.
- WhatsApp template messages, prefilled text — ye baad me add kar sakte hain agar chahiye.

### Clarification (agar zaroori ho)
"Next" se aapka matlab **list me agle lead pe jump** karna hi hai na? Agar kuch aur (jaise "Next status" ya wizard-style next step) chahiye to bata dijiye, warna main yahi implement kar dunga.
