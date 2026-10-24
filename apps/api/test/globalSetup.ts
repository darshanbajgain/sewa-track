import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { runSeed } from '../src/db/seed.js';

/**
 * Runs ONCE before all test files:
 *   1. brings the test database schema up to date (migrations),
 *   2. loads reference data (locations, service catalog), which many tests need.
 * Both steps are idempotent, so running tests again and again is safe.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see vitest.config.ts)');

  await runMigrations(url);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await runSeed(client);
  } finally {
    await client.end();
  }
}
