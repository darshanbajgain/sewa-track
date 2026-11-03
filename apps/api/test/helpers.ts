import type { Express } from 'express';
import request from 'supertest';
import { pool } from '../src/db/pool.js';

/** Demo login emails from db/seed-data/demo-users.json (password demo1234). */
export const DEMO = {
  citizen: 'citizen@example.com',
  officerWard1: 'officer.ward1@example.com',
  officer2Ward1: 'officer2.ward1@example.com',
  officerWard2: 'officer.ward2@example.com',
  palikaAdmin: 'palika.admin@example.com',
  systemAdmin: 'system.admin@example.com',
} as const;

/** Logs in through the real endpoint and returns the "sewa_session=..." cookie for later requests. */
export async function loginAs(app: Express, email: string): Promise<string> {
  const portal = email === DEMO.citizen ? 'CITIZEN' : 'STAFF';
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'demo1234', portal });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sewa_session='));
  return cookie!.split(';')[0]!;
}

/**
 * Empties the request tables so each test file starts clean.
 * TRUNCATE (not DELETE): the audit log blocks DELETE by design, and TRUNCATE is a separate
 * command meant for exactly this kind of full reset. All three tables are listed together
 * because they reference each other.
 */
export async function resetRequests(): Promise<void> {
  await pool.query('TRUNCATE request_documents, request_events, identity_checks, service_requests');
}

/** The id of ward N of Kathmandu Metropolitan City (palika 307). */
export async function kathmanduWardId(number: number): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM wards WHERE local_level_id = 307 AND number = $1`, [
    number,
  ]);
  return rows[0]!.id;
}

/**
 * A session cookie for a demo user WITHOUT calling the login endpoint.
 * Use this when a test just needs "be user X". Logging in 6 users through the real endpoint
 * trips the login rate limit (5/min), which is working as designed. Login itself is tested in auth.test.ts.
 */
export async function sessionFor(email: string): Promise<string> {
  const { signSessionToken } = await import('../src/security/token.js');
  const { rows } = await pool.query(
    `SELECT id, role, ward_id AS "wardId", local_level_id AS "localLevelId" FROM users WHERE email = $1`,
    [email],
  );
  if (!rows[0]) throw new Error(`no user with email ${email}`);
  return `sewa_session=${signSessionToken(rows[0])}`;
}
