import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedLarge } from '../src/db/seed-large.js';

/**
 * The bulk generator on a small sample (2,000 rows), so CI stays fast. If any generated row broke a
 * constraint (tracking code format, closed_at vs status, scope…), the INSERT itself would fail.
 */
const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL! });
let result: { requests: number; events: number };

beforeAll(async () => {
  await client.connect();
  result = await seedLarge(client, 2_000);
});
afterAll(async () => {
  await client.query('TRUNCATE request_events, identity_checks, service_requests'); // leave a clean DB
  await client.end();
});

const one = async (sql: string) => (await client.query(sql)).rows[0];

describe('seedLarge', () => {
  it('creates the requested number of requests with a CREATED event each, plus one per closed request', async () => {
    expect(result.requests).toBe(2_000);
    const { closed } = await one(`SELECT count(*)::int AS closed FROM service_requests WHERE closed_at IS NOT NULL`);
    expect(result.events).toBe(2_000 + closed);
  });

  it('keeps every row consistent: location ids match the ward, closed_at only on final statuses', async () => {
    const { mismatched } = await one(
      `SELECT count(*)::int AS mismatched FROM service_requests r
       JOIN wards w ON w.id = r.ward_id JOIN local_levels l ON l.id = w.local_level_id JOIN districts d ON d.id = l.district_id
       WHERE r.local_level_id <> l.id OR r.district_id <> d.id OR r.province_id <> d.province_id`,
    );
    expect(mismatched).toBe(0);
    const { badClose } = await one(
      `SELECT count(*)::int AS "badClose" FROM service_requests WHERE closed_at IS NOT NULL AND closed_at < submitted_at`,
    );
    expect(badClose).toBe(0);
  });

  it('is roughly 65% closed and skewed toward busy districts', async () => {
    const { closedShare } = await one(`SELECT avg((closed_at IS NOT NULL)::int)::float8 AS "closedShare" FROM service_requests`);
    expect(closedShare).toBeGreaterThan(0.55);
    expect(closedShare).toBeLessThan(0.75);

    // Kathmandu has weight 12 per ward vs 1 for most districts, so it must be far above the average district.
    const { kathmandu, average } = await one(
      `SELECT (SELECT count(*) FROM service_requests WHERE district_id = 27)::float8 AS kathmandu,
              (SELECT count(*) FROM service_requests)::float8 / 77 AS average`,
    );
    expect(kathmandu).toBeGreaterThan(average * 3);
  });

  it('uses only fake data: one bulk demo citizen and DEMO- ids', async () => {
    const { citizens } = await one(`SELECT count(DISTINCT citizen_id)::int AS citizens FROM service_requests`);
    expect(citizens).toBe(1);
    const { notDemo } = await one(`SELECT count(*)::int AS "notDemo" FROM service_requests WHERE applicant->>'nid' NOT LIKE 'DEMO-%'`);
    expect(notDemo).toBe(0);
  });
});
