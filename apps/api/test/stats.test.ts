import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { isOverdue } from '../src/domain/overdue.js';
import { DEMO, kathmanduWardId, resetRequests, sessionFor } from './helpers.js';

/**
 * A small dataset where every expected number is known in advance.
 *
 * Kathmandu district (27), Kathmandu Metropolitan City (307), ward 1:
 *   r1 RESIDENCE (1 day)     SUBMITTED     5 days ago            → open, OVERDUE
 *   r2 RESIDENCE             UNDER_REVIEW  12 hours ago          → open, not overdue
 *   r3 RESIDENCE             ISSUED        4 days ago, closed after 0.5 day → closed ON TIME
 *   r4 RESIDENCE             REJECTED      6 days ago, closed after 3 days  → closed LATE
 *   r5 LAND_BOUNDARY (3 days) SUBMITTED    2 days ago            → open, not overdue
 * Another district:
 *   r6 RESIDENCE             SUBMITTED     3 days ago            → open, OVERDUE
 *
 * Kathmandu: total 5, pending 3, overdue 1, closed 2, on-time 1/2 = 0.5, avg days (0.5 + 3) / 2 = 1.75 → 1.8
 */
const app = createApp();
let other: { wardId: number; localLevelId: number; districtId: number; provinceId: number };

beforeAll(async () => {
  await resetRequests();
  const { rows: users } = await pool.query(`SELECT id FROM users WHERE phone = $1`, [DEMO.citizen]);
  const citizenId = users[0].id;
  const ktmWard = await kathmanduWardId(1);
  const { rows: o } = await pool.query(
    `SELECT w.id AS "wardId", l.id AS "localLevelId", l.district_id AS "districtId", d.province_id AS "provinceId"
     FROM wards w JOIN local_levels l ON l.id = w.local_level_id JOIN districts d ON d.id = l.district_id
     WHERE l.district_id <> 27 ORDER BY w.id LIMIT 1`,
  );
  other = o[0];

  const insert = (n: number, service: string, status: string, submittedAgo: string, closedAfter: string | null, loc = { wardId: ktmWard, localLevelId: 307, districtId: 27, provinceId: 3 }) =>
    pool.query(
      `INSERT INTO service_requests
         (tracking_code, citizen_id, service_type_code, ward_id, local_level_id, district_id, province_id, purpose, applicant, status, submitted_at, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Stats test request', '{"name":"Demo","nid":"DEMO-0000000"}', $8,
               now() - $9::interval,
               CASE WHEN $10::interval IS NULL THEN NULL ELSE now() - $9::interval + $10::interval END)`,
      [`ST-5TAT00000${n}`, citizenId, service, loc.wardId, loc.localLevelId, loc.districtId, loc.provinceId, status, submittedAgo, closedAfter],
    );

  await insert(1, 'RESIDENCE', 'SUBMITTED', '5 days', null);
  await insert(2, 'RESIDENCE', 'UNDER_REVIEW', '12 hours', null);
  await insert(3, 'RESIDENCE', 'ISSUED', '4 days', '12 hours');
  await insert(4, 'RESIDENCE', 'REJECTED', '6 days', '3 days');
  await insert(5, 'LAND_BOUNDARY', 'SUBMITTED', '2 days', null);
  await insert(6, 'RESIDENCE', 'SUBMITTED', '3 days', null, other);
});
afterAll(() => closePool());

const map = (query: string) => request(app).get(`/api/v1/stats/map${query}`);
const area = (res: request.Response, id: number) => res.body.areas.find((a: { areaId: number }) => a.areaId === id);

