import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed.js';

/**
 * The global setup already seeded the test DB. These tests check the result against
 * official figures and prove the seed is safe to run again.
 */
const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL! });

beforeAll(() => client.connect());
afterAll(() => client.end());

async function count(sql: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`SELECT (${sql})::int AS n`);
  return rows[0]!.n;
}

describe('reference seed', () => {
  it('loads the official location counts (7 / 77 / 753 / 6,743 wards)', async () => {
    expect(await count('SELECT count(*) FROM provinces')).toBe(7);
    expect(await count('SELECT count(*) FROM districts')).toBe(77);
    expect(await count('SELECT count(*) FROM local_levels')).toBe(753);
    expect(await count('SELECT count(*) FROM wards')).toBe(6743);
  });

  it('has the official mix of local level types', async () => {
    const { rows } = await client.query<{ type: string; n: number }>(
      `SELECT type, count(*)::int AS n FROM local_levels GROUP BY type ORDER BY type`,
    );
    expect(rows).toEqual([
      { type: 'METRO', n: 6 },
      { type: 'MUNICIPALITY', n: 276 },
      { type: 'RURAL_MUNICIPALITY', n: 460 },
      { type: 'SUB_METRO', n: 11 },
    ]);
  });

  it('creates wards 1..N for each palika (Kathmandu Metropolitan City has 32)', async () => {
    const { rows } = await client.query<{ type: string; wards: number; max_number: number }>(
      `SELECT l.type, count(w.id)::int AS wards, max(w.number)::int AS max_number
       FROM local_levels l JOIN wards w ON w.local_level_id = l.id
       WHERE l.name_en = 'Kathmandu' AND l.type = 'METRO'
       GROUP BY l.type`,
    );
    expect(rows[0]).toEqual({ type: 'METRO', wards: 32, max_number: 32 });
  });

  it('stores Nepali names with the corrected spelling', async () => {
    const { rows } = await client.query(`SELECT name_ne FROM provinces WHERE id = 1`);
    expect(rows[0]).toEqual({ name_ne: 'कोशी प्रदेश' });
  });

  it('loads the 5 service types with demo fees and document lists', async () => {
    const { rows } = await client.query(
      `SELECT code, fee_npr, service_days, requires_field_verification, jsonb_array_length(required_documents) > 0 AS has_docs
       FROM service_types ORDER BY code`,
    );
    expect(rows).toEqual([
      { code: 'DATE_OF_BIRTH', fee_npr: 100, service_days: 1, requires_field_verification: false, has_docs: true },
      { code: 'LAND_BOUNDARY', fee_npr: 500, service_days: 3, requires_field_verification: true, has_docs: true },
      { code: 'LOW_INCOME', fee_npr: 0, service_days: 2, requires_field_verification: true, has_docs: true },
      { code: 'RELATIONSHIP', fee_npr: 200, service_days: 1, requires_field_verification: false, has_docs: true },
      { code: 'RESIDENCE', fee_npr: 100, service_days: 1, requires_field_verification: false, has_docs: true },
    ]);
  });

  it('creates fake demo accounts only: "(Demo)" names, 90-prefixed phones, hashed passwords', async () => {
    const { rows } = await client.query<{ name: string; phone: string; password_hash: string }>(
      `SELECT name, phone, password_hash FROM users WHERE phone LIKE '900000000_'`,
    );
    expect(rows).toHaveLength(6);
    for (const u of rows) {
      expect(u.name).toContain('(Demo)');
      expect(u.phone).toMatch(/^90\d{8}$/);
      expect(u.password_hash).toMatch(/^scrypt\$/); // stored as a hash, never the plain password
    }
  });

  it('puts both demo ward officers in Kathmandu Ward 1 (needed for the "two officers" demo)', async () => {
    const { rows } = await client.query(
      `SELECT u.phone, l.name_en AS palika, w.number AS ward
       FROM users u JOIN wards w ON w.id = u.ward_id JOIN local_levels l ON l.id = w.local_level_id
       WHERE u.phone IN ('9000000002', '9000000003') ORDER BY u.phone`,
    );
    expect(rows).toEqual([
      { phone: '9000000002', palika: 'Kathmandu', ward: 1 },
      { phone: '9000000003', palika: 'Kathmandu', ward: 1 },
    ]);
  });

  it('is idempotent: running it again changes no counts', async () => {
    const first = await runSeed(client);
    const second = await runSeed(client);
    expect(second).toEqual(first); // nothing added, nothing duplicated
    expect(second).toMatchObject({ provinces: 7, districts: 77, localLevels: 753, wards: 6743, serviceTypes: 5 });
  });
});
