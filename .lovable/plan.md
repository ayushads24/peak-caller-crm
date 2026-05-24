Problem clear hai: Leads page ke top-right Import button abhi purana quick CSV importer use kar raha hai. Woh sirf client_name, email, phone, sales_value, lead_source insert karta hai. Isliye Excel/CSV me Status, Labels, Assigned name, Notes, Tasks, Created On sab hone ke baad bhi app me lead Fresh, Unassigned, no labels, current created time ke saath aa rahi hai.

Plan:

1. Leads page ka broken quick importer remove/replace karna
   - `/leads` page ke Import button ko direct proper Historical Import page (`/import`) par bhejenge.
   - Old `importCsv()` logic remove/disable karenge, kyunki wahi data loss ka root cause hai.
   - Isse user galti se wrong importer use nahi karega.

2. Proper Import page ko single source of truth banana
   - `/import` page already Status, Labels, Assigned To, Notes, Tasks, Created Date parse/insert karta hai.
   - Usme mapping preview visible rahega, taaki import se pehle clearly दिखे कि Excel का कौन सा column कहाँ जा रहा है.

3. Excel columns ko exact CRM fields से map करना
   - Status → lead status
   - Assignee name → assigned user
   - Name, Phone, Email → lead details
   - Lead Source, BUDGET → source/value
   - Created On → original lead `created_at`, जिससे date filter चलेगा
   - Labels → lead labels
   - Notes → notes tab
   - Task fields → tasks tab
   - Alternate Phone, City, Facebook ad, Facebook Campaign, Capture Frequency, Lead id, Batch Names → labelled notes में preserve होंगे

4. Import errors को ज्यादा clear करना
   - अगर status या assignee CRM में match नहीं होता, import silently Fresh/Unassigned नहीं दिखाएगा; user को row-wise error मिलेगा जैसे `Unknown assignee` / `Unknown status`.
   - इससे पता चलेगा कि Excel में नाम CRM user/status से match नहीं हो रहा.

5. Verify करना
   - Code check करूँगा कि `/leads` का Import अब पुराना partial importer नहीं चला रहा.
   - Proper import flow में created_at/status/assigned/labels/tasks/notes insert logic intact रहे.