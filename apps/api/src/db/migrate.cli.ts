import { env } from '../config/env.js';
import { runMigrations } from './migrate.js';

/**
 * Command-line entry: `pnpm db:migrate` applies pending migrations to DATABASE_URL.
 * Kept separate from migrate.ts so tests can import runMigrations without running this.
 */
const { applied, skipped } = await runMigrations(env.DATABASE_URL);

if (applied.length === 0) {
  console.log(`Database is up to date (${skipped} migration(s) already applied).`);
} else {
  console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
}
