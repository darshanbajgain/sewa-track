import { nidVerifyResponseSchema } from '@sewa/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createMockApp } from './app.js';

const VALID = { nid: 'DEMO-1234567', name: 'Demo Person' };
const noWait = async () => {};
/** `random` is called twice per request: first for the latency, then for "does it fail?". */
const healthy = () => 0.5;

describe('POST /verify', () => {
  it('answers in the shape the contract promises (contract test)', async () => {
    const res = await request(createMockApp({ random: healthy, wait: noWait })).post('/verify').send(VALID);
    expect(res.status).toBe(200);
    expect(nidVerifyResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toEqual({ match: true });
  });

  it('never matches a demo ID ending in 0', async () => {
    const res = await request(createMockApp({ random: healthy, wait: noWait }))
      .post('/verify')
      .send({ ...VALID, nid: 'DEMO-1234560' });
    expect(res.body).toEqual({ match: false });
  });

  it('fails with 503 when the dice say so, and only then', async () => {
    const answerWith = (failureRoll: number) => {
      const random = vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(failureRoll);
      return request(createMockApp({ random, wait: noWait })).post('/verify').send(VALID);
    };
    expect((await answerWith(0.09)).status).toBe(503);
    expect((await answerWith(0.1)).status).toBe(200);
  });

  it('waits between 100 and 1500 ms', async () => {
    const waitedFor = async (latencyRoll: number) => {
      const wait = vi.fn(noWait);
      const random = vi.fn().mockReturnValueOnce(latencyRoll).mockReturnValueOnce(0.5);
      await request(createMockApp({ random, wait })).post('/verify').send(VALID);
      return wait.mock.calls[0]![0];
    };
    expect(await waitedFor(0)).toBe(100);
    expect(await waitedFor(1)).toBe(1500);
  });

  it('refuses bad input with 400 before doing any work', async () => {
    const wait = vi.fn(noWait);
    const app = createMockApp({ random: healthy, wait });
    expect((await request(app).post('/verify').send({ nid: '12345', name: 'Demo Person' })).status).toBe(400);
    expect((await request(app).post('/verify').send({ nid: VALID.nid })).status).toBe(400);
    expect(wait).not.toHaveBeenCalled();
  });

  it('answers broken JSON with a short 400, no stack trace', async () => {
    const res = await request(createMockApp({ random: healthy, wait: noWait }))
      .post('/verify')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request' });
  });
});

describe('GET /health', () => {
  it('says ok', async () => {
    expect((await request(createMockApp()).get('/health')).body).toEqual({ status: 'ok' });
  });
});
