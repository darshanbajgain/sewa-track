import pg from 'pg';
import { env } from '../config/env.js';
import { runSeed } from './seed.js';

/** Command-line entry: `pnpm db:seed` loads reference data into DATABASE_URL (run db:migrate first). */
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

try {
  const summary = await runSeed(client);
  console.log('Seeded reference data:', summary);
} finally {
  await client.end();
}
