import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { hashPassword } from '../security/password.js';

/**
 * Seeds REFERENCE data (location hierarchy, service catalog) and the fake DEMO accounts.
 * (Demo requests are added in a later phase, together with the code that uses them.)
 *
 * Properties:
 *   - Idempotent: running it twice gives the same result ("upsert": insert, or update if the row exists).
 *   - Non-destructive: it never deletes rows, so it is safe to run on a database that already has requests.
 *   - All-or-nothing: everything runs in ONE transaction.
 *   - Fast: each table is filled with ONE INSERT that reads a JSON array (no loop of 753 queries).
 */

const SEED_DIR = fileURLToPath(new URL('../../db/seed-data/', import.meta.url));

export interface SeedSummary {
  provinces: number;
  districts: number;
  localLevels: number;
  wards: number;
  serviceTypes: number;
  users: number;
}

async function readSeedFile(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(SEED_DIR + name, 'utf8')) as Record<string, unknown>;
}

/**
 * How the bulk inserts work (Postgres `jsonb_to_recordset`):
 *   We send the whole array as ONE JSON parameter ($1). `jsonb_to_recordset` turns it into rows,
 *   with the column names and types we declare in `AS x(...)`. Then INSERT ... SELECT inserts them.
 *   One round trip per table, and the data is still a parameter, never pasted into the SQL text.
 *
 * `ON CONFLICT (id) DO UPDATE SET ... = EXCLUDED....`:
 *   if a row with that id already exists, update it with the new values (EXCLUDED = the row we
 *   tried to insert). That's what makes the seed safe to run again.
 */
export async function runSeed(client: pg.ClientBase): Promise<SeedSummary> {
  const locations = await readSeedFile('locations.json');
  const catalog = await readSeedFile('service-types.json');
  const demo = await readSeedFile('demo-users.json');

  // Hash the demo password once per user (each gets its own random salt). Done BEFORE the
  // transaction starts, so slow hashing doesn't keep the transaction open.
  const demoUsers = await Promise.all(
    (demo.users as Record<string, unknown>[]).map(async (u) => ({
      ...u,
      passwordHash: await hashPassword(demo.password as string),
    })),
  );

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO provinces (id, name_en, name_ne)
       SELECT id, "nameEn", "nameNe"
       FROM jsonb_to_recordset($1::jsonb) AS x(id smallint, "nameEn" text, "nameNe" text)
       ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ne = EXCLUDED.name_ne`,
      [JSON.stringify(locations.provinces)],
    );

    await client.query(
      `INSERT INTO districts (id, province_id, name_en, name_ne)
       SELECT id, "provinceId", "nameEn", "nameNe"
       FROM jsonb_to_recordset($1::jsonb) AS x(id smallint, "provinceId" smallint, "nameEn" text, "nameNe" text)
       ON CONFLICT (id) DO UPDATE
         SET province_id = EXCLUDED.province_id, name_en = EXCLUDED.name_en, name_ne = EXCLUDED.name_ne`,
      [JSON.stringify(locations.districts)],
    );

    // lat/lng are left out on purpose: they stay NULL until verified boundaries exist (migration 002).
    await client.query(
      `INSERT INTO local_levels (id, district_id, name_en, name_ne, type)
       SELECT id, "districtId", "nameEn", "nameNe", type
       FROM jsonb_to_recordset($1::jsonb) AS x(id integer, "districtId" smallint, "nameEn" text, "nameNe" text, type text)
       ON CONFLICT (id) DO UPDATE
         SET district_id = EXCLUDED.district_id, name_en = EXCLUDED.name_en,
             name_ne = EXCLUDED.name_ne, type = EXCLUDED.type`,
      [JSON.stringify(locations.localLevels)],
    );

    // Wards: the source only says HOW MANY wards each palika has (e.g. Kathmandu: 32).
    // generate_series(1, wards) produces the numbers 1..32; CROSS JOIN LATERAL runs it once per
    // palika, so this single INSERT creates all 6,743 ward rows. Existing wards are left as they are.
    await client.query(
      `INSERT INTO wards (local_level_id, number)
       SELECT x.id, ward.number
       FROM jsonb_to_recordset($1::jsonb) AS x(id integer, wards integer)
       CROSS JOIN LATERAL generate_series(1, x.wards) AS ward(number)
       ON CONFLICT (local_level_id, number) DO NOTHING`,
      [JSON.stringify(locations.localLevels)],
    );

    await client.query(
      `INSERT INTO service_types
         (code, name_en, name_ne, fee_npr, service_days, requires_field_verification, required_documents)
       SELECT code, "nameEn", "nameNe", "feeNpr", "serviceDays", "requiresFieldVerification", "requiredDocuments"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         code text, "nameEn" text, "nameNe" text, "feeNpr" integer, "serviceDays" integer,
         "requiresFieldVerification" boolean, "requiredDocuments" jsonb)
       ON CONFLICT (code) DO UPDATE
         SET name_en = EXCLUDED.name_en, name_ne = EXCLUDED.name_ne, fee_npr = EXCLUDED.fee_npr,
             service_days = EXCLUDED.service_days,
             requires_field_verification = EXCLUDED.requires_field_verification,
             required_documents = EXCLUDED.required_documents`,
      [JSON.stringify(catalog.serviceTypes)],
    );

    // Demo accounts. A ward officer's ward is found by (palika id, ward number) with a LEFT JOIN;
    // other roles have no ward, so the join finds nothing and ward_id stays NULL.
    // On re-run: update name/role/scope, but keep the existing password hash (no needless change).
    await client.query(
      `INSERT INTO users (role, name, email, phone, password_hash, ward_id, local_level_id)
       SELECT x.role, x.name, x.email, x.phone, x."passwordHash", w.id, x."localLevelId"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         role text, name text, email text, phone text, "passwordHash" text,
         "wardLocalLevelId" integer, "wardNumber" integer, "localLevelId" integer)
       LEFT JOIN wards w ON w.local_level_id = x."wardLocalLevelId" AND w.number = x."wardNumber"
       ON CONFLICT (phone) DO UPDATE
         SET role = EXCLUDED.role, name = EXCLUDED.name, email = EXCLUDED.email, is_active = true,
             ward_id = EXCLUDED.ward_id, local_level_id = EXCLUDED.local_level_id`,
      [JSON.stringify(demoUsers)],
    );

    // Count everything in one query (each sub-SELECT is a scalar subquery).
    const { rows } = await client.query<{ [K in keyof SeedSummary]: number }>(
      `SELECT (SELECT count(*) FROM provinces)::int     AS "provinces",
              (SELECT count(*) FROM districts)::int     AS "districts",
              (SELECT count(*) FROM local_levels)::int  AS "localLevels",
              (SELECT count(*) FROM wards)::int         AS "wards",
              (SELECT count(*) FROM service_types)::int AS "serviceTypes",
              (SELECT count(*) FROM users)::int         AS "users"`,
    );

    await client.query('COMMIT');
    return rows[0]!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
