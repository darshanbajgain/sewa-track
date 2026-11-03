import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { runSeed, type SeedUser } from '../src/db/seed.js';

/**
 * Runs ONCE before all test files:
 *   1. brings the test database schema up to date (migrations),
 *   2. loads reference data (locations, service catalog) and the accounts the tests use: the public demo
 *      set plus test-only accounts (fixtures/test-users.json: Kathmandu officers, palika admin, system admin).
 * Both steps are idempotent, so running tests again and again is safe.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see vitest.config.ts)');

  await runMigrations(url);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const fixtures = JSON.parse(await readFile(new URL('./fixtures/test-users.json', import.meta.url), 'utf8')) as { users: SeedUser[] };
    await runSeed(client, { extraUsers: fixtures.users });
  } finally {
    await client.end();
  }
}
