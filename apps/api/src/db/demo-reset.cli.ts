import pg from 'pg';
import { env } from '../config/env.js';
import { demoReset, OLD_DEMO_EMAILS } from './demo-reset.js';
import { adminFromEnv } from './seed.js';

/**
 * `pnpm demo:reset [sampleCount]`: see demo-reset.ts. DESTRUCTIVE (deletes every request), so it needs
 * CONFIRM_RESET=yes, and the system admin's SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD (from a private env
 * file, never the repo). Prints only counts: no emails of real accounts, no passwords, no URL.
 */
if (process.env.CONFIRM_RESET !== 'yes') {
  console.error('demo:reset deletes ALL requests and the old demo accounts. Run it with CONFIRM_RESET=yes.');
  process.exit(1);
}

const admin = adminFromEnv();
if (!admin) {
  console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (the private system admin) first.');
  process.exit(1);
}

const sampleCount = Number(process.argv[2] ?? 2_000);
if (!Number.isInteger(sampleCount) || sampleCount < 0 || sampleCount > 20_000) {
  console.error('Usage: pnpm demo:reset [sampleCount 0–20000]');
  process.exit(1);
}

console.log(`Resetting: all requests deleted, ${OLD_DEMO_EMAILS.length} old demo accounts removed, ${sampleCount} sample requests added (none in Birtamod).`);
// Fail loudly instead of waiting forever if the network to a hosted database drops (seen with Neon over
// IPv6): give up connecting after 20 s and any single query after 2 min. The transaction then rolls back.
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 20_000,
  query_timeout: 120_000,
  keepAlive: true,
});
await client.connect();
try {
  const summary = await demoReset(client, { admin, sampleCount });
  console.log('Done.', JSON.stringify(summary));
} finally {
  await client.end();
}
