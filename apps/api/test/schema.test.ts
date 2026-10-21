import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate.js';

/**
 * Tests that the DATABASE itself rejects bad data (constraints + trigger),
 * independent of any API code.
 *
 * Each test runs inside a transaction that is ROLLED BACK afterwards, so tests leave
 * no rows behind and don't affect each other.
 */
const url = process.env.TEST_DATABASE_URL!;
const client = new pg.Client({ connectionString: url });

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(() => client.query('BEGIN'));
afterEach(() => client.query('ROLLBACK'));

/**
 * Runs a statement that SHOULD fail and returns the error message.
 * A failed statement aborts the whole transaction in Postgres, so we wrap it in a
 * SAVEPOINT and roll back to it: the test can continue after the expected error.
 */
async function expectDbError(sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT expect_error');
  try {
    await client.query(sql, params);
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT expect_error');
    return (err as Error).message;
  }
  throw new Error(`Expected this statement to fail, but it succeeded: ${sql}`);
}

/** Inserts the minimum rows needed for one valid service request. Returns their ids. */
async function insertValidRequest() {
  await client.query(`INSERT INTO provinces (id, name_en, name_ne) VALUES (99, 'Test Province', 'परीक्षण प्रदेश')`);
  await client.query(`INSERT INTO districts (id, province_id, name_en, name_ne) VALUES (999, 99, 'Test District', 'परीक्षण जिल्ला')`);
  await client.query(
    `INSERT INTO local_levels (id, district_id, name_en, name_ne, type, lat, lng)
     VALUES (99999, 999, 'Test Palika', 'परीक्षण पालिका', 'MUNICIPALITY', 27.7, 85.3)`,
  );
  const ward = await client.query<{ id: number }>(
    `INSERT INTO wards (local_level_id, number, lat, lng) VALUES (99999, 1, 27.7, 85.3) RETURNING id`,
  );
  const citizen = await client.query<{ id: string }>(
    `INSERT INTO users (role, name, phone, password_hash) VALUES ('CITIZEN', 'Demo Citizen', '9000099999', 'x') RETURNING id`,
  );
  await client.query(
    `INSERT INTO service_types (code, name_en, name_ne, fee_npr, service_days)
     VALUES ('RESIDENCE', 'Residence verification', 'बसोबास प्रमाणित', 100, 1)
     ON CONFLICT (code) DO NOTHING`,
  );
  const request = await client.query<{ id: string }>(
    `INSERT INTO service_requests
       (tracking_code, citizen_id, service_type_code, ward_id, local_level_id, district_id, province_id, purpose, applicant)
     VALUES ('ST-0123456789', $1, 'RESIDENCE', $2, 99999, 999, 99, 'Needed for a bank account', '{"name":"Demo"}')
     RETURNING id`,
    [citizen.rows[0]!.id, ward.rows[0]!.id],
  );
  return { wardId: ward.rows[0]!.id, citizenId: citizen.rows[0]!.id, requestId: request.rows[0]!.id };
}

describe('migrations', () => {
  it('are idempotent: running again applies nothing', async () => {
    // Global setup already migrated. A second run must skip everything.
    const result = await runMigrations(url);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it('create all tables from the PRD data model', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        'provinces', 'districts', 'local_levels', 'wards', 'users',
        'service_types', 'service_requests', 'request_events', 'identity_checks', 'schema_migrations',
      ]),
    );
  });
});

describe('constraints', () => {
  it('accept a valid request', async () => {
    const { requestId } = await insertValidRequest();
    const { rows } = await client.query(`SELECT status, version FROM service_requests WHERE id = $1`, [requestId]);
    expect(rows[0]).toEqual({ status: 'SUBMITTED', version: 0 }); // defaults applied
  });

  it('reject a tracking code that is not ST- + 10 Crockford Base32 chars', async () => {
    const { requestId } = await insertValidRequest();
    // "I" is not in Crockford Base32 (looks like 1).
    const msg = await expectDbError(`UPDATE service_requests SET tracking_code = 'ST-I123456789' WHERE id = $1`, [requestId]);
    expect(msg).toMatch(/check constraint/);
  });

  it('reject an unknown status', async () => {
    const { requestId } = await insertValidRequest();
    const msg = await expectDbError(`UPDATE service_requests SET status = 'DONE' WHERE id = $1`, [requestId]);
    expect(msg).toMatch(/check constraint/);
  });

  it('reject a final status without closed_at (and closed_at on an open request)', async () => {
    const { requestId } = await insertValidRequest();
    const msg1 = await expectDbError(`UPDATE service_requests SET status = 'ISSUED' WHERE id = $1`, [requestId]);
    expect(msg1).toMatch(/service_requests_closed_matches_status/);
    const msg2 = await expectDbError(`UPDATE service_requests SET closed_at = now() WHERE id = $1`, [requestId]);
    expect(msg2).toMatch(/service_requests_closed_matches_status/);
  });

  it('reject a ward officer with no ward (role scope)', async () => {
    const msg = await expectDbError(
      `INSERT INTO users (role, name, phone, password_hash) VALUES ('WARD_OFFICER', 'Ward Officer (Demo)', '9000088888', 'x')`,
    );
    expect(msg).toMatch(/users_role_scope/);
  });

  it('reject a negative fee', async () => {
    const msg = await expectDbError(
      `INSERT INTO service_types (code, name_en, name_ne, fee_npr, service_days) VALUES ('LOW_INCOME', 'x', 'x', -1, 1)`,
    );
    expect(msg).toMatch(/check constraint/);
  });
});

describe('request_events (audit log)', () => {
  it('allows INSERT but blocks UPDATE and DELETE (append-only trigger)', async () => {
    const { requestId, citizenId } = await insertValidRequest();
    await client.query(
      `INSERT INTO request_events (request_id, actor_id, action, to_status) VALUES ($1, $2, 'CREATED', 'SUBMITTED')`,
      [requestId, citizenId],
    );

    const updateMsg = await expectDbError(`UPDATE request_events SET note = 'changed' WHERE request_id = $1`, [requestId]);
    expect(updateMsg).toMatch(/append-only: UPDATE is not allowed/);

    const deleteMsg = await expectDbError(`DELETE FROM request_events WHERE request_id = $1`, [requestId]);
    expect(deleteMsg).toMatch(/append-only: DELETE is not allowed/);
  });
});
