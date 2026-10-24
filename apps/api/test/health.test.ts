import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool } from '../src/db/pool.js';

// Integration test: real Express app + real Postgres (the test database), no mocks.
const app = createApp();

afterAll(async () => {
  // Close DB connections so Vitest can exit cleanly.
  await closePool();
});

describe('GET /api/v1/health', () => {
  it('returns 200 with db "up" when Postgres is reachable', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(res.body.version).toEqual(expect.any(String));
  });

  it('sets an X-Request-Id header on every response', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error format', () => {
  it('unknown route returns 404 in the standard error shape', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String), details: {} },
      requestId: res.headers['x-request-id'],
    });
  });

  it('broken JSON body returns 400 VALIDATION_ERROR, not 500', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"bad json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('body over 100 KB returns 400, not 500', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(110_000) }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Request body is too large' });
  });

  // Security: compressed bodies are refused BEFORE any decompression happens, so attacker
  // data never reaches the Brotli/gzip decoders (see CVE-2026-111497).
  it.each(['br', 'gzip', 'deflate'])('refuses a %s-compressed body with 400', async (encoding) => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', encoding)
      .send('not really compressed');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Compressed request bodies are not accepted',
    });
  });
});
