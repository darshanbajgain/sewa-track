import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { withTransaction } from '../src/db/transaction.js';
import { insertRequest } from '../src/repositories/request.repository.js';
import { DEMO, kathmanduWardId, loginAs, resetRequests } from './helpers.js';

const app = createApp();
let citizen: string; // session cookie
let ward1: number;

beforeAll(async () => {
  await resetRequests();
  citizen = await loginAs(app, DEMO.citizen);
  ward1 = await kathmanduWardId(1);
});
afterAll(() => closePool());

const validBody = () => ({
  serviceTypeCode: 'RESIDENCE',
  wardId: ward1,
  purpose: 'Needed to open a bank account',
  applicant: { name: 'Demo Applicant', nid: 'DEMO-1234567' },
  consent: true,
});

describe('POST /requests (submit)', () => {
  it('creates the request, its CREATED audit event and a PENDING identity check', async () => {
    const res = await request(app).post('/api/v1/requests').set('Cookie', citizen).send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({ status: 'SUBMITTED', trackingCode: expect.stringMatching(/^ST-[0-9A-HJKMNP-TV-Z]{10}$/) });
    const id = res.body.request.id;

    // The location ids were copied from the ward (ADR-001): Kathmandu Ward 1 → palika 307 → its district/province.
    const { rows: saved } = await pool.query(
      `SELECT r.ward_id, r.local_level_id, r.district_id, r.province_id, r.version, d.name_en AS district
       FROM service_requests r JOIN districts d ON d.id = r.district_id WHERE r.id = $1`,
      [id],
    );
    expect(saved[0]).toMatchObject({ ward_id: ward1, local_level_id: 307, district: 'Kathmandu', province_id: 3, version: 0 });

    // Audit row written in the same transaction (AGENTS §6).
    const { rows: events } = await pool.query(`SELECT action, to_status, actor_id FROM request_events WHERE request_id = $1`, [id]);
    expect(events).toEqual([{ action: 'CREATED', to_status: 'SUBMITTED', actor_id: expect.any(String) }]);

    const { rows: checks } = await pool.query(`SELECT status FROM identity_checks WHERE request_id = $1`, [id]);
    expect(checks).toEqual([{ status: 'PENDING' }]);
  });

  it('gives every request a different tracking code', async () => {
    const a = await request(app).post('/api/v1/requests').set('Cookie', citizen).send(validBody());
    const b = await request(app).post('/api/v1/requests').set('Cookie', citizen).send(validBody());
    expect(a.body.request.trackingCode).not.toBe(b.body.request.trackingCode);
  });

  it('requires login (401) and the citizen role (403)', async () => {
    const anonymous = await request(app).post('/api/v1/requests').send(validBody());
    expect(anonymous.status).toBe(401);

    const officer = await loginAs(app, DEMO.officerWard1);
    const asOfficer = await request(app).post('/api/v1/requests').set('Cookie', officer).send(validBody());
    expect(asOfficer.status).toBe(403);
  });

  it.each([
    ['purpose too short', { purpose: 'short' }, 'purpose'],
    ['real-looking ID instead of DEMO-', { applicant: { name: 'Demo Applicant', nid: '12-01-75-12345' } }, 'applicant.nid'],
    ['consent not given', { consent: false }, 'consent'],
    ['unknown service', { serviceTypeCode: 'PASSPORT' }, 'serviceTypeCode'],
  ])('rejects %s with 400', async (_label, override, field) => {
    const res = await request(app).post('/api/v1/requests').set('Cookie', citizen).send({ ...validBody(), ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues.map((i: { path: string }) => i.path)).toContain(field);
  });

  it('returns 404 for a ward that does not exist', async () => {
    const res = await request(app).post('/api/v1/requests').set('Cookie', citizen).send({ ...validBody(), wardId: 99_999_999 });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Ward not found');
  });

  it('never writes applicant details to the response beyond what the citizen sent', async () => {
    const res = await request(app).post('/api/v1/requests').set('Cookie', citizen).send(validBody());
    expect(Object.keys(res.body.request).sort()).toEqual(['id', 'status', 'submittedAt', 'trackingCode']);
  });
});

describe('transactions: all or nothing', () => {
  it('rolls back the request if a later step in the same transaction fails', async () => {
    const trackingCode = 'ST-RBACK00000'; // valid format (no I, L, O, U), so only our simulated failure can stop it
    const { rows: users } = await pool.query(`SELECT id FROM users WHERE email = $1`, [DEMO.citizen]);

    await expect(
      withTransaction(async (client) => {
        await insertRequest(client, {
          trackingCode,
          citizenId: users[0].id,
          input: validBody() as never,
          location: { wardId: ward1, localLevelId: 307, districtId: 27, provinceId: 3 },
        });
        throw new Error('audit insert failed'); // simulate the audit write failing
      }),
    ).rejects.toThrow('audit insert failed');

    const { rows } = await pool.query(`SELECT 1 FROM service_requests WHERE tracking_code = $1`, [trackingCode]);
    expect(rows).toHaveLength(0); // the request was NOT saved
  });
});

describe('GET /requests/mine', () => {
  it("lists only the citizen's own requests, newest first, with an overdue flag", async () => {
    // A request that belongs to someone else must not appear.
    const { rows: other } = await pool.query(
      `INSERT INTO users (role, name, email, phone, password_hash) VALUES ('CITIZEN', 'Other Citizen (Demo)', 'user-9000000099@example.com', '9000000099', 'x')
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    await pool.query(
      `INSERT INTO service_requests (tracking_code, citizen_id, service_type_code, ward_id, local_level_id, district_id, province_id, purpose, applicant)
       VALUES ('ST-0THER00000', $1, 'RESIDENCE', $2, 307, 27, 3, 'Someone else request', '{}')`,
      [other[0].id, ward1],
    );

    const res = await request(app).get('/api/v1/requests/mine').set('Cookie', citizen);

    expect(res.status).toBe(200);
    const codes = res.body.requests.map((r: { trackingCode: string }) => r.trackingCode);
    expect(codes).not.toContain('ST-0THER00000');
    expect(res.body.requests.length).toBeGreaterThan(0);
    expect(res.body.requests[0]).toMatchObject({ status: 'SUBMITTED', overdue: false, closedAt: null });
    const times = res.body.requests.map((r: { submittedAt: string }) => r.submittedAt);
    expect([...times].sort().reverse()).toEqual(times); // newest first
  });

  it('is citizen-only (403 for an officer)', async () => {
    const officer = await loginAs(app, DEMO.officerWard1);
    const res = await request(app).get('/api/v1/requests/mine').set('Cookie', officer);
    expect(res.status).toBe(403);
  });
});
