import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { closePool } from '../src/db/pool.js';

// Tests run without PROXY_SECRET (check off). Here we turn it on for one app instance:
// createApp() reads env when it builds the app, so the other test files are not affected.
const SECRET = 'test-proxy-secret-0123456789-abcdefghij';
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  env.PROXY_SECRET = SECRET;
  app = createApp();
});

afterAll(async () => {
  env.PROXY_SECRET = undefined;
  await closePool();
});

describe('PROXY_SECRET: the website is the only way in', () => {
  it('refuses a direct request without the header with 403 in the standard error shape', async () => {
    const res = await request(app).get('/api/v1/service-types');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('refuses a wrong secret', async () => {
    const res = await request(app).get('/api/v1/service-types').set('x-proxy-secret', 'wrong');

    expect(res.status).toBe(403);
  });

  it('refuses a direct login before checking the password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'citizen@example.com', password: 'demo1234' });

    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('lets a request with the right secret through', async () => {
    const res = await request(app).get('/api/v1/service-types').set('x-proxy-secret', SECRET);

    expect(res.status).toBe(200);
  });

  // The platform health check and the keep-awake pinger don't go through the website.
  it.each(['/api/v1/live', '/api/v1/health'])('leaves %s open', async (path) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(200);
  });
});
