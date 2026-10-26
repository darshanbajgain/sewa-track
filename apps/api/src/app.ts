import express, { type Express } from 'express';
import helmet from 'helmet';
import { ConsoleNotifier, type Notifier } from './integrations/notifier.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { referenceRouter } from './routes/reference.routes.js';
import { requestRouter } from './routes/request.routes.js';
import { createTrackingRouter } from './routes/tracking.routes.js';

/**
 * Builds the Express app WITHOUT starting a server.
 *
 * Why separate from server.ts: tests (Supertest) can call createApp() and send fake
 * HTTP requests to it in memory, with no real port opened.
 *
 * Middleware runs top to bottom for every request, so ORDER MATTERS.
 *
 * `deps` = outside services the app uses. Production gets the real ones by default; tests pass
 * fakes (e.g. a notifier that records calls). This is dependency injection.
 */
export interface AppDeps {
  notifier: Notifier;
}

export function createApp(deps: AppDeps = { notifier: new ConsoleNotifier() }): Express {
  const app = express();
  // app.locals is Express' place for app-wide values; controllers read the notifier from here.
  app.locals.notifier = deps.notifier;

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
  api.use(createTrackingRouter());
  app.use('/api/v1', api);

  // These two must be LAST: nothing above matched → 404; anything threw → errorHandler.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
