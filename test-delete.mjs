import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ymhctomdekmlrdqhcwsw.supabase.co',
  'sb_publishable_5ANhoeZxcwKNo5lnxDj6Kg_0ObSkYRH'
);

// Get session for admin
const linkRes = await fetch('https://ymhctomdekmlrdqhcwsw.supabase.co/auth/v1/admin/generate_link', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltaGN0b21kZWttbHJkcWhjd3N3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI5MjIyNCwiZXhwIjoyMDk0ODY4MjI0fQ.ypw4aOIMyU4bw_c3ZNdMFIsJPgQJRvx6T0NMhlLO8Vg',
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltaGN0b21kZWttbHJkcWhjd3N3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI5MjIyNCwiZXhwIjoyMDk0ODY4MjI0fQ.ypw4aOIMyU4bw_c3ZNdMFIsJPgQJRvx6T0NMhlLO8Vg',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ type: 'magiclink', email: 'ayushads24@gmail.com' }),
});
const { email_otp } = await linkRes.json();
const verifyRes = await fetch('https://ymhctomdekmlrdqhcwsw.supabase.co/auth/v1/verify', {
  method: 'POST',
  headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltaGN0b21kZWttbHJkcWhjd3N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTIyMjQsImV4cCI6MjA5NDg2ODIyNH0._Kmi-NjoPHBTgmgtJVAcI0H7S5HrHKAc1hRGkSCQTCE', 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'email', email: 'ayushads24@gmail.com', token: email_otp }),
});
const session = await verifyRes.json();
await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });

// Get a lead
const { data: leads } = await supabase.from('leads').select('id, client_name, status_id, assigned_to').limit(1);
const lead = leads?.[0];
console.log('Testing with lead:', lead?.client_name);

// 1. Test UPDATE (same as save function does)
console.log('\n--- Test UPDATE ---');
const { error: updateErr, status: updateStatus } = await supabase
  .from('leads')
  .update({ client_name: lead.client_name, email: null, phone: null, sales_value: null, lead_source: null, status_id: lead.status_id, assigned_to: lead.assigned_to ?? null, doubletick_contact_id: null })
  .eq('id', lead.id);
console.log('UPDATE status:', updateStatus, '| error:', updateErr ? JSON.stringify(updateErr) : 'none');

// 2. Test DELETE
console.log('\n--- Test DELETE ---');
const { error: delErr, status: delStatus } = await supabase.from('leads').delete().eq('id', '00000000-0000-0000-0000-ffffffffffff');
console.log('DELETE status:', delStatus, '| error:', delErr ? JSON.stringify(delErr) : 'none');
