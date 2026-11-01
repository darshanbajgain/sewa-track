import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { DEMO, kathmanduWardId, sessionFor } from './helpers.js';

/**
 * Accounts (PRD F3, F14): citizen sign-up, and staff user management by the system admin.
 * Every account made here uses a "test-…@example.com" email and is deleted afterwards.
 */
const uniqueEmail = (label: string) => `test-${label}-${randomUUID().slice(0, 8)}@example.com`;
const cookieOf = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sewa_session='))!.split(';')[0]!;

let admin: string;
let officer: string;
let citizen: string;
let ward1: number;

beforeAll(async () => {
  admin = await sessionFor(DEMO.systemAdmin);
  officer = await sessionFor(DEMO.officerWard1);
  citizen = await sessionFor(DEMO.citizen);
  ward1 = await kathmanduWardId(1);
});
afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'test-%@example.com'`);
  await closePool();
});

describe('POST /auth/register (citizen sign-up)', () => {
  const app = createApp(); // own rate-limit counter

  it('creates a CITIZEN, logs them in (cookie) and never returns the hash', async () => {
    const email = uniqueEmail('signup');
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Sita Demo', email, password: 'long-enough-1' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'CITIZEN', name: 'Sita Demo', email, wardId: null, localLevelId: null });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookieOf(res));
    expect(me.body.user.email).toBe(email);
  });

  it('ignores a "role" in the body: nobody can sign themselves up as staff', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Sneaky Demo', email: uniqueEmail('sneaky'), password: 'long-enough-1', role: 'SYSTEM_ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CITIZEN');
  });

  it('accepts only @example.com addresses (demo rule: no real emails stored)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Real Person', email: 'someone@gmail.com', password: 'long-enough-1' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].path).toBe('email');
  });

  it('stores the email lowercase and refuses the same address twice (409)', async () => {
    const email = uniqueEmail('twice');
    const first = await request(app).post('/api/v1/auth/register').send({ name: 'First Demo', email: email.toUpperCase(), password: 'long-enough-1' });
    expect(first.body.user.email).toBe(email);

    const second = await request(app).post('/api/v1/auth/register').send({ name: 'Second Demo', email, password: 'long-enough-1' });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: 'CONFLICT', details: { field: 'email' } });
  });

  it('is rate limited (5 per minute)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Sixth Demo', email: uniqueEmail('six'), password: 'long-enough-1' });
    expect(res.status).toBe(429);
  });

  it('rejects a short password', async () => {
    const res = await request(createApp()).post('/api/v1/auth/register').send({ name: 'Short Demo', email: uniqueEmail('short'), password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].path).toBe('password');
  });
});

describe('/admin/users: only the system admin', () => {
  const app = createApp();

  it.each([
    ['nobody', () => '', 401],
    ['a citizen', () => citizen, 403],
    ['a ward officer', () => officer, 403],
  ])('%s gets %i', async (_who, cookie, status) => {
    const list = await request(app).get('/api/v1/admin/users').set('Cookie', cookie());
    const create = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', cookie())
      .send({ role: 'WARD_OFFICER', name: 'X Demo', email: uniqueEmail('x'), password: 'long-enough-1', wardId: ward1 });
    expect(list.status).toBe(status);
    expect(create.status).toBe(status);
  });

  it('the palika admin also gets 403 (only the SYSTEM admin manages accounts)', async () => {
    const res = await request(app).get('/api/v1/admin/users').set('Cookie', await sessionFor(DEMO.palikaAdmin));
    expect(res.status).toBe(403);
  });
});

describe('creating staff accounts', () => {
  const app = createApp();

  it('creates a ward officer who can log in and sees their ward', async () => {
    const email = uniqueEmail('officer');
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', admin)
      .send({ role: 'WARD_OFFICER', name: 'New Officer (Demo)', email, password: 'long-enough-1', wardId: ward1 });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'WARD_OFFICER', email, wardId: ward1, localLevelId: null, isActive: true });

    // created_by records which admin made the account
    const { rows } = await pool.query(`SELECT a.email FROM users u JOIN users a ON a.id = u.created_by WHERE u.email = $1`, [email]);
    expect(rows[0].email).toBe(DEMO.systemAdmin);

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'long-enough-1' });
    expect(login.status).toBe(200);
    const queue = await request(app).get('/api/v1/requests').set('Cookie', cookieOf(login));
    expect(queue.status).toBe(200);
  });

  it('creates a palika admin with a palika', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', admin)
      .send({ role: 'PALIKA_ADMIN', name: 'New Palika Admin (Demo)', email: uniqueEmail('palika'), password: 'long-enough-1', localLevelId: 307 });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'PALIKA_ADMIN', localLevelId: 307, wardId: null });
  });

  it('needs the scope that matches the role (officer without wardId → 400)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', admin)
      .send({ role: 'WARD_OFFICER', name: 'No Ward (Demo)', email: uniqueEmail('noward'), password: 'long-enough-1', localLevelId: 307 });
    expect(res.status).toBe(400);
  });

  it('cannot create citizens or system admins here', async () => {
    for (const role of ['CITIZEN', 'SYSTEM_ADMIN']) {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Cookie', admin)
        .send({ role, name: 'Nope Demo', email: uniqueEmail('nope'), password: 'long-enough-1' });
      expect(res.status).toBe(400);
    }
  });

  it('unknown ward → 400; email taken → 409', async () => {
    const unknown = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', admin)
      .send({ role: 'WARD_OFFICER', name: 'Lost Demo', email: uniqueEmail('lost'), password: 'long-enough-1', wardId: 999_999 });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details.field).toBe('wardId');

    const taken = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', admin)
      .send({ role: 'WARD_OFFICER', name: 'Copy Demo', email: DEMO.officerWard1, password: 'long-enough-1', wardId: ward1 });
    expect(taken.status).toBe(409);
  });
});

describe('listing users', () => {
  const app = createApp();

  it('pages, filters by role and searches name/email; never returns hashes', async () => {
    const res = await request(app).get('/api/v1/admin/users?role=WARD_OFFICER&q=ward1').set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20 });
    expect(res.body.items.every((u: { role: string }) => u.role === 'WARD_OFFICER')).toBe(true);
    const demoOfficer = res.body.items.find((u: { email: string }) => u.email === DEMO.officerWard1);
    expect(demoOfficer).toMatchObject({ wardNumber: 1, palikaNameEn: 'Kathmandu', isActive: true });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('rejects an unknown role filter', async () => {
    const res = await request(app).get('/api/v1/admin/users?role=KING').set('Cookie', admin);
    expect(res.status).toBe(400);
  });
});

describe('deactivating an account', () => {
  const app = createApp();

  it('blocks login (403) AND ends the current session at once (401); reactivating restores access', async () => {
    const email = uniqueEmail('leaver');
    const created = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', admin)
      .send({ role: 'WARD_OFFICER', name: 'Leaving Officer (Demo)', email, password: 'long-enough-1', wardId: ward1 });
    const id = created.body.user.id as string;
    const session = cookieOf(await request(app).post('/api/v1/auth/login').send({ email, password: 'long-enough-1' }));

    const off = await request(app).patch(`/api/v1/admin/users/${id}`).set('Cookie', admin).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.user.isActive).toBe(false);

    expect((await request(app).get('/api/v1/requests').set('Cookie', session)).status).toBe(401); // old token, dead account
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'long-enough-1' });
    expect(login.status).toBe(403);

    await request(app).patch(`/api/v1/admin/users/${id}`).set('Cookie', admin).send({ isActive: true });
    expect((await request(app).get('/api/v1/requests').set('Cookie', session)).status).toBe(200);
  });

  it('cannot deactivate a system admin; unknown id → 404; bad id → 400', async () => {
    const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [DEMO.systemAdmin]);
    const self = await request(app).patch(`/api/v1/admin/users/${rows[0].id}`).set('Cookie', admin).send({ isActive: false });
    expect(self.status).toBe(403);

    const unknown = await request(app).patch(`/api/v1/admin/users/${randomUUID()}`).set('Cookie', admin).send({ isActive: false });
    expect(unknown.status).toBe(404);

    const bad = await request(app).patch('/api/v1/admin/users/not-a-uuid').set('Cookie', admin).send({ isActive: false });
    expect(bad.status).toBe(400);
  });
});
