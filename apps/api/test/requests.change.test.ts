import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import type { Notifier, StatusChangedMessage } from '../src/integrations/notifier.js';
import { DEMO, kathmanduWardId, resetRequests, sessionFor } from './helpers.js';

/** A notifier that only records what it was asked to send (dependency injection in action). */
class FakeNotifier implements Notifier {
  sent: StatusChangedMessage[] = [];
  async statusChanged(message: StatusChangedMessage): Promise<void> {
    this.sent.push(message);
  }
}

const notifier = new FakeNotifier();
const app = createApp({ notifier });
const as: Record<string, string> = {};

beforeAll(async () => {
  await resetRequests();
  for (const [key, phone] of Object.entries(DEMO)) as[key] = await sessionFor(phone);
});
beforeEach(() => {
  notifier.sent = [];
});
afterAll(() => closePool());

async function newRequest(serviceTypeCode = 'LAND_BOUNDARY'): Promise<string> {
  const res = await request(app)
    .post('/api/v1/requests')
    .set('Cookie', as.citizen!)
    .send({
      serviceTypeCode,
      wardId: await kathmanduWardId(1),
      purpose: 'Needed for an official purpose',
      applicant: { name: 'Demo Applicant', nid: 'DEMO-2222222' },
      consent: true,
    });
  return res.body.request.id;
}

const move = (who: string, id: string, body: object) =>
  request(app).post(`/api/v1/requests/${id}/transitions`).set('Cookie', as[who]!).send(body);
const payFee = (who: string, id: string, version: number) =>
  request(app).post(`/api/v1/requests/${id}/fee-paid`).set('Cookie', as[who]!).send({ version });

async function row(id: string) {
  const { rows } = await pool.query(
    `SELECT r.status, r.version, r.closed_at, r.fee_paid_at, r.field_verified_at, u.email AS officer_email
     FROM service_requests r LEFT JOIN users u ON u.id = r.assigned_officer_id WHERE r.id = $1`,
    [id],
  );
  return rows[0];
}
async function events(id: string) {
  const { rows } = await pool.query(
    `SELECT action, from_status, to_status, note FROM request_events WHERE request_id = $1 ORDER BY id`,
    [id],
  );
  return rows;
}

describe('the full happy path: land boundary request from SUBMITTED to ISSUED', () => {
  it('moves step by step, bumping version, writing audit rows and notifying each status change', async () => {
    const id = await newRequest('LAND_BOUNDARY'); // fee 500, needs a field visit

    let res = await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 });
    expect(res.status).toBe(200);
    expect(res.body.request).toEqual({ id, status: 'UNDER_REVIEW', version: 1 });
    expect((await row(id)).officer_email).toBe(DEMO.officerWard1); // effect: officer assigned

    res = await payFee('officerWard1', id, 1);
    expect(res.body.request.version).toBe(2);

    res = await move('officerWard1', id, { toStatus: 'FIELD_VERIFICATION', version: 2 });
    expect(res.body.request.status).toBe('FIELD_VERIFICATION');

    res = await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 3, note: 'Boundaries checked on site' });
    expect((await row(id)).field_verified_at).not.toBeNull(); // effect: field visit recorded

    res = await move('officerWard1', id, { toStatus: 'APPROVED', version: 4 });
    expect(res.body.request.status).toBe('APPROVED');

    res = await move('officerWard1', id, { toStatus: 'ISSUED', version: 5 });
    expect(res.body.request).toEqual({ id, status: 'ISSUED', version: 6 });
    expect((await row(id)).closed_at).not.toBeNull(); // effect: closed

    expect((await events(id)).map((e) => e.action)).toEqual([
      'CREATED',
      'STATUS_CHANGED',
      'FEE_PAID',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
    ]);
    expect(notifier.sent.map((m) => m.toStatus)).toEqual([
      'UNDER_REVIEW',
      'FIELD_VERIFICATION',
      'UNDER_REVIEW',
      'APPROVED',
      'ISSUED',
    ]);
  });
});

describe('citizen moves', () => {
  it('resubmits after documents were requested, with a note, then can be cancelled', async () => {
    const id = await newRequest('RESIDENCE');
    await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 });
    await move('officerWard1', id, { toStatus: 'NEEDS_DOCUMENTS', version: 1, note: 'Bring the rental agreement' });

    const resubmit = await move('citizen', id, { toStatus: 'UNDER_REVIEW', version: 2, note: 'Brought it today' });
    expect(resubmit.status).toBe(200);
    expect((await events(id)).at(-1)).toMatchObject({ from_status: 'NEEDS_DOCUMENTS', to_status: 'UNDER_REVIEW', note: 'Brought it today' });

    const other = await newRequest('RESIDENCE');
    const cancel = await move('citizen', other, { toStatus: 'CANCELLED', version: 0 });
    expect(cancel.body.request.status).toBe('CANCELLED');
    expect((await row(other)).closed_at).not.toBeNull();
  });
});

