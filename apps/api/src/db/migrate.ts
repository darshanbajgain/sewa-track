import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * A small migration runner (no library needed).
 *
 * How it works:
 *   1. Keep a table `schema_migrations` listing every migration file already applied.
 *   2. Read `db/migrations/*.sql`, sorted by name (001_, 002_, ...).
 *   3. For each file not yet applied: run it AND record it, inside ONE transaction.
 *      If any statement fails, the transaction rolls back and the schema is unchanged.
 *
 * Safety:
 *   - A checksum (SHA-256 of the file) is stored. If an already-applied file is edited later,
 *     we stop with an error, because the database would no longer match the files.
 *   - An advisory lock makes sure two runners (e.g. two deploys at once) never migrate together.
 *
 * It takes a connection string instead of using the app's pool/env, so tests can point it
 * at the test database.
 */

// Works from both src/db (dev, tsx) and dist/db (compiled): both are two levels below apps/api.
const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

// Any fixed number; all runners must use the same one to share the lock.
const MIGRATION_LOCK_ID = 727_001;

export interface MigrationResult {
  applied: string[]; // files applied in this run
  skipped: number; // files that were already applied
}

export async function runMigrations(connectionString: string): Promise<MigrationResult> {
  // A single client (not a pool): migrations run one after another on one connection.
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // Waits here if another runner holds the lock; released in `finally`.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    // name → checksum of everything already applied
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const appliedChecksums = new Map(rows.map((r) => [r.name, r.checksum]));

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const result: MigrationResult = { applied: [], skipped: 0 };

    for (const file of files) {
      const sql = await readFile(MIGRATIONS_DIR + file, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = appliedChecksums.get(file);

      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${file} was changed after it was applied. Never edit applied migrations; add a new file instead.`,
          );
        }
        result.skipped += 1;
        continue;
      }

      // Run the file and record it together: both happen, or neither does.
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed and was rolled back: ${(err as Error).message}`);
      }
    }

    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    await client.end();
  }
}
