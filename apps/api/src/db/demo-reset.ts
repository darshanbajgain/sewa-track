import type pg from 'pg';
import { insertSampleRequests } from './seed-large.js';
import { runSeed, type SeedAdmin } from './seed.js';

/**
 * `pnpm demo:reset` (PRD F13, owner decision 2026-11-03): puts the public demo back into a clean state.
 *
 *   1. seed: reference data, the public demo accounts, the private system admin (from env)
 *      (its own transaction; idempotent and never deletes anything, so it is safe even if step 2 fails)
 *   2. ONE transaction:
 *      a. delete ALL requests with their documents, history and ID checks (TRUNCATE: the audit log
 *         blocks DELETE by design; TRUNCATE is the separate "empty the table" command)
 *      b. delete the OLD demo accounts, by an explicit email list. Accounts not on the list (the owner's
 *         own, anyone who signed up) are kept. Staff they created get created_by = NULL first.
 *      c. add `sampleCount` anonymous SAMPLE requests across Nepal, none in the excluded palikas
 *         (Birtamod: its staff should see only real requests), so the delay map isn't empty.
 */

/** Demo accounts from before 2026-11-03 (Kathmandu set + the old bulk account). Deleted by the reset. */
export const OLD_DEMO_EMAILS = [
  'officer.ward1@example.com',
  'officer2.ward1@example.com',
  'officer.ward2@example.com',
  'palika.admin@example.com',
  'system.admin@example.com',
  'bulk.citizen@example.com',
];

export const BIRTAMOD_LOCAL_LEVEL_ID = 28;

export interface DemoResetOptions {
  admin: SeedAdmin;
  sampleCount?: number;
  excludeLocalLevelIds?: number[];
  now?: Date;
}

export interface DemoResetSummary {
  usersByRole: Record<string, number>;
  requests: number;
  requestsInExcluded: number;
}

export async function demoReset(client: pg.ClientBase, options: DemoResetOptions): Promise<DemoResetSummary> {
  const exclude = options.excludeLocalLevelIds ?? [BIRTAMOD_LOCAL_LEVEL_ID];

  await runSeed(client, { admin: options.admin });

  await client.query('BEGIN');
  try {
    await client.query('TRUNCATE request_documents, request_events, identity_checks, service_requests');

    // Never delete the admin we just seeded, even if someone reuses an old demo email for it.
    const doomed = OLD_DEMO_EMAILS.filter((email) => email !== options.admin.email);
    await client.query(
      `UPDATE users SET created_by = NULL WHERE created_by IN (SELECT id FROM users WHERE email = ANY($1::text[]))`,
      [doomed],
    );
    await client.query('DELETE FROM users WHERE email = ANY($1::text[])', [doomed]);

    await insertSampleRequests(client, options.sampleCount ?? 2_000, {
      now: options.now,
      excludeLocalLevelIds: exclude,
      citizen: { name: 'Sample data (demo)', email: 'sample.data@example.com', phone: '9099999998' },
      purpose: 'Sample data for the public delay map (demo)',
    });

    const { rows: roles } = await client.query<{ role: string; n: number }>('SELECT role, count(*)::int AS n FROM users GROUP BY role ORDER BY role');
    const { rows: counts } = await client.query<{ requests: number; excluded: number }>(
      `SELECT count(*)::int AS requests, count(*) FILTER (WHERE local_level_id = ANY($1::int[]))::int AS excluded FROM service_requests`,
      [exclude],
    );
    await client.query('COMMIT');
    await client.query('ANALYZE service_requests, request_events');

    return {
      usersByRole: Object.fromEntries(roles.map((r) => [r.role, r.n])),
      requests: counts[0]!.requests,
      requestsInExcluded: counts[0]!.excluded,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