describe('refusals (each one changes nothing)', () => {
  it('422 for a move that does not exist, and the row is untouched', async () => {
    const id = await newRequest();
    const res = await move('officerWard1', id, { toStatus: 'APPROVED', version: 0 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(await row(id)).toMatchObject({ status: 'SUBMITTED', version: 0 });
    expect(await events(id)).toHaveLength(1); // only CREATED: no audit row for a refused change
    expect(notifier.sent).toEqual([]);
  });

  it('422 for approving before the fee is paid', async () => {
    const id = await newRequest('RESIDENCE');
    await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 });
    const res = await move('officerWard1', id, { toStatus: 'APPROVED', version: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('The fee must be paid before approval');
  });

  it('400 when a required note or reason is missing', async () => {
    const id = await newRequest();
    await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 });
    expect((await move('officerWard1', id, { toStatus: 'NEEDS_DOCUMENTS', version: 1 })).status).toBe(400);
    expect((await move('officerWard1', id, { toStatus: 'REJECTED', version: 1 })).status).toBe(400);
  });

  it('403 for an officer of another ward, even with a valid move', async () => {
    const id = await newRequest();
    const res = await move('officerWard2', id, { toStatus: 'UNDER_REVIEW', version: 0 });
    expect(res.status).toBe(403);
    expect(await row(id)).toMatchObject({ status: 'SUBMITTED', version: 0 });
  });

  it('403 for palika and system admins (read-only) and for a citizen trying an officer move', async () => {
    const id = await newRequest();
    expect((await move('palikaAdmin', id, { toStatus: 'UNDER_REVIEW', version: 0 })).status).toBe(403);
    expect((await move('systemAdmin', id, { toStatus: 'UNDER_REVIEW', version: 0 })).status).toBe(403);
    expect((await move('citizen', id, { toStatus: 'UNDER_REVIEW', version: 0 })).status).toBe(403);
    expect((await payFee('palikaAdmin', id, 0)).status).toBe(403);
  });

  it('409 when the version is stale (someone changed it since you loaded it)', async () => {
    const id = await newRequest();
    await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 }); // now version 1
    const res = await move('officer2Ward1', id, { toStatus: 'REJECTED', version: 0, reason: 'Old screen' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'CONFLICT',
      message: 'This request was updated by someone else. Reload to see the latest.',
    });
    expect(await row(id)).toMatchObject({ status: 'UNDER_REVIEW', version: 1 });
  });

  it('refuses to mark a fee paid twice', async () => {
    const id = await newRequest();
    await payFee('officerWard1', id, 0);
    expect((await payFee('officerWard1', id, 1)).status).toBe(422);
  });

  it('400 for a bad body and 404 for an unknown request', async () => {
    const id = await newRequest();
    expect((await move('officerWard1', id, { toStatus: 'DONE', version: 0 })).status).toBe(400);
    expect((await move('officerWard1', id, { toStatus: 'UNDER_REVIEW' })).status).toBe(400);
    expect((await move('officerWard1', '00000000-0000-4000-8000-000000000000', { toStatus: 'UNDER_REVIEW', version: 0 })).status).toBe(404);
  });
});

/**
 * End-to-end behaviour through HTTP. Note (incident 001): the two requests don't reliably overlap,
 * so the loser's 409 usually comes from the service's early version check. The database-level
 * guard (WHERE ... AND version = $2) is proven separately, with a forced race, in locking.test.ts.
 */
describe('concurrency: two officers act at the same instant (ADR-002)', () => {
  it('exactly one wins (200) and the other gets 409, every time', async () => {
    for (let round = 0; round < 5; round++) {
      const id = await newRequest();
      await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 }); // version 1
      notifier.sent = [];

      // Both loaded version 1 and click at the same moment: one rejects, one asks for documents.
      const [a, b] = await Promise.all([
        move('officerWard1', id, { toStatus: 'REJECTED', version: 1, reason: 'Documents do not match' }),
        move('officer2Ward1', id, { toStatus: 'NEEDS_DOCUMENTS', version: 1, note: 'Bring the plot map' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const winner = a.status === 200 ? a : b;
      const r = await row(id);
      expect(r).toMatchObject({ status: winner.body.request.status, version: 2 }); // one change only
      expect((await events(id)).filter((e) => e.action === 'STATUS_CHANGED')).toHaveLength(2); // start + winner
      expect(notifier.sent).toHaveLength(1); // the loser is not notified
    }
  });
});
