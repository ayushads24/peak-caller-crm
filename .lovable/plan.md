## Diagnosis

Code me sab features add ho chuke hain (verified `src/routes/_authenticated/workflow.tsx` me — `autoMode` state, `Start Workflow` button, `Auto-calling ON` badge, queue highlights, `LeadDetailSheet` — sab present hain). Type-check bhi clean tha.

Aapke screenshot me purana UI hi dikh raha hai jisme sirf `Break` + `+ New workflow` buttons hain. Iska matlab preview stale hai — naya bundle browser tak nahi pohcha.

## Fix

1. **Preview ko hard-refresh karo** (Ctrl/Cmd + Shift + R). 90% chance issue solve ho jayega.
2. Agar phir bhi na dikhe, main dev server restart karunga (build mode me switch karte hi).
3. Refresh ke baad bhi missing ho to mujhe screenshot bhejo — code aur live UI compare karke debug karunga.

Build mode me jaane ke baad main `code--restart_dev_server` chala dunga taaki fresh bundle serve ho.
