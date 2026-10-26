import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { DEMO, kathmanduWardId, resetRequests, sessionFor } from './helpers.js';

/**
 * Staff queue + request detail. Setup (all in Kathmandu Metropolitan City):
 *   ward 1: RESIDENCE (backdated 5 days → overdue) and LAND_BOUNDARY
 *   ward 2: DATE_OF_BIRTH
 */
const app = createApp();
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

async function submit(cookie: string, serviceTypeCode: string, wardId: number) {
  const res = await request(app)
    .post('/api/v1/requests')
    .set('Cookie', cookie)
    .send({ serviceTypeCode, wardId, purpose: 'Needed for an official purpose', applicant: { name: 'Demo Applicant', nid: 'DEMO-1111111' }, consent: true });
  return res.body.request.id as string;
}

beforeAll(async () => {
  await resetRequests();
  for (const [key, phone] of Object.entries(DEMO)) cookies[key] = await sessionFor(phone);
  const ward1 = await kathmanduWardId(1);
  const ward2 = await kathmanduWardId(2);

  ids.residence = await submit(cookies.citizen!, 'RESIDENCE', ward1);
  ids.land = await submit(cookies.citizen!, 'LAND_BOUNDARY', ward1);
  ids.birth = await submit(cookies.citizen!, 'DATE_OF_BIRTH', ward2);

  // Make the residence request 5 days old: its 1-day promise is long broken → overdue.
  await pool.query(`UPDATE service_requests SET submitted_at = now() - interval '5 days' WHERE id = $1`, [ids.residence]);
});
afterAll(() => closePool());

const queue = (who: string, query = '') => request(app).get(`/api/v1/requests${query}`).set('Cookie', cookies[who]!);
const codesOf = (res: request.Response) => res.body.items.map((i: { id: string }) => i.id);

describe('GET /requests: scope (who sees what)', () => {
  it("ward 1 officer sees only ward 1's requests", async () => {
    const res = await queue('officerWard1');
    expect(res.status).toBe(200);
    expect(codesOf(res).sort()).toEqual([ids.residence, ids.land].sort());
  });

  it("ward 2 officer sees only ward 2's request", async () => {
    expect(codesOf(await queue('officerWard2'))).toEqual([ids.birth]);
  });

  it('palika admin and system admin see all three', async () => {
    expect((await queue('palikaAdmin')).body.total).toBe(3);
    expect((await queue('systemAdmin')).body.total).toBe(3);
  });

  it('citizens have no queue (403); anonymous users get 401', async () => {
    expect((await queue('citizen')).status).toBe(403);
    expect((await request(app).get('/api/v1/requests')).status).toBe(401);
  });

  it('ignores any attempt to pick another ward through the query string', async () => {
    const res = await queue('officerWard1', '?wardId=99999&localLevelId=1');
    expect(codesOf(res).sort()).toEqual([ids.residence, ids.land].sort()); // unknown params don't widen scope
  });
});

