import { nidVerifyResponseSchema, type NidVerifyRequest } from '@sewa/shared';
import { AppError } from '../errors.js';

/**
 * Talks to the National ID service (PRD F9; in this demo, apps/nid-mock).
 *
 * An outside service can be slow or down, so every call is limited:
 *   - each attempt gets 2 s, then it is cancelled (one hung call must not hold us up forever)
 *   - a timeout, a network error or a 5xx is retried twice, waiting 200 ms and then 400 ms
 *     ("exponential backoff": a service that is struggling gets more room each time)
 *   - any other answer won't change if we ask again (e.g. 400, or a reply in the wrong shape): no retry
 * If it still fails → AppError UPSTREAM_UNAVAILABLE, with the number of attempts in `details`.
 *
 * An INTERFACE like Notifier, so tests and other deployments can provide their own.
 * Nothing about the person is ever logged or put in an error (hard rule 5).
 */
export interface NidResult {
  match: boolean;
  attempts: number; // 1 = answered first time
  responseMs: number; // how long the answering attempt took
}

export interface NidClient {
  verify(person: NidVerifyRequest): Promise<NidResult>;
}

const TIMEOUT_MS = 2_000;
const RETRY_DELAYS_MS = [200, 400];

type Attempt = { outcome: 'answered'; match: boolean; responseMs: number } | { outcome: 'retry' } | { outcome: 'give-up' };

export class HttpNidClient implements NidClient {
  private readonly url: URL;
  private readonly fetchFn: typeof fetch;

  constructor(baseUrl: string, fetchFn: typeof fetch = fetch) {
    this.url = new URL('/verify', baseUrl);
    this.fetchFn = fetchFn;
  }

  async verify(person: NidVerifyRequest): Promise<NidResult> {
    const maxAttempts = RETRY_DELAYS_MS.length + 1;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts += 1;
      const attempt = await this.callOnce(person);
      if (attempt.outcome === 'answered') {
        return { match: attempt.match, attempts, responseMs: attempt.responseMs };
      }
      if (attempt.outcome === 'give-up') break;
      if (attempts < maxAttempts) await sleep(RETRY_DELAYS_MS[attempts - 1]!);
    }

    throw new AppError('UPSTREAM_UNAVAILABLE', 'The National ID service is not available', { attempts });
  }

  private async callOnce(person: NidVerifyRequest): Promise<Attempt> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(person),
        signal: controller.signal,
      });
      if (response.status >= 500) return { outcome: 'retry' };
      if (!response.ok) return { outcome: 'give-up' };

      // Reading the body is inside the timeout too: a service can send headers and then hang.
      const body = nidVerifyResponseSchema.safeParse(await response.json());
      if (!body.success) return { outcome: 'give-up' }; // the service broke the contract
      return { outcome: 'answered', match: body.data.match, responseMs: Date.now() - started };
    } catch (err) {
      // Broken JSON is a wrong answer, not a passing network problem.
      return err instanceof SyntaxError ? { outcome: 'give-up' } : { outcome: 'retry' };
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
