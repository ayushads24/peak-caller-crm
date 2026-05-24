## Header fixes

Do baat thik karni hain header mein:

### 1. Save button hamesha faded dikh raha
Abhi Save tab tak disabled rehta hai jab tak koi field change na ho (dirty tracking). Isliye open karte hi purple/faded dikhta hai aur user ko lagta hai "kuch toot gaya".

**Fix:** Dirty tracking hata do. Save button hamesha clickable rahe (jaise pehle tha). Sirf `saving` state ke time disable ho aur "Saving…" dikhe.

### 2. Next button gayab lag raha
Abhi sirf `<` aur `>` icon-only buttons hain top-right corner mein. User ko samajh nahi aaya ki yeh Next/Prev hain.

**Fix:** Icon-only ki jagah text wapas lao:
- `[< Prev]` aur `[Next >]` — dono labelled buttons, side-by-side, top-right.
- Disabled state thik se dikhe (Prev abhi hamesha disabled hai kyunki parent se prop nahi aata — usko bhi badle taaki actually kaam kare, ya phir Prev ko hide kar do agar wire nahi karna).

### Scope
- File: `src/components/leads/lead-detail-sheet.tsx` (header section only)
- Parent route (`workflow.tsx` / `leads.tsx`) mein optional `onPrev` wire karna — agar haan to confirm karo, warna sirf Next dikhayenge.

### Question
Prev button bhi chahiye ya sirf Next? (Pehle sirf Next tha.)