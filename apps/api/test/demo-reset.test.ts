import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BIRTAMOD_LOCAL_LEVEL_ID, demoReset, OLD_DEMO_EMAILS, type DemoResetSummary } from '../src/db/demo-reset.js';
import { seedLarge } from '../src/db/seed-large.js';
import { runSeed, type SeedUser } from '../src/db/seed.js';
import { verifyPassword } from '../src/security/password.js';

/**
 * `pnpm demo:reset` against the test database. It deletes the old demo accounts, which are exactly the
 * test fixture accounts, so afterAll puts them back (runSeed with the fixtures) for the files that follow.
 */
const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL! });
const ADMIN = { email: 'test-root-admin@example.com', password: 'a-long-test-password' };
const KEPT = 'test-owner-staff@example.com'; // like an account the owner created: must survive
let summary: DemoResetSummary;

const one = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0];

beforeAll(async () => {
  await client.connect();
  await seedLarge(client, 100); // some old requests to be deleted
  // An "owner-created" staff account, created by the old demo system admin.
  await client.query(
    `INSERT INTO users (role, name, email, password_hash, ward_id, created_by)
     SELECT 'WARD_OFFICER', 'Owner Staff (Demo)', $1, 'x', w.id, (SELECT id FROM users WHERE email = 'system.admin@example.com')
     FROM wards w WHERE w.local_level_id = $2 AND w.number = 2
     ON CONFLICT (email) DO NOTHING`,
    [KEPT, BIRTAMOD_LOCAL_LEVEL_ID],
  );
  summary = await demoReset(client, { admin: ADMIN, sampleCount: 300 });
});

afterAll(async () => {
  await client.query('TRUNCATE request_documents, request_events, identity_checks, service_requests');
  await client.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [[ADMIN.email, KEPT, 'sample.data@example.com']]);
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/test-users.json', import.meta.url), 'utf8')) as { users: SeedUser[] };
  await runSeed(client, { extraUsers: fixtures.users }); // the deleted test accounts come back
  await client.end();
});

describe('demo:reset', () => {
  it('replaces every request with the sample, none in Birtamod, each with its audit history', async () => {
    expect(summary).toMatchObject({ requests: 300, requestsInExcluded: 0 });
    const { owner } = await one(`SELECT count(DISTINCT citizen_id)::int AS owner FROM service_requests`);
    expect(owner).toBe(1); // all belong to the one no-login sample account
    const { missing } = await one(
      `SELECT count(*)::int AS missing FROM service_requests r
       WHERE NOT EXISTS (SELECT 1 FROM request_events e WHERE e.request_id = r.id AND e.action = 'CREATED')`,
    );
    expect(missing).toBe(0);
  });

  it('deletes the old demo accounts and keeps the others (owner-created staff lose only created_by)', async () => {
    const { n } = await one(`SELECT count(*)::int AS n FROM users WHERE email = ANY($1::text[])`, [OLD_DEMO_EMAILS]);
    expect(n).toBe(0);
    expect(await one(`SELECT role, created_by FROM users WHERE email = $1`, [KEPT])).toEqual({ role: 'WARD_OFFICER', created_by: null });
  });

  it('has the public demo accounts in Birtamod and the private admin with the env password', async () => {
    const { rows } = await client.query(
      `SELECT u.email, u.role, coalesce(wl.id, u.local_level_id) AS palika, w.number AS ward
       FROM users u LEFT JOIN wards w ON w.id = u.ward_id LEFT JOIN local_levels wl ON wl.id = w.local_level_id
       WHERE u.email IN ('citizen@example.com', 'officer.birtamod2@example.com', 'palika.birtamod@example.com') ORDER BY u.email`,
    );
    expect(rows).toEqual([
      { email: 'citizen@example.com', role: 'CITIZEN', palika: null, ward: null },
      { email: 'officer.birtamod2@example.com', role: 'WARD_OFFICER', palika: BIRTAMOD_LOCAL_LEVEL_ID, ward: 2 },
      { email: 'palika.birtamod@example.com', role: 'PALIKA_ADMIN', palika: BIRTAMOD_LOCAL_LEVEL_ID, ward: null },
    ]);
    const admin = await one(`SELECT role, password_hash FROM users WHERE email = $1`, [ADMIN.email]);
    expect(admin.role).toBe('SYSTEM_ADMIN');
    expect(await verifyPassword(ADMIN.password, admin.password_hash)).toBe(true);
    expect(summary.usersByRole.SYSTEM_ADMIN).toBe(1);
  });

  it('rotates the admin password when seeded again with a new one', async () => {
    await runSeed(client, { admin: { email: ADMIN.email, password: 'another-long-password' } });
    const admin = await one(`SELECT password_hash FROM users WHERE email = $1`, [ADMIN.email]);
    expect(await verifyPassword('another-long-password', admin.password_hash)).toBe(true);
    expect(await verifyPassword(ADMIN.password, admin.password_hash)).toBe(false);
  });
});
