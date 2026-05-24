## मसला

DB check से confirm है — अभी तक import हुई सारी leads का `created_at` = आज की date (`2026-05-24 09:45:25.928869+00`, सब rows बिल्कुल same timestamp तक). मतलब Excel की "Created On" date actually database में जा ही नहीं रही, इसलिए filter में 15 तारीख चुनने पर कुछ नहीं आता।

Leads page पर "Date" filter already `created_at` पर ही filter करता है (leads.tsx line 156-157), तो असली bug import side पर है।

## Root cause (2 चीज़ें)

1. **Date parsing fail** — `parseFlexibleDate` सिर्फ इन formats को handle करता है: `dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy-MM-dd`, और कुछ HH:mm variants। अगर Excel में "15 May 2026", "15-May-2026 10:30 AM", "15/05/26" (2-digit year) जैसा कुछ है तो parse fail → `null` → `created_at` payload में नहीं जाता → DB default `now()` लग जाता है।
2. **User को पता ही नहीं चलता** — अभी silently fail होता है, कोई "Created On parse नहीं हुआ" warning नहीं।

## Plan

### 1. Import: Created-On को pakka persist करना (`src/routes/_authenticated/import.tsx`)

- `parseFlexibleDate` में और formats add करना:
  - `dd MMM yyyy`, `d MMM yyyy`, `dd-MMM-yyyy`, `dd MMM yyyy HH:mm`, `dd MMM yyyy h:mm a`
  - `dd/MM/yy`, `d/M/yy` (2-digit year)
  - `dd/MM/yyyy h:mm a` (12-hour AM/PM)
  - `MMM d, yyyy` और `MMMM d, yyyy`
- अगर user ने Created On column map किया है but parse fail हुआ → row को `errors[]` में push: `"Row N: Created On parse नहीं हुआ: <value>"` — तो import history में दिखे।
- Preview table में "Created Date" column के नीचे already parsed value दिखती है — अगर null है तो red text में original string + "⚠ unparsed" badge दिखाना ताकि import से पहले user देख ले।

### 2. Leads page Date filter में "Specific day" option (`src/components/leads/leads-filter-bar.tsx`)

अभी filter में presets (Today, Yesterday, 7d, 30d, This month, Last month) + Custom range हैं। User को confusion है क्योंकि "From=15" set करने पर 15 के बाद की भी leads आती हैं।

- DateFilter popover में एक नया section जोड़ना: **"Specific day"** — single-date picker। Date select करते ही `dateFrom = startOfDay(d)`, `dateTo = endOfDay(d)` set हो जाएगा (मतलब उस एक दिन की ही leads).
- Chip में "Date: 15 May" जैसा clean दिखेगा (single-day detect करके — दोनों एक ही दिन हों तो).

### 3. Verification

- Plan apply होने के बाद user को बोलना: एक छोटा test file (5 rows different dates) फिर से import करें। Preview में देखें Created Date column properly parsed दिख रहा है। फिर Leads page पर Date filter → Specific day → 15 May चुनें → सिर्फ 15 May वाली leads आएंगी।
- अगर पुरानी import की leads भी fix करनी हैं तो उन्हें delete करके फिर से import करना होगा (already-inserted rows का `created_at` change करना अलग operation है, अभी scope में नहीं — user कहें तो migration से कर देंगे).

## Files

- `src/routes/_authenticated/import.tsx` — `parseFlexibleDate` extend, unparsed warning UI, errors row
- `src/components/leads/leads-filter-bar.tsx` — `DateFilter` में Specific day picker, single-day chip label

कोई backend / schema change नहीं — सब frontend में।
