import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './routes/health.routes.js';

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
  // Parse JSON bodies. The size limit stops someone sending a huge body to exhaust memory.
  app.use(express.json({ limit: '100kb' }));

  // All endpoints live under one versioned base path, so a future /api/v2 can live alongside it.
  const api = express.Router();
  api.use(healthRouter);
  app.use('/api/v1', api);

  // These two must be LAST: nothing above matched → 404; anything threw → errorHandler.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
