import { runMigrations } from '../src/db/migrate.js';

/**
 * Runs ONCE before all test files: brings the test database schema up to date,
 * so every integration test runs against exactly the schema the migrations define.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see vitest.config.ts)');
  await runMigrations(url);
}
