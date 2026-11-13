import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { AppError } from '../src/errors.js';
import type { NidClient, NidResult } from '../src/integrations/nidClient.js';
import { runIdentityCheck } from '../src/services/identity.service.js';
import { DEMO, kathmanduWardId, resetRequests, sessionFor } from './helpers.js';

/**
 * PRD F9 end to end with a FAKE ID service: submit → the check runs after the reply → the result and
 * its audit event are stored → staff see it on the detail page; the public tracking page never does.
 */
let citizen: string;
let officer: string;
let ward1: number;

beforeAll(async () => {
  await resetRequests();
  citizen = await sessionFor(DEMO.citizen);
  officer = await sessionFor(DEMO.officerWard1);
  ward1 = await kathmanduWardId(1);
});
afterAll(() => closePool());

const answers = (result: NidResult): NidClient => ({ verify: async () => result });
const failsWith = (err: unknown): NidClient => ({
  verify: async () => {
    throw err;
  },
});

async function submit(nidClient: NidClient | null) {
  const app = createApp({ nidClient });
  const res = await request(app)
    .post('/api/v1/requests')
    .set('Cookie', citizen)
    .send({
      serviceTypeCode: 'RESIDENCE',
      wardId: ward1,
      purpose: 'Needed to open a bank account',
      applicant: { name: 'Demo Applicant', nid: 'DEMO-7654321' },
      consent: true,
    });
  expect(res.status).toBe(201);
  return { app, id: res.body.request.id as string, code: res.body.request.trackingCode as string };
}

const check = async (id: string) =>
  (await pool.query(`SELECT status, attempts, response_ms FROM identity_checks WHERE request_id = $1`, [id])).rows[0];
const idEvents = async (id: string) =>
  (await pool.query(`SELECT actor_id, note FROM request_events WHERE request_id = $1 AND action = 'IDENTITY_CHECKED'`, [id])).rows;

/** The check runs after the response, so wait (briefly) until it has been stored. */
async function settled(id: string) {
  for (let i = 0; i < 50; i++) {
    const row = await check(id);
    if (row.status !== 'PENDING') return row;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('identity check still PENDING');
}

describe('identity check after submission (PRD F9)', () => {
  it('stores MATCH with attempts and latency, plus an audit event by the system', async () => {
    const { id } = await submit(answers({ match: true, attempts: 2, responseMs: 812 }));
    expect(await settled(id)).toEqual({ status: 'MATCH', attempts: 2, response_ms: 812 });
    expect(await idEvents(id)).toEqual([{ actor_id: null, note: 'ID matched' }]);
  });

  it('stores NO_MATCH', async () => {
    const { id } = await submit(answers({ match: false, attempts: 1, responseMs: 300 }));
    expect(await settled(id)).toMatchObject({ status: 'NO_MATCH', attempts: 1 });
    expect(await idEvents(id)).toEqual([{ actor_id: null, note: 'ID did not match' }]);
  });

  it('ID service down: the submission still succeeds and the check is FAILED after its attempts', async () => {
    const { id } = await submit(failsWith(new AppError('UPSTREAM_UNAVAILABLE', 'down', { attempts: 3 })));
    expect(await settled(id)).toEqual({ status: 'FAILED', attempts: 3, response_ms: null });
    expect(await idEvents(id)).toEqual([{ actor_id: null, note: 'ID service not available' }]);
  });

  it('even an unexpected crash ends as FAILED, never as an error for the citizen', async () => {
    const { id } = await submit(failsWith(new Error('bug')));
    expect(await settled(id)).toMatchObject({ status: 'FAILED', attempts: 0 });
  });

  it('answers the citizen without waiting for a slow ID service', async () => {
    const neverAnswers: NidClient = { verify: () => new Promise(() => {}) };
    const started = Date.now();
    const { id } = await submit(neverAnswers);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await check(id)).toMatchObject({ status: 'PENDING' });
  });

  it('without an ID service configured, the check stays PENDING', async () => {
    const { id } = await submit(null);
    await new Promise((r) => setTimeout(r, 100));
    expect(await check(id)).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect(await idEvents(id)).toEqual([]);
  });

  it('a result is stored once: a second run changes nothing', async () => {
    const { id } = await submit(answers({ match: true, attempts: 1, responseMs: 200 }));
    await settled(id);
    await runIdentityCheck(answers({ match: false, attempts: 1, responseMs: 200 }), id, { nid: 'DEMO-7654321', name: 'Demo Applicant' });
    expect(await check(id)).toMatchObject({ status: 'MATCH' });
    expect(await idEvents(id)).toHaveLength(1);
  });

  it('staff see the result on the detail page; public tracking shows nothing about it', async () => {
    const { app, id, code } = await submit(answers({ match: false, attempts: 1, responseMs: 250 }));
    await settled(id);

    const detail = await request(app).get(`/api/v1/requests/${id}`).set('Cookie', officer);
    expect(detail.body.request.identityCheck).toEqual({ status: 'NO_MATCH', attempts: 1 });

    const tracked = await request(app).get(`/api/v1/track/${code}`);
    expect(tracked.status).toBe(200);
    expect(JSON.stringify(tracked.body)).not.toMatch(/identity|NO_MATCH|ID did not match|DEMO-7654321/i);
  });
});
