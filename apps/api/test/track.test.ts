import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { DEMO, kathmanduWardId, loginAs, resetRequests } from './helpers.js';

const app = createApp();
afterAll(() => closePool());

// Recognizable "private" values. The test checks that NONE of them appear in the public response.
const SECRET = {
  applicantName: 'Ram Bahadur Leaktest',
  nid: 'DEMO-7654321',
  purpose: 'Private purpose text that must never be public',
  officerNote: 'Internal officer note: check land papers',
};

let trackingCode: string;
let requestId: string;
let citizenId: string;

beforeAll(async () => {
  await resetRequests();
  const citizen = await loginAs(app, DEMO.citizen);
  const created = await request(app)
    .post('/api/v1/requests')
    .set('Cookie', citizen)
    .send({
      serviceTypeCode: 'LAND_BOUNDARY',
      wardId: await kathmanduWardId(1),
      purpose: SECRET.purpose,
      applicant: { name: SECRET.applicantName, nid: SECRET.nid },
      consent: true,
    });
  trackingCode = created.body.request.trackingCode;
  requestId = created.body.request.id;

  // Simulate an officer starting the review (with a private note) and recording a fee payment.
  // (The real status-change endpoint arrives in P5.4; here we only need history to exist.)
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [DEMO.officerWard1]);
  const officerId = rows[0].id;
  const { rows: owner } = await pool.query(`SELECT citizen_id FROM service_requests WHERE id = $1`, [requestId]);
  citizenId = owner[0].citizen_id;
  await pool.query(`UPDATE service_requests SET status = 'UNDER_REVIEW', assigned_officer_id = $2 WHERE id = $1`, [
    requestId,
    officerId,
  ]);
  await pool.query(
    `INSERT INTO request_events (request_id, actor_id, action, from_status, to_status, note)
     VALUES ($1, $2, 'STATUS_CHANGED', 'SUBMITTED', 'UNDER_REVIEW', $3),
            ($1, $2, 'FEE_PAID', NULL, NULL, NULL)`,
    [requestId, officerId, SECRET.officerNote],
  );
});

describe('GET /track/:trackingCode', () => {
  it('returns exactly the public fields from PRD F5', async () => {
    const res = await request(app).get(`/api/v1/track/${trackingCode}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.tracking).sort()).toEqual(
      ['palika', 'overdue', 'service', 'status', 'submittedAt', 'timeline', 'trackingCode', 'updatedAt', 'ward'].sort(),
    );
    expect(res.body.tracking).toMatchObject({
      trackingCode,
      service: { code: 'LAND_BOUNDARY', nameEn: 'Land boundary (four-sides) verification', nameNe: 'चार किल्ला प्रमाणित' },
      ward: { number: 1 },
      palika: { nameEn: 'Kathmandu' },
      status: 'UNDER_REVIEW',
      overdue: false,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('shows the status timeline in order, without notes, actors, or non-status events', async () => {
    const res = await request(app).get(`/api/v1/track/${trackingCode}`);
    expect(res.body.tracking.timeline.map((e: { status: string }) => e.status)).toEqual(['SUBMITTED', 'UNDER_REVIEW']);
    for (const entry of res.body.tracking.timeline) {
      expect(Object.keys(entry).sort()).toEqual(['at', 'status']);
    }
  });

  it('leaks NO personal or internal data (PRD F5, hard rule 5)', async () => {
    const res = await request(app).get(`/api/v1/track/${trackingCode}`);
    const body = JSON.stringify(res.body);

    for (const secret of [...Object.values(SECRET), requestId, citizenId, 'Ward Officer', 'applicant', 'purpose', 'note']) {
      expect(body).not.toContain(secret);
    }
  });

  it('accepts a code typed in lowercase with spaces and look-alike letters', async () => {
    const messy = ` ${trackingCode.toLowerCase().replace(/0/g, 'o')} `;
    const res = await request(app).get(`/api/v1/track/${encodeURIComponent(messy)}`);
    expect(res.status).toBe(200);
    expect(res.body.tracking.trackingCode).toBe(trackingCode);
  });

  it('returns 400 for a malformed code, before touching the database', async () => {
    const res = await request(app).get('/api/v1/track/not-a-code');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for a well-formed code that does not exist', async () => {
    const res = await request(app).get('/api/v1/track/ST-0000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('tracking rate limit', () => {
  it('allows 10 lookups per minute per IP, then 429', async () => {
    const limited = createApp(); // fresh counter
    for (let i = 0; i < 10; i++) {
      expect((await request(limited).get('/api/v1/track/ST-0000000000')).status).toBe(404);
    }
    const blocked = await request(limited).get(`/api/v1/track/${trackingCode}`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