describe('GET /stats/map (public)', () => {
  it('overdue per district (the default metric)', async () => {
    const res = await map('');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ level: 'district', metric: 'overdue' });
    expect(area(res, 27)).toEqual({ areaId: 27, value: 1, total: 5 });
    expect(area(res, other.districtId)).toEqual({ areaId: other.districtId, value: 1, total: 1 });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it.each([
    ['pending', 3],
    ['onTimeRate', 0.5],
    ['avgDaysToClose', 1.8],
  ])('%s for Kathmandu', async (metric, expected) => {
    expect(area(await map(`?metric=${metric}`), 27).value).toBe(expected);
  });

  it('returns null (not 0) for a rate that cannot be computed yet', async () => {
    const res = await map(`?metric=onTimeRate`);
    expect(area(res, other.districtId).value).toBeNull(); // nothing closed there yet
  });

  it('includes national totals for the home page', async () => {
    const res = await map('');
    expect(res.body.totals).toEqual({ total: 6, pending: 4, overdue: 2, closed: 2, onTimeRate: 0.5, avgDaysToClose: 1.8 });
  });

  it('filters by service type and status', async () => {
    expect(area(await map('?serviceType=LAND_BOUNDARY&metric=pending'), 27)).toEqual({ areaId: 27, value: 1, total: 1 });
    expect((await map('?status=ISSUED')).body.totals.total).toBe(1);
  });

  it('filters by submission date, with an inclusive "to"', async () => {
    // All test rows were submitted between 12 hours and 6 days ago, so these windows are certain
    // whatever the time of day.
    const daysFromToday = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    expect((await map(`?from=${daysFromToday(-30)}`)).body.totals.total).toBe(6); // everything is newer
    expect((await map(`?to=${daysFromToday(-30)}`)).body.totals.total).toBe(0); // nothing that old
    expect((await map(`?from=${daysFromToday(1)}`)).body.totals.total).toBe(0); // nothing from tomorrow
    expect((await map(`?from=${daysFromToday(-30)}&to=${daysFromToday(0)}`)).body.totals.total).toBe(6); // "to" = today counts today
  });

  it('drills down to the palikas of one district (level=local_level&parentId=district)', async () => {
    const res = await map('?level=local_level&parentId=27');
    expect(res.body.areas).toEqual([{ areaId: 307, value: 1, total: 5 }]);
  });

  it.each([['?metric=revenue'], ['?level=ward'], ['?from=yesterday'], ['?parentId=-1'], ['?from=2026-10-10&to=2026-10-01']])(
    'returns 400 for %s',
    async (q) => {
      expect((await map(q)).status).toBe(400);
    },
  );

  it('never returns individual requests or personal data', async () => {
    const body = JSON.stringify((await map('')).body);
    expect(body).not.toMatch(/ST-5TAT|Demo|DEMO-|purpose|citizen/);
  });
});

describe('SQL overdue rule = domain overdue rule', () => {
  it('counts exactly the rows that isOverdue() says are overdue', async () => {
    const now = new Date();
    const { rows } = await pool.query(
      `SELECT r.status, r.submitted_at AS "submittedAt", st.service_days AS "serviceDays", r.district_id AS "districtId"
       FROM service_requests r JOIN service_types st ON st.code = r.service_type_code`,
    );
    const byDistrict = new Map<number, number>();
    for (const r of rows) if (isOverdue(r, now)) byDistrict.set(r.districtId, (byDistrict.get(r.districtId) ?? 0) + 1);

    const res = await map('?metric=overdue');
    for (const a of res.body.areas) expect(a.value).toBe(byDistrict.get(a.areaId) ?? 0);
  });
});

describe('GET /stats/summary (staff report)', () => {
  it('palika admin gets their palika, with every ward listed (empty wards as 0)', async () => {
    const res = await request(app).get('/api/v1/stats/summary').set('Cookie', await sessionFor(DEMO.palikaAdmin));
    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ kind: 'palika', localLevelId: 307 });
    expect(res.body.totals).toMatchObject({ total: 5, pending: 3, overdue: 1, onTimeRate: 0.5 });
    expect(res.body.byArea).toHaveLength(32); // all 32 wards of Kathmandu, even those with no requests
    expect(res.body.byArea[0]).toMatchObject({ label: 'Ward 1', pending: 3, overdue: 1 });
    expect(res.body.byArea[1]).toMatchObject({ label: 'Ward 2', pending: 0, overdue: 0 });
    expect(res.body.byServiceType).toEqual([
      { code: 'LAND_BOUNDARY', count: 1 },
      { code: 'RESIDENCE', count: 4 },
    ]);
  });

  it('system admin gets Nepal, by province', async () => {
    const res = await request(app).get('/api/v1/stats/summary').set('Cookie', await sessionFor(DEMO.systemAdmin));
    expect(res.body.scope).toEqual({ kind: 'national' });
    expect(res.body.totals.total).toBe(6);
    expect(res.body.byArea).toHaveLength(7);
  });

  it('is refused to officers and citizens (403) and anonymous users (401)', async () => {
    expect((await request(app).get('/api/v1/stats/summary').set('Cookie', await sessionFor(DEMO.officerWard1))).status).toBe(403);
    expect((await request(app).get('/api/v1/stats/summary').set('Cookie', await sessionFor(DEMO.citizen))).status).toBe(403);
    expect((await request(app).get('/api/v1/stats/summary')).status).toBe(401);
  });
});