describe('GET /requests: filters, order, pagination', () => {
  it('lists oldest first', async () => {
    const res = await queue('palikaAdmin');
    expect(res.body.items[0].id).toBe(ids.residence); // the backdated one
  });

  it('filters by service type and status', async () => {
    expect(codesOf(await queue('palikaAdmin', '?serviceType=LAND_BOUNDARY'))).toEqual([ids.land]);
    expect((await queue('palikaAdmin', '?status=SUBMITTED')).body.total).toBe(3);
    expect((await queue('palikaAdmin', '?status=APPROVED')).body.total).toBe(0);
  });

  it('filters by overdue, using the same rule as the domain', async () => {
    const overdue = await queue('palikaAdmin', '?overdue=true');
    expect(codesOf(overdue)).toEqual([ids.residence]);
    expect(overdue.body.items[0].overdue).toBe(true);
    expect((await queue('palikaAdmin', '?overdue=false')).body.total).toBe(2);
  });

  it('pages 20 at a time and reports the total', async () => {
    // Add 21 more requests to ward 1 directly (fast), then read page 1 and 2.
    const { rows } = await pool.query(`SELECT id FROM users WHERE phone = $1`, [DEMO.citizen]);
    await pool.query(
      `INSERT INTO service_requests (tracking_code, citizen_id, service_type_code, ward_id, local_level_id, district_id, province_id, purpose, applicant)
       SELECT 'ST-9' || lpad(n::text, 9, '0'), $1, 'RESIDENCE', $2, 307, 27, 3, 'Bulk demo request', '{"name":"Demo","nid":"DEMO-0000000"}'
       FROM generate_series(1, 21) AS n`,
      [rows[0].id, await kathmanduWardId(1)],
    );

    const page1 = await queue('officerWard1', '?page=1');
    const page2 = await queue('officerWard1', '?page=2');
    expect(page1.body).toMatchObject({ page: 1, pageSize: 20, total: 23 });
    expect(page1.body.items).toHaveLength(20);
    expect(page2.body.items).toHaveLength(3);
    const all = [...codesOf(page1), ...codesOf(page2)];
    expect(new Set(all).size).toBe(23); // no row twice, none missing
  });

  it.each([['?status=DONE'], ['?serviceType=PASSPORT'], ['?overdue=yes'], ['?page=0']])('returns 400 for %s', async (q) => {
    const res = await queue('officerWard1', q);
    expect(res.status).toBe(400);
  });
});

describe('GET /requests/:id: detail and scope', () => {
  it('shows ward 1 officer the full detail, history and the actions they may take', async () => {
    const res = await request(app).get(`/api/v1/requests/${ids.land}`).set('Cookie', cookies.officerWard1!);

    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({
      id: ids.land,
      status: 'SUBMITTED',
      version: 0,
      service: { code: 'LAND_BOUNDARY', feeNpr: 500, requiresFieldVerification: true },
      location: { wardNumber: 1, palikaNameEn: 'Kathmandu', districtNameEn: 'Kathmandu' },
      applicant: { name: 'Demo Applicant', nid: 'DEMO-1111111' },
      assignedOfficer: null,
      identityCheck: { status: 'PENDING', attempts: 0 },
      allowedTransitions: ['UNDER_REVIEW'], // an officer can start the review (cancel is for the citizen)
      canMarkFeePaid: true,
    });
    expect(res.body.request.events).toEqual([
      expect.objectContaining({ action: 'CREATED', toStatus: 'SUBMITTED', actorName: 'Citizen (Demo)' }),
    ]);
  });

  it("forbids an officer from another ward (403): the PRD's ward-scoping rule", async () => {
    const res = await request(app).get(`/api/v1/requests/${ids.land}`).set('Cookie', cookies.officerWard2!);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets the owner citizen see it, with only the citizen action (cancel)', async () => {
    const res = await request(app).get(`/api/v1/requests/${ids.land}`).set('Cookie', cookies.citizen!);
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ allowedTransitions: ['CANCELLED'], canMarkFeePaid: false });
  });

  it('forbids a different citizen (403)', async () => {
    await pool.query(
      `INSERT INTO users (role, name, phone, password_hash) VALUES ('CITIZEN', 'Other Citizen (Demo)', '9000000098', 'x')
       ON CONFLICT (phone) DO NOTHING`,
    );
    const other = await sessionFor('9000000098');
    const res = await request(app).get(`/api/v1/requests/${ids.land}`).set('Cookie', other);
    expect(res.status).toBe(403);
  });

  it('palika admin can read it but gets no status buttons (read + reassign only)', async () => {
    const res = await request(app).get(`/api/v1/requests/${ids.land}`).set('Cookie', cookies.palikaAdmin!);
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ allowedTransitions: [], canMarkFeePaid: false });
  });

  it('marks the backdated request as overdue', async () => {
    const res = await request(app).get(`/api/v1/requests/${ids.residence}`).set('Cookie', cookies.officerWard1!);
    expect(res.body.request.overdue).toBe(true);
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    expect((await request(app).get('/api/v1/requests/abc').set('Cookie', cookies.officerWard1!)).status).toBe(400);
    const unknown = await request(app)
      .get('/api/v1/requests/00000000-0000-4000-8000-000000000000')
      .set('Cookie', cookies.officerWard1!);
    expect(unknown.status).toBe(404);
  });
});
