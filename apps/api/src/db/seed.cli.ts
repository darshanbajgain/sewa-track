import pg from 'pg';
import { env } from '../config/env.js';
import { adminFromEnv, runSeed } from './seed.js';

/**
 * Command-line entry: `pnpm db:seed` loads reference data and the demo accounts into DATABASE_URL (run
 * db:migrate first). With SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD set, it also creates/updates the system admin.
 */
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

try {
  const summary = await runSeed(client, { admin: adminFromEnv() });
  console.log('Seeded reference data:', summary);
} finally {
  await client.end();
}
