import pkg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pkg;
const __dir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dir, 'setup-database.sql'), 'utf8');

const hosts = [
  // Direct connection (IPv6)
  { host: 'db.ymhctomdekmlrdqhcwsw.supabase.co', port: 5432, user: 'postgres' },
  // IPv6 address directly
  { host: '2406:da1a:82a:9d01:c3a4:7a2b:c2a:b135', port: 5432, user: 'postgres' },
  // Pooler regions - session mode
  { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 5432, user: 'postgres.ymhctomdekmlrdqhcwsw' },
  { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, user: 'postgres.ymhctomdekmlrdqhcwsw' },
  { host: 'aws-0-us-east-1.pooler.supabase.com', port: 5432, user: 'postgres.ymhctomdekmlrdqhcwsw' },
  { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, user: 'postgres.ymhctomdekmlrdqhcwsw' },
];

async function tryConnect(config) {
  const client = new Client({
    ...config,
    database: 'postgres',
    password: 'WeddingQueen@-123',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    return client;
  } catch (e) {
    await client.end().catch(() => {});
    return null;
  }
}

async function main() {
  let client = null;

  for (const config of hosts) {
    process.stdout.write(`Trying ${config.host}:${config.port} (${config.user})... `);
    client = await tryConnect(config);
    if (client) { console.log('Connected!'); break; }
    console.log('failed');
  }

  if (!client) {
    console.error('\nAll connection attempts failed.');
    console.error('The Supabase project may require IPv6 access which this environment does not support.');
    process.exit(1);
  }

  console.log('\nRunning migrations...');
  try {
    await client.query(sql);
    console.log('\n✓ Migrations completed successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
