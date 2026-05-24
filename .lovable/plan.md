## Root cause

Aapke latest import me Excel/CSV ka `Created On` value format ye tha:

```text
15/05/2026 23:55:06
15/05/2026 22:48:47
...
```

Current importer `dd/MM/yyyy HH:mm:ss` format support nahi कर रहा, इसलिए `Created On parse नहीं हुआ` errors log हुए. Jab date parse fail hoti hai, database default `now()` use kar leta hai, isliye leads 24 May/today me show ho रही hain.

## Fix plan

1. **Date parser fix**
   - Import parser me `dd/MM/yyyy HH:mm:ss`, `d/M/yyyy HH:mm:ss`, `dd-MM-yyyy HH:mm:ss`, `d-M-yyyy HH:mm:ss` add karunga.
   - 2-digit year + seconds aur AM/PM + seconds formats bhi add karunga.

2. **Mandatory historical date validation**
   - Agar `Created On` column mapped hai aur kisi row me date parse nahi hoti, us row ko import nahi hone dunga.
   - Ab wrong fallback se today date par lead save nahi hogi.
   - Preview/import log me clear error dikhega ki kaunsi row/date parse नहीं हुई.

3. **Existing wrong import handling**
   - Jo leads already today date ke saath import ho chuki hain, unka `created_at` automatically recover nahi ho sakta unless original file se match karke update kiya jaye.
   - Main UI/logic fix karunga so next import correct ho.
   - Aap chahein to same 15 May CSV dobara upload karke wrong imported duplicates ko replace/update karne ka option next step me add kar sakte hain.

## Expected result

Future Excel/CSV import me `Created On = 15/05/2026 23:55:06` wali lead CRM me 15 May ke `created_at` ke saath save hogi, aur Created On filter/dashboard/report me 15 May par hi show hogi—not today.