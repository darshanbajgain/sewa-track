import { nidVerifyRequestSchema, type NidVerifyResponse } from '@sewa/shared';
import express, { type ErrorRequestHandler, type Express } from 'express';

/**
 * A pretend "existing government ID service" (PRD F9), so the API can practise talking to an outside
 * system that is slow and sometimes down. It is a demo: no real ID data exists here, and it logs nothing
 * about the people it is asked about.
 *
 *   POST /verify { nid, name } → { match: boolean }
 *   Every call waits 100–1500 ms, and about 1 in 10 answers 503, like an unreliable service would.
 *   A demo ID ending in 0 never matches, so the "ID did not match" path can be shown on purpose.
 *
 * `random` and `wait` can be replaced, so tests are fast and give the same answer every time.
 */
export interface MockOptions {
  random?: () => number;
  wait?: (ms: number) => Promise<void>;
}

const MIN_LATENCY_MS = 100;
const MAX_LATENCY_MS = 1500;
const FAILURE_RATE = 0.1;

export function createMockApp({ random = Math.random, wait = sleep }: MockOptions = {}): Express {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/verify', async (req, res) => {
    const input = nidVerifyRequestSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    await wait(MIN_LATENCY_MS + random() * (MAX_LATENCY_MS - MIN_LATENCY_MS));
    if (random() < FAILURE_RATE) {
      res.status(503).json({ error: 'Service temporarily unavailable' });
      return;
    }

    const answer: NidVerifyResponse = { match: !input.data.nid.endsWith('0') };
    res.json(answer);
  });

  app.use(handleBadBody);
  return app;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Broken JSON and the like: a short 400, never Express's default page with a stack trace. */
const handleBadBody: ErrorRequestHandler = (_err, _req, res, _next) => {
  res.status(400).json({ error: 'Invalid request' });
};
