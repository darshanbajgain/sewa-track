import { nidVerifyRequestSchema } from '@sewa/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors.js';
import { HttpNidClient } from './nidClient.js';

/** Fake timers: the 2 s timeout and the backoff run instantly, and we can check their exact timing. */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const PERSON = { nid: 'DEMO-1234567', name: 'Demo Person' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const MATCH = () => json(200, { match: true });
const DOWN = () => json(503, { error: 'unavailable' });

/** A fetch stub that gives these responses in order. */
function stubFetch(...responses: (() => Response)[]) {
  return vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('fetch called too many times');
    return next();
  });
}

/** A call that never answers, and is rejected only when the client cancels it (like real fetch). */
const hang: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

const client = (fetchFn: typeof fetch) => new HttpNidClient('http://nid.test', fetchFn);

/** Runs verify() to the end, letting all timers fire. Returns the result, or the error it threw. */
async function run(fetchFn: typeof fetch) {
  const settled = client(fetchFn).verify(PERSON).catch((err: unknown) => err);
  await vi.runAllTimersAsync();
  return settled;
}

describe('contract with the ID service', () => {
  it('sends POST /verify with exactly the JSON the contract defines', async () => {
    const fetchFn = stubFetch(MATCH);
    await run(fetchFn);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('http://nid.test/verify');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const sent = JSON.parse(init!.body as string);
    expect(nidVerifyRequestSchema.parse(sent)).toEqual(PERSON);
    expect(sent).toEqual(PERSON); // nothing extra is sent
  });

  it.each([true, false])('returns the answer match=%s after one attempt', async (match) => {
    expect(await run(stubFetch(() => json(200, { match })))).toMatchObject({ match, attempts: 1 });
  });

  it('treats a reply in the wrong shape as a failure and does not retry', async () => {
    const fetchFn = stubFetch(() => json(200, { matched: 'yes' }));
    expect(await run(fetchFn)).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', details: { attempts: 1 } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('treats broken JSON the same way', async () => {
    const fetchFn = stubFetch(() => new Response('<html>oops</html>', { status: 200 }));
    expect(await run(fetchFn)).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', details: { attempts: 1 } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('retries', () => {
  it('retries a 503 and returns the later answer', async () => {
    const fetchFn = stubFetch(DOWN, MATCH);
    expect(await run(fetchFn)).toMatchObject({ match: true, attempts: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('waits exactly 200 ms, then 400 ms, between attempts', async () => {
    const fetchFn = stubFetch(DOWN, DOWN, MATCH);
    const result = client(fetchFn).verify(PERSON);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(399);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);

    expect(await result).toMatchObject({ attempts: 3 });
  });

  it('gives up after 3 attempts with UPSTREAM_UNAVAILABLE', async () => {
    const fetchFn = stubFetch(DOWN, DOWN, DOWN);
    const err = await run(fetchFn);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', status: 503, details: { attempts: 3 } });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('retries network errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(MATCH());
    expect(await run(fetchFn)).toMatchObject({ match: true, attempts: 2 });
  });

  it('does not retry a 400: asking again would get the same answer', async () => {
    const fetchFn = stubFetch(() => json(400, { error: 'Invalid request' }));
    expect(await run(fetchFn)).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', details: { attempts: 1 } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('timeout', () => {
  it('cancels a hung call after exactly 2 s and moves on to the next attempt', async () => {
    const fetchFn = vi.fn(hang);
    const result = client(fetchFn).verify(PERSON).catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchFn.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn.mock.calls[0]![1]!.signal!.aborted).toBe(true);

    await vi.runAllTimersAsync();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(await result).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', details: { attempts: 3 } });
  });

  it('takes at most 2 + 0.2 + 2 + 0.4 + 2 = 6.6 s in total', async () => {
    const started = Date.now();
    await run(vi.fn(hang));
    expect(Date.now() - started).toBe(6_600);
  });

  it('also covers a body that never finishes arriving', async () => {
    const stalledBody = (_url: unknown, init?: RequestInit) =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
      } as Response);
    const started = Date.now();
    expect(await run(vi.fn(stalledBody))).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', details: { attempts: 3 } });
    expect(Date.now() - started).toBe(6_600);
  });

  it('reports how long the answering attempt took', async () => {
    const slow: typeof fetch = () => new Promise((resolve) => setTimeout(() => resolve(MATCH()), 750));
    expect(await run(slow)).toMatchObject({ attempts: 1, responseMs: 750 });
  });
});

describe('privacy', () => {
  it('never puts the name or ID in the error', async () => {
    const err = await run(stubFetch(DOWN, DOWN, DOWN));
    expect(JSON.stringify({ message: (err as AppError).message, details: (err as AppError).details })).not.toMatch(/DEMO-|Demo Person/);
  });
});
