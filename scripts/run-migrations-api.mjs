import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dir, 'setup-database.sql'), 'utf8');

const PAT = 'sbp_cb4d28ab5d6915bd8a51de82a4a17218ee346193';
const PROJECT_REF = 'ymhctomdekmlrdqhcwsw';
const URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runQuery(query) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log('Running full database setup via Supabase Management API...\n');

  try {
    const result = await runQuery(sql);
    console.log('✓ Migrations completed successfully!');
    console.log('Result:', JSON.stringify(result).slice(0, 200));
  } catch (err) {
    console.error('✗ Error:', err.message.slice(0, 500));
    process.exit(1);
  }
}

main();
