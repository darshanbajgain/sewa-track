import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { referenceRouter } from './routes/reference.routes.js';
import { requestRouter } from './routes/request.routes.js';

/**
 * Builds the Express app WITHOUT starting a server.
 *
 * Why separate from server.ts: tests (Supertest) can call createApp() and send fake
 * HTTP requests to it in memory, with no real port opened.
 *
 * Middleware runs top to bottom for every request, so ORDER MATTERS.
 */
export function createApp(): Express {
  const app = express();

  // Security headers (e.g. no "X-Powered-By: Express", no MIME sniffing, protect from web vulnerabilities like Cross-Site Scripting (XSS), clickjacking).
  app.use(helmet());
  // Give the request an id first, so everything after it (including errors) can use it.
  app.use(requestId);
  // Parse JSON bodies.
  // - limit: stops someone sending a huge body to exhaust memory.
  // - inflate: false: refuse compressed request bodies (gzip, deflate, Brotli). Our clients never
  //   send them, and decompressing attacker-controlled data is a known attack surface
  //   (e.g. CVE-2026-111497 in Node's Brotli decoder). Smaller attack surface, no downside.
  app.use(express.json({ limit: '100kb', inflate: false }));

  // All endpoints live under one versioned base path, so a future /api/v2 can live alongside it.
  const api = express.Router();
  api.use(healthRouter);
  api.use(createAuthRouter());
  api.use(referenceRouter);
  api.use(requestRouter);
  app.use('/api/v1', api);

  // These two must be LAST: nothing above matched → 404; anything threw → errorHandler.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
