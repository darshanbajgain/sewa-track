import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, pool } from '../src/db/pool.js';
import { updateStatusWithVersion } from '../src/repositories/change.repository.js';
import { DEMO, kathmanduWardId, resetRequests } from './helpers.js';

/**
 * Optimistic locking at the DATABASE level, with the race forced on purpose (ADR-002, incident 001).
 *
 * Why this test exists: the API-level concurrency test passes, but its two HTTP requests don't
 * reliably overlap, so the 409 usually comes from the service's early version check and the
 * `WHERE ... AND version = $2` guard is never exercised. Here we control both transactions by hand,
 * so the database guard is the ONLY thing that can stop a lost update.
 */
afterAll(() => closePool());

let requestId: string;

beforeEach(async () => {
  await resetRequests();
  const { rows: users } = await pool.query(`SELECT id FROM users WHERE phone = $1`, [DEMO.citizen]);
  const { rows } = await pool.query(
    `INSERT INTO service_requests (tracking_code, citizen_id, service_type_code, ward_id, local_level_id, district_id, province_id, purpose, applicant)
     VALUES ('ST-K0CK000001', $1, 'RESIDENCE', $2, 307, 27, 3, 'Locking test request', '{"name":"Demo","nid":"DEMO-0000000"}')
     RETURNING id`,
    [users[0].id, await kathmanduWardId(1)],
  );
  requestId = rows[0].id; // status SUBMITTED, version 0
});

const update = (client: Parameters<typeof updateStatusWithVersion>[0], toStatus: 'UNDER_REVIEW' | 'CANCELLED') =>
  updateStatusWithVersion(client, {
    id: requestId,
    expectedVersion: 0, // BOTH writers saw version 0
    toStatus,
    assignOfficerId: null,
    setFieldVerifiedAt: false,
    setClosedAt: toStatus === 'CANCELLED',
  });

describe('two transactions that both read version 0', () => {
  it('the second waits for the first, re-checks, and updates 0 rows: no lost update', async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');

      // Writer 1 updates: Postgres now holds a row lock until writer 1 commits or rolls back.
      expect(await update(first, 'UNDER_REVIEW')).toEqual({ status: 'UNDER_REVIEW', version: 1 });

      // Writer 2 tries the same row: it must WAIT on the lock (not overwrite, not fail yet).
      let secondDone = false;
      const secondResult = update(second, 'CANCELLED').then((r) => {
        secondDone = true;
        return r;
      });
      await sleep(150);
      expect(secondDone).toBe(false); // still blocked behind writer 1

      // Writer 1 commits. Writer 2 wakes up, re-checks `version = 0` against the NEW row (version 1)...
      await first.query('COMMIT');
      expect(await secondResult).toBeNull(); // ...matches nothing → 0 rows → the service answers 409
      await second.query('ROLLBACK');
    } finally {
      first.release();
      second.release();
    }

    const { rows } = await pool.query(`SELECT status, version FROM service_requests WHERE id = $1`, [requestId]);
    expect(rows[0]).toEqual({ status: 'UNDER_REVIEW', version: 1 }); // writer 1's change survived
  });

  it('a stale version simply matches nothing', async () => {
    const client = await pool.connect();
    try {
      await client.query(`UPDATE service_requests SET version = 5 WHERE id = $1`, [requestId]);
      expect(await update(client, 'UNDER_REVIEW')).toBeNull();
    } finally {
      client.release();
    }
  });
});
