
## Goal

Tumhari Excel ke exact column names (Status, Assignee name, Name, Phone, Email, Alternate Phone, Lead Source, BUDGET, City, Facebook ad, Facebook Campaign, Created On, Modified On, Capture Frequency, Captured On, Lead id, Batch Names) automatically sahi field pe map ho jayein, aur **Created On** ki date se CRM ke Leads page pe filter kar sako.

---

## 1. Import page — auto-map ko smarter banayenge

File: `src/routes/_authenticated/import.tsx`

**`autoGuess()` me regex update** taaki ye headers pakad le:

| Excel column | Maps to |
|---|---|
| Status | `status` |
| Assignee name | `assigned_to` |
| Name | `client_name` |
| Phone | `phone` |
| Email | `email` |
| Alternate Phone | `notes` (prefix `Alt Phone: …`) |
| Lead Source | `lead_source` |
| BUDGET | `sales_value` |
| City | `notes` (prefix `City: …`) |
| Facebook ad | `notes` (prefix `FB Ad: …`) |
| Facebook Campaign | `notes` (prefix `FB Campaign: …`) |
| **Created On** | `created_at` ✅ (leads.created_at is set from this) |
| Modified On | skip (CRM khud manage karta hai) |
| Capture Frequency | `notes` |
| Captured On | skip (Created On already covers it) |
| Lead id | `notes` (prefix `External ID: …`) |
| Batch Names | `notes` (prefix `Batch: …`) |

Kyunki "notes" sirf ek hi column le sakta hai, hum ek nayi helper field `extra_notes` add karenge jo multiple secondary columns (Alt Phone, City, FB Ad/Campaign, Capture Frequency, Lead id, Batch Names) ko **combine karke ek notes entry** banayega per lead — labeled lines me, taaki sab info safe rahe aur lead detail me dikhe.

`created_at` waala flow already sahi hai (line 348–349) — lead row insert hote hi `created_at` Excel ki date set ho jata hai. Bas auto-guess miss kar raha tha "Created On" ko reliably.

## 2. Leads page — Created Date filter UI wapas laana

File: `src/components/leads/leads-filter-bar.tsx`

`DateFilter` component already defined hai (line 256) aur leads page (`leads.tsx:157`) `dateFrom`/`dateTo` use bhi karta hai — bas toolbar row me button **render nahi ho raha**. Status/Label/Source ke saath ek `<DateFilter ... />` button add karenge with presets (Today, Last 7d, This month, Last month, custom range).

Iske baad imported leads ki original "Created On" date se filter karna ek click me ho jayega.

---

## Technical details

- `autoGuess` regex me ye additions:
  - `^status$` → status
  - `assigneename|assignee` → assigned_to
  - `^name$|^clientname$` → client_name
  - `alternate|altphone|secondaryphone` → new `extra_note:alt_phone`
  - `^budget$|^amount$` → sales_value
  - `^city$|location` → `extra_note:city`
  - `facebookad|fbad|adname` → `extra_note:fb_ad`
  - `facebookcampaign|fbcampaign|campaignname` → `extra_note:fb_campaign`
  - `createdon|^createddate$|^enquirydate$` → created_at
  - `modifiedon|updatedon` → SKIP
  - `capturefreq|capturefrequency` → `extra_note:capture_freq`
  - `capturedon` → SKIP (Created On wins)
  - `^leadid$|externalid` → `extra_note:lead_id`
  - `batchname|batchnames` → `extra_note:batch`
- New `FieldKey` variants for the 7 `extra_note:*` slots, all writing into a combined `notes` row per lead with `Label: value` lines, joined with `\n`. If user has also mapped a primary `notes` column, prepend it.
- Filter bar: insert `<DateFilter filters={filters} onChange={onChange} />` between Source and AssignedFilter; no logic changes needed in `leads.tsx`.

Confirm karo to build mode me jaake ye changes apply kar deta hoon.
