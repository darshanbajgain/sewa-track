import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool } from '../src/db/pool.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestId } from '../src/middleware/requestId.js';
import { signSessionToken } from '../src/security/token.js';

/**
 * Integration tests for login / logout / me, against the seeded demo users in the test DB.
 * Each `describe` builds its own app, so the login rate-limit counter starts fresh.
 */
afterAll(() => closePool());

const CITIZEN = { phone: '9000000001', password: 'demo1234' };

/** Pulls the "sewa_session=..." part out of the Set-Cookie response header. */
function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const found = cookies.find((c) => c.startsWith('sewa_session='));
  if (!found) throw new Error('no session cookie');
  return found;
}

describe('POST /auth/login', () => {
  const app = createApp();

  it('logs in a demo citizen and sets a protected cookie (token NOT in the body)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(CITIZEN);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'CITIZEN', name: 'Citizen (Demo)', wardId: null, localLevelId: null });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|token/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=28800/); // 8 hours
  });

  it('returns the same 401 message for a wrong password and an unknown phone (no user enumeration)', async () => {
    const wrongPassword = await request(app).post('/api/v1/auth/login').send({ ...CITIZEN, password: 'nope' });
    const unknownPhone = await request(app).post('/api/v1/auth/login').send({ phone: '9000099999', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownPhone.status).toBe(401);
    expect(wrongPassword.body.error).toEqual(unknownPhone.body.error);
    expect(wrongPassword.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an invalid body with 400 and field details', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ phone: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['phone', 'password']),
    );
  });
});

describe('login rate limit', () => {
  const app = createApp();

  it('allows 5 attempts per minute, then answers 429 RATE_LIMITED', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/auth/login').send({ ...CITIZEN, password: 'wrong' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post('/api/v1/auth/login').send(CITIZEN); // even the right password
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('GET /auth/me and logout', () => {
  const app = createApp();

  it('returns 401 without a cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the logged-in user with the cookie', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ phone: '9000000002', password: 'demo1234' });
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', sessionCookie(login));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'WARD_OFFICER', localLevelId: null });
    expect(res.body.user.wardId).toEqual(expect.any(Number));
  });

  it('rejects a token whose payload was changed (e.g. role → SYSTEM_ADMIN)', async () => {
    const login = await request(app).post('/api/v1/auth/login').send(CITIZEN);
    const token = sessionCookie(login).split(';')[0]!.split('=')[1]!;
    const [header, payload, signature] = token.split('.');
    const forged = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    forged.role = 'SYSTEM_ADMIN';
    const tampered = [header, Buffer.from(JSON.stringify(forged)).toString('base64url'), signature].join('.');

    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `sewa_session=${tampered}`);
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned token (alg "none" attack)', async () => {
    const unsigned = jwt.sign({ role: 'SYSTEM_ADMIN', wardId: null, localLevelId: null }, '', {
      algorithm: 'none',
      subject: '00000000-0000-4000-8000-000000000000',
    });
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `sewa_session=${unsigned}`);
    expect(res.status).toBe(401);
  });

  it('an EXPIRED token gets 401 and the browser is told to delete the cookie', async () => {
    const { rows } = await (await import('../src/db/pool.js')).pool.query(`SELECT id FROM users WHERE phone = '9000000002'`);
    const expired = jwt.sign(
      { role: 'WARD_OFFICER', wardId: 1, localLevelId: null, exp: Math.floor(Date.now() / 1000) - 60 }, // ended a minute ago
      'test-only-secret-0123456789-abcdefghijklmnop',
      { algorithm: 'HS256', subject: rows[0].id },
    );
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `sewa_session=${expired}`);
    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toMatch(/sewa_session=;|Expires=Thu, 01 Jan 1970/);
  });

  it('a missing cookie gets 401 without any Set-Cookie (nothing to clear)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/sewa_session=;|Expires=Thu, 01 Jan 1970/);
  });
});

describe('requireRole (authorization by role)', () => {
  // A tiny app with one admin-only route, to test the middleware on its own.
  const app = express();
  app.use(requestId);
  app.get('/admin-only', requireAuth, requireRole('SYSTEM_ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const tokenFor = (role: 'CITIZEN' | 'SYSTEM_ADMIN') =>
    `sewa_session=${signSessionToken({ id: '00000000-0000-4000-8000-000000000001', role, wardId: null, localLevelId: null })}`;

  it('lets the right role through', async () => {
    const res = await request(app).get('/admin-only').set('Cookie', tokenFor('SYSTEM_ADMIN'));
    expect(res.status).toBe(200);
  });

  it('answers 403 for a logged-in user with the wrong role', async () => {
    const res = await request(app).get('/admin-only').set('Cookie', tokenFor('CITIZEN'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 401 (not 403) when nobody is logged in', async () => {
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(401);
  });
});
