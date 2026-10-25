import type { Express } from 'express';
import request from 'supertest';
import { pool } from '../src/db/pool.js';

/** Demo phone numbers from db/seed-data/demo-users.json (password demo1234). */
export const DEMO = {
  citizen: '9000000001',
  officerWard1: '9000000002',
  officer2Ward1: '9000000003',
  officerWard2: '9000000004',
  palikaAdmin: '9000000005',
  systemAdmin: '9000000006',
} as const;

/** Logs in through the real endpoint and returns the "sewa_session=..." cookie for later requests. */
export async function loginAs(app: Express, phone: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ phone, password: 'demo1234' });
  if (res.status !== 200) throw new Error(`login failed for ${phone}: ${res.status}`);
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
  await pool.query('TRUNCATE request_events, identity_checks, service_requests');
}

/** The id of ward N of Kathmandu Metropolitan City (palika 307). */
export async function kathmanduWardId(number: number): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM wards WHERE local_level_id = 307 AND number = $1`, [
    number,
  ]);
  return rows[0]!.id;
}
