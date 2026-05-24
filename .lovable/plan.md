## Goal
"Team Workflows" sidebar option sirf **Admin** aur **Team Leader** ko dikhe — Manager ko nahi.

## Current behavior
`src/routes/_authenticated.tsx` line 43:
```ts
const canManageTeamFlows = isAdminOrManager(roles) || roles.includes("team_leader");
```
Iska matlab admin + manager + team_leader teeno ko dikh raha hai.

## Change
Sirf sidebar visibility tighten karni hai:
```ts
const canManageTeamFlows = roles.includes("admin") || roles.includes("team_leader");
```

## Out of scope
- Route page (`/team-workflows.tsx`) ki internal access logic — RLS already TL/admin/manager allow karta hai via `can_manage_user_workflow`. Agar Manager URL directly type kare to abhi access milega. Aap bole "sirf sidebar option", to DB/RLS untouched.
- Agar Manager ko bhi pura block karna ho (route guard + RLS), bata dijiye — separate change karenge.

## Files
- `src/routes/_authenticated.tsx` — ek line update.