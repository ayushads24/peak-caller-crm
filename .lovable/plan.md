## Goal

Admin / manager ke dashboard se **Punch-in** card hide karna. Callers ko jaise tha waise hi dikhega.

## Change

**File:** `src/routes/_authenticated/dashboard.tsx`

Punch-in `Card` (line 262-283) ko `{!isManager && (...)}` ke andar wrap kar dunga. `isManager` already calculated hai line 24 pe via `isAdminOrManager(roles)`.

Result:
- Admin / manager → Punch-in card nahi dikhega, neeche wala "Calls today" card aur Tasks list upar shift ho jayenge.
- Caller / other roles → pehle jaisa hi (Punch in / Punch out + Create today's flow + Open workflow).

## Scope

- Sirf UI hide. Backend `attendance` table, `punchIn`/`punchOut` functions, realtime subscription — sab waise hi rahega (untouched).
- Koi DB migration nahi.
